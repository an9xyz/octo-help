import { describe, it, expect } from 'vitest';
import {
  listBotGroups,
  listGroupThreads,
  sendBotGroupMessage,
  sendBotMessage,
  OctoBotApiError,
  CHANNEL_TYPE_GROUP,
  CHANNEL_TYPE_THREAD,
} from './octoBotApi';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('octoBotApi', () => {
  it('sends Bearer auth and parses the group list', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>).Authorization;
      return jsonResponse([
        { group_no: 'g1', name: 'Alpha', space_id: 's1' },
        { name: 'no-id — dropped' },
      ]);
    }) as unknown as typeof fetch;

    const groups = await listBotGroups('https://x.test/', 'bf_tok', { fetchImpl });
    expect(seenUrl).toBe('https://x.test/v1/bot/groups'); // trailing slash normalized
    expect(seenAuth).toBe('Bearer bf_tok');
    expect(groups).toEqual([{ group_no: 'g1', name: 'Alpha', space_id: 's1' }]);
  });

  it('posts channel_type=2 group payload', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return jsonResponse({ message_id: 42, message_seq: 7 });
    }) as unknown as typeof fetch;

    const res = await sendBotGroupMessage('https://x.test', 'bf_tok', 'g1', 'hi', { fetchImpl });
    expect(body.channel_id).toBe('g1');
    expect(body.channel_type).toBe(CHANNEL_TYPE_GROUP);
    expect(body.payload).toEqual({ type: 1, content: 'hi' });
    expect(res.message_id).toBe(42);
  });

  it('lists threads and sends to a thread channel with type 5', async () => {
    const fetchImpl = (async (_url: string) =>
      jsonResponse([
        { short_id: 's1', group_no: 'g1', channel_id: 'g1____s1', name: '子区A' },
        { name: 'no channel_id — dropped' },
      ])) as unknown as typeof fetch;
    const threads = await listGroupThreads('https://x.test', 'bf_tok', 'g1', { fetchImpl });
    expect(threads).toEqual([
      { short_id: 's1', group_no: 'g1', channel_id: 'g1____s1', name: '子区A' },
    ]);

    let body: Record<string, unknown> = {};
    const sendImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return jsonResponse({ message_id: 9 });
    }) as unknown as typeof fetch;
    await sendBotMessage('https://x.test', 'bf_tok', 'g1____s1', CHANNEL_TYPE_THREAD, 'hi', {
      fetchImpl: sendImpl,
    });
    expect(body.channel_id).toBe('g1____s1');
    expect(body.channel_type).toBe(CHANNEL_TYPE_THREAD);
  });

  it('throws a typed error carrying status and code', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: { code: 'err.auth', message: 'bad token' } }, false, 401)) as unknown as typeof fetch;
    await expect(listBotGroups('https://x.test', 'bad', { fetchImpl })).rejects.toMatchObject({
      constructor: OctoBotApiError,
      status: 401,
      code: 'err.auth',
      message: 'bad token',
    });
  });
});
