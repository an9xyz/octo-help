/**
 * Minimal WRITE client for Octo's Bot REST API (the same surface octo-cli uses).
 *
 * Unlike utils/octoApi.ts — which is read-only, same-origin, and authenticates
 * with the page session's `token` header — this talks to the Bot gateway with a
 * user-supplied **bot token** via `Authorization: Bearer`. It exists to test the
 * end-to-end path: list the bot's groups, then make the bot speak in one.
 *
 * Auth/route facts verified against Mininglamp-OSS/octo-cli:
 *   - Bearer header:           internal/client/client.go:954
 *   - Base URL default:        internal/config/config.go:31  (https://im.deepminer.com.cn)
 *   - GET  /v1/bot/groups:     specs/group.json   → [{group_no, name, space_id}]
 *   - POST /v1/bot/sendMessage:specs/message.json → {channel_id, channel_type, payload}
 *
 * Group send (channel_type=2) requires a **User Bot** token (bf_); App Bot
 * (app_) is DM-only and the server rejects it.
 */

export const OCTO_BOT_API_DEFAULT_BASE = 'https://im.deepminer.com.cn';

/** channel_type: 1=DM, 2=group, 5=thread (message.json). */
export const CHANNEL_TYPE_DM = 1;
export const CHANNEL_TYPE_GROUP = 2;
export const CHANNEL_TYPE_THREAD = 5;

export interface BotIdentity {
  robot_id: string;
  name: string;
  owner_uid: string;
  /** DM channel to the bot's owner — a target that always exists, for self-tests. */
  owner_channel_id: string;
}

export interface OctoGroup {
  group_no: string;
  name: string;
  space_id?: string;
}

/** A thread (子区) inside a group. `channel_id` is the `{group_no}____{short_id}`
 *  composite used as the send target with channel_type=5 (verified live). */
export interface OctoThread {
  short_id: string;
  group_no: string;
  channel_id: string;
  name: string;
  member_count?: number;
  message_count?: number;
}

export class OctoBotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OctoBotApiError';
  }
}

interface BotRequestOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10000;

/** Strip a trailing slash so `${base}/v1/...` never doubles up. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function botRequest<T>(
  baseUrl: string,
  path: string,
  token: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
  options: BotRequestOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${normalizeBase(baseUrl)}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const parsed = text ? safeJson(text) : null;
    if (!response.ok) {
      const env = (parsed ?? {}) as {
        msg?: string;
        error?: { code?: string; message?: string };
      };
      throw new OctoBotApiError(
        env.error?.message || env.msg || `HTTP ${response.status}`,
        response.status,
        env.error?.code,
      );
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof OctoBotApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OctoBotApiError('请求超时', 0);
    }
    throw new OctoBotApiError(err instanceof Error ? err.message : '网络请求失败', 0);
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Authenticate the bot and read its identity. Routes by token prefix (app_ =
 * App Bot, bf_ = User Bot). owner_channel_id is a DM channel that always exists,
 * so it doubles as a zero-setup send target for connectivity tests.
 */
export async function registerBot(
  baseUrl: string,
  token: string,
  options: BotRequestOptions = {},
): Promise<BotIdentity> {
  return botRequest<BotIdentity>(baseUrl, '/v1/bot/register', token, { method: 'POST', body: {} }, options);
}

/** List groups the bot is a member of. Returns [] when the bot is in none
 *  (the API answers `null`, not `[]`, in that case). */
export async function listBotGroups(
  baseUrl: string,
  token: string,
  options: BotRequestOptions = {},
): Promise<OctoGroup[]> {
  const data = await botRequest<unknown>(baseUrl, '/v1/bot/groups', token, { method: 'GET' }, options);
  if (!Array.isArray(data)) return [];
  return data.filter(
    (g): g is OctoGroup => !!g && typeof (g as OctoGroup).group_no === 'string',
  );
}

/** List threads (子区) in a group. Empty array when the group has none. */
export async function listGroupThreads(
  baseUrl: string,
  token: string,
  groupNo: string,
  options: BotRequestOptions = {},
): Promise<OctoThread[]> {
  const data = await botRequest<unknown>(
    baseUrl,
    `/v1/bot/groups/${encodeURIComponent(groupNo)}/threads`,
    token,
    { method: 'GET' },
    options,
  );
  if (!Array.isArray(data)) return [];
  return data.filter(
    (t): t is OctoThread => !!t && typeof (t as OctoThread).channel_id === 'string',
  );
}

/** Send a plain-text message to any channel as the bot. Returns the server result. */
export async function sendBotMessage(
  baseUrl: string,
  token: string,
  channelId: string,
  channelType: number,
  text: string,
  options: BotRequestOptions = {},
): Promise<{ message_id?: number; message_seq?: number; client_msg_no?: string }> {
  return botRequest(
    baseUrl,
    '/v1/bot/sendMessage',
    token,
    {
      method: 'POST',
      body: {
        channel_id: channelId,
        channel_type: channelType,
        payload: { type: 1, content: text },
      },
    },
    options,
  );
}

/** Send a plain-text message to a group as the bot. */
export function sendBotGroupMessage(
  baseUrl: string,
  token: string,
  groupNo: string,
  text: string,
  options: BotRequestOptions = {},
) {
  return sendBotMessage(baseUrl, token, groupNo, CHANNEL_TYPE_GROUP, text, options);
}

