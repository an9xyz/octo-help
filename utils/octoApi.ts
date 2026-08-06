/**
 * Read-only client for Octo's own HTTP API.
 *
 * Why this exists: several features need facts the rendered DOM does not carry
 * (who is in this group, what a UID's display name is). Reading them out of
 * React internals is a guess about someone else's private structure; the API is
 * the same contract Octo's own client is built on, and when it changes it fails
 * loudly with a status code instead of silently returning undefined.
 *
 * ## Auth is a header, not a cookie (measured, not assumed)
 *
 * Octo authenticates with a `token` *request header* (`APIClient.initAxios` in
 * octo-web injects it on every call). A request without it is rejected:
 *
 *     GET /api/v1/groups/<id>/membersync   → 401
 *     {"error":{"code":"err.shared.auth.token_missing", …}}
 *
 * That has two consequences for this extension:
 *
 *  1. The background service worker cannot do this work. It has no access to the
 *     page's storage, so "just fetch from the background, cookies ride along"
 *     does not authenticate. The token lives in the *page origin's* storage, so
 *     the request has to be issued from a context that can read it.
 *  2. The token is a bearer credential for the user's whole account. It is read
 *     on demand, kept in a local variable for the duration of one request, never
 *     persisted to extension storage, never logged, and never sent anywhere but
 *     Octo's own origin (all paths here are same-origin relative URLs).
 *
 * ## Where the token is
 *
 * `token` is stored per *session id* so one browser can hold several accounts:
 * `sessionStorage["token" + sid]`, mirrored into `localStorage` (octo-web's
 * `StorageService` cross-tab key list). `sid` itself is
 * `sessionStorage["octo.session.sid"]` — per tab, which is exactly the
 * disambiguator we need: a machine really can have three `token<sid>` entries in
 * `localStorage` (observed), and picking the wrong one would act as the wrong
 * user. So: sid from sessionStorage, token preferring sessionStorage.
 */

/** The API root. Relative on purpose — same-origin means no CORS, no host juggling. */
export const OCTO_API_BASE = '/api/v1/';

/** sessionStorage key holding the current tab's session id. */
export const OCTO_SID_KEY = 'octo.session.sid';

/** Default request timeout. Long enough for a cold group, short enough that a
 *  hung network never leaves a feature stuck "loading" forever. */
export const OCTO_API_TIMEOUT_MS = 8000;

/** Minimal storage surface, so the resolver is testable without a browser. */
export interface StorageLike {
  getItem(key: string): string | null;
}

export interface OctoSession {
  /** Session id suffix; may legitimately be an empty string. */
  sid: string;
  token: string;
  /** Logged-in user's UID. Used to keep "yourself" out of member lists. */
  uid: string;
}

/**
 * Resolve the current tab's session. Returns null when not logged in (or when
 * the page hasn't written its session yet) — callers must treat that as "this
 * feature is unavailable right now", not as an error worth surfacing.
 */
export function readOctoSession(
  session: StorageLike | undefined,
  local?: StorageLike,
): OctoSession | null {
  if (!session) return null;
  // An empty sid is valid (single-session installs), so only null/undefined
  // means "unknown".
  const sid = session.getItem(OCTO_SID_KEY) ?? '';
  const token = session.getItem(`token${sid}`) || local?.getItem(`token${sid}`) || '';
  if (!token) return null;
  const uid = session.getItem(`uid${sid}`) || local?.getItem(`uid${sid}`) || '';
  return { sid, token, uid };
}

/** Read the session from the real page storages. */
export function readPageSession(): OctoSession | null {
  try {
    return readOctoSession(window.sessionStorage, window.localStorage);
  } catch {
    // Storage can throw in hardened/partitioned contexts. Treat as logged out.
    return null;
  }
}

/**
 * An API call that did not return data, carrying enough detail to *decide* —
 * retry, give up on this channel, or disable the feature — without re-parsing
 * strings. `code` is Octo's stable error code (e.g. `err.server.group.view_forbidden`).
 */
export class OctoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OctoApiError';
  }

  /** Token missing/expired. The page will handle re-login; we just stand down. */
  get isAuthError(): boolean {
    return this.status === 401 || this.code === 'err.shared.auth.token_missing';
  }

  /**
   * "You may not look at this." Octo answers HTTP 400 with a nested 403 for a
   * group you are not in, so status alone is not enough to classify it.
   * Permanent for this resource — retrying is pure noise.
   */
  get isForbidden(): boolean {
    return (
      this.status === 403 ||
      this.code === 'err.server.group.view_forbidden' ||
      this.code?.endsWith('.view_forbidden') === true
    );
  }
}

/** Shape of Octo's error envelope (both nesting styles seen in the wild). */
interface OctoErrorBody {
  msg?: string;
  status?: number;
  error?: { code?: string; message?: string; http_status?: number };
}

/** Turn a failed response body into a typed error. */
export function toOctoApiError(httpStatus: number, body: unknown): OctoApiError {
  const envelope = (body ?? {}) as OctoErrorBody;
  const code = envelope.error?.code;
  const message = envelope.error?.message || envelope.msg || `HTTP ${httpStatus}`;
  // Prefer the *nested* status: Octo returns `400` on the wire with the real
  // 403 inside, and the nested one is what the semantics follow.
  const status = envelope.error?.http_status ?? httpStatus;
  return new OctoApiError(message, status, code);
}

export interface OctoApiOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Shared request plumbing for the read-only verbs below. */
async function octoApiRequest<T>(
  path: string,
  session: OctoSession,
  options: OctoApiOptions,
  init: Pick<RequestInit, 'method' | 'body'> & { contentType?: string },
): Promise<T> {
  if (/^[a-z]+:/i.test(path) || path.startsWith('//')) {
    throw new OctoApiError(`Refusing absolute API path: ${path}`, 0);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? OCTO_API_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Chain an externally supplied signal so a channel switch can cancel in-flight
  // work that is now for the wrong conversation.
  const external = options.signal;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort, { once: true });

  const headers: Record<string, string> = { token: session.token };
  if (init.contentType) headers['Content-Type'] = init.contentType;

  try {
    const response = await fetchImpl(`${OCTO_API_BASE}${path}`, {
      method: init.method,
      body: init.body,
      headers,
      // Never send along ambient credentials we don't need.
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw toOctoApiError(response.status, body);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * GET a JSON resource under `/api/v1/`.
 *
 * `path` is relative to the API root (e.g. `groups/x/membersync?version=0`) and
 * must never be a full URL: the token header is only ever allowed to travel to
 * Octo's own origin, and keeping the base fixed here makes that structural
 * rather than a rule someone has to remember.
 */
export async function octoApiGet<T>(
  path: string,
  session: OctoSession,
  options: OctoApiOptions = {},
): Promise<T> {
  return octoApiRequest<T>(path, session, options, { method: 'GET' });
}

/**
 * POST a JSON body and read the result.
 *
 * Only for endpoints that *read* despite being POST — Octo's message history sync
 * (`message/channel/sync`) takes its query in a body. This extension never calls a
 * mutating endpoint: it must not be able to send, revoke, or change anything on
 * the user's behalf, so every caller of this helper is a query.
 */
export async function octoApiPostQuery<T>(
  path: string,
  body: unknown,
  session: OctoSession,
  options: OctoApiOptions = {},
): Promise<T> {
  return octoApiRequest<T>(path, session, options, {
    method: 'POST',
    body: JSON.stringify(body),
    contentType: 'application/json',
  });
}
