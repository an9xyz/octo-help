import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bumpMentionTarget,
  cachedMentionTargets,
  clearMentionTargets,
  fetchMentionTargets,
  scoreMentionTargets,
} from './octoMentionTargets';

const ME = 'me';
const session = { sid: 's', token: 'T', uid: ME };

/** One history record, shaped like `message/channel/sync` returns it. */
function msg(seq: number, from: string, mentionUids?: string[]) {
  return {
    from_uid: from,
    message_seq: seq,
    payload: mentionUids ? { type: 1, mention: { uids: mentionUids } } : { type: 1 },
  };
}

beforeEach(() => {
  clearMentionTargets();
});

describe('scoreMentionTargets', () => {
  it('counts everyone\u2019s mentions, not only the user\u2019s own', () => {
    // Measured on real groups: the top target was mentioned 19 times in a window
    // where the user themselves mentioned it once. Scoring only the user's messages
    // throws away the sample that makes the ranking stable.
    const scores = scoreMentionTargets(
      [msg(1, 'someoneElse', ['bot']), msg(2, 'thirdParty', ['bot'])],
      ME,
    );
    expect(scores.get('bot')).toBeGreaterThan(0);
  });

  it('weights the user\u2019s own mentions double', () => {
    // "Who I ping" beats "who the group pings" when we have evidence of both.
    const mine = scoreMentionTargets([msg(10, ME, ['a'])], ME).get('a')!;
    const theirs = scoreMentionTargets([msg(10, 'other', ['a'])], ME).get('a')!;
    expect(mine).toBeCloseTo(theirs * 2);
  });

  it('weights recent mentions roughly twice as heavily as the oldest', () => {
    // Habits move: whoever the group pinged a month ago should not outrank today.
    const scores = scoreMentionTargets(
      [msg(100, 'other', ['old']), msg(200, 'other', ['new'])],
      ME,
    );
    expect(scores.get('new')).toBeCloseTo(2);
    expect(scores.get('old')).toBeCloseTo(1);
  });

  it('still prefers repeated targets over a single fresh one', () => {
    const scores = scoreMentionTargets(
      [msg(10, 'a', ['repeat']), msg(11, 'b', ['repeat']), msg(12, 'c', ['once'])],
      ME,
    );
    expect(scores.get('repeat')!).toBeGreaterThan(scores.get('once')!);
  });

  it('never offers a shortcut to @ yourself', () => {
    const scores = scoreMentionTargets([msg(1, 'other', [ME, 'bot'])], ME);
    expect(scores.has(ME)).toBe(false);
    expect(scores.has('bot')).toBe(true);
  });

  it('counts every target of a multi-mention message', () => {
    const scores = scoreMentionTargets([msg(5, 'other', ['a', 'b'])], ME);
    expect(scores.get('a')).toBeCloseTo(scores.get('b')!);
  });

  it('returns nothing for an empty window or messages without mentions', () => {
    expect(scoreMentionTargets([], ME).size).toBe(0);
    expect(scoreMentionTargets([msg(1, ME)], ME).size).toBe(0);
  });
});

describe('fetchMentionTargets', () => {
  const ok = (messages: unknown[]) => new Response(JSON.stringify({ messages }), { status: 200 });

  it('walks history backwards and scores what it finds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([msg(200, 'x', ['bot']), msg(201, 'y'), msg(202, 'z', ['bot'])]))
      .mockResolvedValueOnce(ok([msg(100, 'x', ['human'])]));
    const scores = await fetchMentionTargets('c1', 2, session, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(scores.get('bot')!).toBeGreaterThan(scores.get('human')!);

    // First page starts at the newest (0), the second continues below the oldest seq
    // of the first — otherwise we would read the same page twice.
    const bodies = fetchImpl.mock.calls.map((call) =>
      JSON.parse((call[1] as RequestInit).body as string),
    );
    expect(bodies[0]).toMatchObject({
      channel_id: 'c1',
      channel_type: 2,
      start_message_seq: 0,
      pull_mode: 0,
    });
    expect(bodies[1].start_message_seq).toBe(199);
  });

  it('caches, and answers from cache without a request', async () => {
    const fetchImpl = vi.fn(async () => ok([msg(10, 'x', ['bot'])]));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    await fetchMentionTargets('c2', 2, session, opts);
    const afterFirst = fetchImpl.mock.calls.length;
    await fetchMentionTargets('c2', 2, session, opts);
    expect(fetchImpl.mock.calls.length).toBe(afterFirst);
    expect(cachedMentionTargets('c2').get('bot')).toBeGreaterThan(0);
  });

  it('keeps picks made before mining finished', async () => {
    // The user's pick is not in history yet; dropping it would reshuffle the strip
    // right after they used it.
    bumpMentionTarget('c3', 'justClicked');
    const fetchImpl = vi.fn(async () => ok([msg(10, 'x', ['bot'])]));
    const scores = await fetchMentionTargets('c3', 2, session, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(scores.get('justClicked')!).toBeGreaterThan(scores.get('bot')!);
  });

  it('never throws \u2014 a failed mining run just means default ordering', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      fetchMentionTargets('c4', 2, session, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual(new Map());
  });

  it('does nothing without a session or channel', async () => {
    const fetchImpl = vi.fn();
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await fetchMentionTargets('', 2, session, opts)).toEqual(new Map());
    expect(await fetchMentionTargets('c5', 2, null, opts)).toEqual(new Map());
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
