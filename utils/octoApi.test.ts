import { describe, expect, it, vi } from 'vitest';
import {
  OctoApiError,
  octoApiGet,
  readOctoSession,
  toOctoApiError,
  type StorageLike,
} from './octoApi';

/** sessionStorage/localStorage stub. */
function storage(entries: Record<string, string>): StorageLike {
  return { getItem: (key) => (key in entries ? entries[key] : null) };
}

describe('readOctoSession', () => {
  it('picks the token belonging to this tab session id', () => {
    // The real failure this prevents: one browser holding three logins. Keying off
    // the tab's own sid is the only thing that keeps us acting as the right user.
    const session = readOctoSession(
      storage({ 'octo.session.sid': 'h49ods', tokenh49ods: 'T-right', uidh49ods: 'U-right' }),
      storage({ tokenh49ods: 'T-right', tokenu8h1fw: 'T-other', tokena05pk4: 'T-third' }),
    );
    expect(session).toEqual({ sid: 'h49ods', token: 'T-right', uid: 'U-right' });
  });

  it('falls back to localStorage, which Octo mirrors the token into', () => {
    const session = readOctoSession(
      storage({ 'octo.session.sid': 'abc' }),
      storage({ tokenabc: 'T', uidabc: 'U' }),
    );
    expect(session).toEqual({ sid: 'abc', token: 'T', uid: 'U' });
  });

  it('treats an empty sid as valid but a missing token as logged out', () => {
    expect(readOctoSession(storage({ token: 'T' }))).toEqual({ sid: '', token: 'T', uid: '' });
    expect(readOctoSession(storage({ 'octo.session.sid': 'abc' }))).toBeNull();
    expect(readOctoSession(undefined)).toBeNull();
  });
});

describe('toOctoApiError', () => {
  it('prefers the nested http_status over the wire status', () => {
    // Measured: asking for a group you are not in answers HTTP 400 with a 403
    // inside. Classifying on the wire status alone would call it "bad request"
    // and retry forever.
    const error = toOctoApiError(400, {
      error: { code: 'err.server.group.view_forbidden', message: '你没有权限查看。', http_status: 403 },
      msg: '你没有权限查看。',
      status: 400,
    });
    expect(error.status).toBe(403);
    expect(error.isForbidden).toBe(true);
    expect(error.isAuthError).toBe(false);
    expect(error.message).toBe('你没有权限查看。');
  });

  it('recognizes the missing-token error, which is what a cookie-only call gets', () => {
    const error = toOctoApiError(401, {
      error: { code: 'err.shared.auth.token_missing', message: 'token不能为空，请先登录！' },
    });
    expect(error.isAuthError).toBe(true);
    expect(error.isForbidden).toBe(false);
  });

  it('survives a non-JSON / empty body', () => {
    const error = toOctoApiError(502, null);
    expect(error.status).toBe(502);
    expect(error.message).toBe('HTTP 502');
  });
});

describe('octoApiGet', () => {
  const session = { sid: 's', token: 'T', uid: 'U' };

  it('sends the token header to a same-origin /api/v1/ path', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ uid: 'a' }]), { status: 200 }));
    const data = await octoApiGet<{ uid: string }[]>('groups/g/membersync?version=0', session, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(data).toEqual([{ uid: 'a' }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/groups/g/membersync?version=0');
    expect((init.headers as Record<string, string>).token).toBe('T');
    expect(init.method).toBe('GET');
  });

  it('refuses an absolute URL', async () => {
    // Structural guard: the token is an account-wide credential, so the base URL
    // must not be something a caller can redirect to another host.
    await expect(
      octoApiGet('https://evil.example/steal', session, {
        fetchImpl: (() => {
          throw new Error('must not be called');
        }) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(OctoApiError);
  });

  it('maps a failed response to a typed error', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'err.shared.auth.token_missing' } }), {
          status: 401,
        }),
    );
    await expect(
      octoApiGet('groups/g/membersync', session, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ name: 'OctoApiError', status: 401 });
  });
});