// ─── Interactive Card (payload.type=17, Adaptive Cards 1.5) ──────────────────
// Verified live against im.deepminer.com.cn: GET /v1/bot/card/profile reports
// card_enabled; sending payload {type:17, card:<AC1.5 JSON>, profile:'octo/v1',
// card_version:'1.5', plain:<fallback>} returns a message_id. type 17 is the
// InteractiveCard (≠ type 7 名片/contact card).

export const CARD_PROFILE_DISPLAY = 'octo/v1';
export const CARD_VERSION = '1.5';

/** Does this bot/server have cards enabled? Feature-detect before sending one. */
export async function getCardEnabled(
  baseUrl: string,
  token: string,
  options: BotRequestOptions = {},
): Promise<boolean> {
  try {
    const res = await botRequest<{ enabled?: boolean; config?: { card_enabled?: boolean } }>(
      baseUrl,
      '/v1/bot/card/profile',
      token,
      { method: 'GET' },
      options,
    );
    return res?.enabled !== false && res?.config?.card_enabled !== false;
  } catch {
    return false;
  }
}

/** Send an Adaptive Cards 1.5 display card (payload.type=17). `plain` is the
 *  old-client fallback text (server recomputes it authoritatively). */
export async function sendBotCard(
  baseUrl: string,
  token: string,
  channelId: string,
  channelType: number,
  card: Record<string, unknown>,
  plain: string,
  options: BotRequestOptions = {},
): Promise<{ message_id?: number }> {
  return botRequest(
    baseUrl,
    '/v1/bot/sendMessage',
    token,
    {
      method: 'POST',
      body: {
        channel_id: channelId,
        channel_type: channelType,
        payload: { type: 17, card, profile: CARD_PROFILE_DISPLAY, card_version: CARD_VERSION, plain },
      },
    },
    options,
  );
}

// ─── Docs (剪存到文档) ────────────────────────────────────────────────
// Verified live: body edits go through GET .../content (ProseMirror doc JSON +
// opaque baseVersion) then PATCH .../content with If-Match + block ops. Append
// = insert at {path:[], position:'inside_end'}. Stale baseVersion → 412.

export interface DocMeta {
  docId: string;
  title?: string;
  shareUrl?: string;
}

/** ProseMirror block node (paragraph/heading/etc). */
export type DocBlock = Record<string, unknown>;

/** Create an empty doc; caller becomes owner. */
export async function createDoc(
  baseUrl: string,
  token: string,
  title: string,
  options: BotRequestOptions = {},
): Promise<DocMeta> {
  return botRequest<DocMeta>(baseUrl, '/v1/bot/docs', token, { method: 'POST', body: { title } }, options);
}

interface DocContent {
  doc: { type: string; content?: unknown[] };
  baseVersion: string;
}

/** Read a doc's live body + base-version token. */
export async function getDocContent(
  baseUrl: string,
  token: string,
  docId: string,
  options: BotRequestOptions = {},
): Promise<DocContent> {
  return botRequest<DocContent>(
    baseUrl,
    `/v1/bot/docs/${encodeURIComponent(docId)}/content`,
    token,
    { method: 'GET' },
    options,
  );
}

/**
 * Append blocks to the end of a doc under the optimistic-concurrency guard,
 * re-reading and retrying once on a 412 stale base version (a concurrent edit
 * moved the body between our read and write).
 */
export async function appendDocBlocks(
  baseUrl: string,
  token: string,
  docId: string,
  blocks: DocBlock[],
  options: BotRequestOptions = {},
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { baseVersion } = await getDocContent(baseUrl, token, docId, options);
    try {
      await botRequest(
        baseUrl,
        `/v1/bot/docs/${encodeURIComponent(docId)}/content`,
        token,
        {
          method: 'PATCH',
          headers: { 'If-Match': baseVersion },
          body: { ops: [{ type: 'insert', at: { path: [], position: 'inside_end' }, content: blocks }] },
        },
        options,
      );
      return;
    } catch (err) {
      // 412 base_version_stale → re-read and retry; anything else propagates.
      if (err instanceof OctoBotApiError && err.status === 412 && attempt < 2) continue;
      throw err;
    }
  }
}

/** Max clipped text kept per block, to stay under the op-content size gate. */
const MAX_CLIP_CHARS = 20000;

/**
 * Build the ProseMirror blocks for one clip: the selected text as a paragraph,
 * then a source line with the page title linked to its URL and a timestamp.
 */
export function buildClipBlocks(text: string, url: string, title: string, now = new Date()): DocBlock[] {
  const clipped =
    text.length > MAX_CLIP_CHARS ? `${text.slice(0, MAX_CLIP_CHARS)}…（已截断）` : text;
  const stamp = now.toLocaleString('zh-CN', { hour12: false });
  const sourceInline: DocBlock[] = [{ type: 'text', text: '来源：' }];
  const label = title.trim() || url;
  if (url) {
    sourceInline.push({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] });
  } else {
    sourceInline.push({ type: 'text', text: label });
  }
  sourceInline.push({ type: 'text', text: `  ·  ${stamp}` });
  return [
    { type: 'paragraph', content: [{ type: 'text', text: clipped }] },
    { type: 'paragraph', content: sourceInline },
  ];
}
