import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cachedMemberName,
  clearMemberCache,
  fetchGroupMembers,
  maxMemberVersion,
  memberAvatarUrl,
  memberDisplayName,
  normalizeMembers,
  rankMentionCandidates,
  type RawGroupMember,
} from './octoMembers';

/** One member as the live endpoint actually returns it (trimmed). */
function raw(overrides: Partial<RawGroupMember> = {}): RawGroupMember {
  return {
    uid: 'u1',
    name: '张三',
    remark: '',
    role: 0,
    version: 1,
    is_deleted: 0,
    robot: 0,
    realname_verified: false,
    ...overrides,
  };
}

beforeEach(() => {
  clearMemberCache();
});

afterEach(() => {
  // `clearStaleness` moves the clock to expire the TTL; put it back so a later
  // test never inherits a system time from an earlier one.
  vi.useRealTimers();
});

describe('memberDisplayName', () => {
  it('follows Octo: verified real name → remark → name', () => {
    // Must match octo-web's displayName exactly: the label we insert becomes the
    // visible @text, and a different field would read differently from every
    // other place that person's name appears.
    expect(memberDisplayName(raw({ realname_verified: true, real_name: '李四', remark: 'R', name: 'N' }))).toBe('李四');
    expect(memberDisplayName(raw({ realname_verified: false, real_name: '李四', remark: 'R', name: 'N' }))).toBe('R');
    expect(memberDisplayName(raw({ remark: '', name: 'N' }))).toBe('N');
    expect(memberDisplayName(raw({ name: undefined, remark: '' }))).toBe('');
  });

  it('accepts the serialization variants the backend actually sends', () => {
    // Observed live: boolean true. Other nodes send 1 / "1" / "true" for the same
    // tinyint, and reading those as "unverified" would silently downgrade names.
    for (const verified of [true, 1, '1', 'true'] as const) {
      expect(memberDisplayName(raw({ realname_verified: verified, real_name: '李四' }))).toBe('李四');
    }
    for (const notVerified of [false, 0, '0', 'false', null, undefined] as const) {
      expect(memberDisplayName(raw({ realname_verified: notVerified, real_name: '李四', name: 'N' }))).toBe('N');
    }
  });
});

describe('normalizeMembers', () => {
  it('drops removed members, nameless records and duplicates', () => {
    // `is_deleted` is why the raw record count is higher than the member count the
    // app shows: a real group returned 35 records for 24 members. Departures ride
    // along in the sync response so clients can apply them incrementally.
    const members = normalizeMembers([
      raw({ uid: 'a', name: 'A' }),
      raw({ uid: 'b', name: 'B', is_deleted: 1 }), // left the group: cannot be mentioned
      raw({ uid: 'c', name: '' }), // nothing to show, and addMention needs a label
      raw({ uid: 'a', name: 'A again' }), // duplicate uid
      raw({ uid: 'd', name: 'D', robot: 1 }),
    ]);
    expect(members.map((m) => m.uid)).toEqual(['a', 'd']);
    expect(members.find((m) => m.uid === 'd')?.isBot).toBe(true);
  });

  it('tolerates junk entries instead of throwing mid-list', () => {
    expect(normalizeMembers([undefined as unknown as RawGroupMember, raw({ uid: 'a', name: 'A' })])).toHaveLength(1);
  });
});

describe('maxMemberVersion', () => {
  it('returns the sync cursor, 0 for an empty page', () => {
    expect(maxMemberVersion([raw({ version: 5 }), raw({ version: 1175121 })])).toBe(1175121);
    expect(maxMemberVersion([])).toBe(0);
  });
});

describe('rankMentionCandidates', () => {
  const members = normalizeMembers([
    raw({ uid: 'me', name: '我' }),
    raw({ uid: 'owner', name: '群主', role: 1 }),
    raw({ uid: 'human', name: '阿甲' }),
    raw({ uid: 'bot', name: '机器人', robot: 1 }),
    raw({ uid: 'talker', name: '刚说话的人' }),
  ]);

  it('lets who the group actually @s beat every structural rule', () => {
    // The regression this locks in: ranking humans above bots pushed the AI bot this
    // group mentions 19 times per 200 messages behind nine humans.
    const ranked = rankMentionCandidates(members, {
      recentUids: ['human', 'talker'],
      mentionScores: new Map([['bot', 9]]),
      selfUid: 'me',
    });
    expect(ranked[0].uid).toBe('bot');
  });

  it('orders several frequent targets by score', () => {
    const ranked = rankMentionCandidates(members, {
      mentionScores: new Map([
        ['human', 3],
        ['bot', 11],
      ]),
      selfUid: 'me',
    });
    expect(ranked.slice(0, 2).map((m) => m.uid)).toEqual(['bot', 'human']);
  });

  it('puts the most recent speaker first and never lists yourself', () => {
    const ranked = rankMentionCandidates(members, {
      recentUids: ['human', 'talker'], // oldest → newest
      selfUid: 'me',
    });
    expect(ranked.map((m) => m.uid)).toEqual(['talker', 'human', 'owner', 'bot']);
  });

  it('ranks humans above bots when nobody has spoken', () => {
    // Real groups are bot-heavy (observed 15 of 24 live members); without this the
    // strip would open with a wall of robots.
    const ranked = rankMentionCandidates(members, { selfUid: 'me' });
    expect(ranked.map((m) => m.uid)).toEqual(['owner', 'human', 'talker', 'bot']);
  });

  it('returns the whole roster by default — the strip is not a top-N list', () => {
    // The app's own member panel says 「查看全部 24 名成员」; a silent cap here was
    // what made our strip look like the API had returned fewer people.
    expect(rankMentionCandidates(members, { selfUid: 'me' })).toHaveLength(members.length - 1);
  });

  it('honours the limit', () => {
    expect(rankMentionCandidates(members, { selfUid: 'me', limit: 2 })).toHaveLength(2);
  });
});

describe('memberAvatarUrl', () => {
  it('uses the same endpoint Octo renders avatars from', () => {
    expect(memberAvatarUrl('u1')).toBe('/api/v1/users/u1/avatar');
    expect(memberAvatarUrl('a/b')).toBe('/api/v1/users/a%2Fb/avatar');
  });
});

describe('fetchGroupMembers', () => {
  const session = { sid: 's', token: 'T', uid: 'me' };
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('syncs, caches and answers name lookups synchronously afterwards', async () => {
    const fetchImpl = vi.fn(async () => ok([raw({ uid: 'a', name: '阿甲' })]));
    const members = await fetchGroupMembers('g1', session, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(members.map((m) => m.label)).toEqual(['阿甲']);
    // Callers inside a synchronous DOM pass cannot await, so this must not either.
    expect(cachedMemberName('g1', 'a')).toBe('阿甲');
    expect(cachedMemberName('g1', 'nobody')).toBeUndefined();

    await fetchGroupMembers('g1', session, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // served from cache
  });

  it('keeps the roster when an incremental sync returns nothing', async () => {
    // Verified against the live endpoint: passing the highest known version
    // answers `[]`. Treating that as "the group is empty" would blank the strip.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([raw({ uid: 'a', name: '阿甲', version: 10 })]))
      .mockResolvedValueOnce(ok([]));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    await fetchGroupMembers('g2', session, opts);
    clearStaleness('g2');
    const again = await fetchGroupMembers('g2', session, opts);
    expect(again.map((m) => m.uid)).toEqual(['a']);
    const url = (fetchImpl.mock.calls[1] as unknown as [string])[0];
    expect(url).toContain('version=10'); // cursor advanced
  });

  it('merges changed members and applies removals', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([raw({ uid: 'a', name: '阿甲', version: 1 }), raw({ uid: 'b', name: '阿乙', version: 2 })]))
      .mockResolvedValueOnce(ok([raw({ uid: 'a', name: '阿甲改名', version: 3 }), raw({ uid: 'b', is_deleted: 1, version: 4 })]));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    await fetchGroupMembers('g3', session, opts);
    clearStaleness('g3');
    const merged = await fetchGroupMembers('g3', session, opts);
    expect(merged.map((m) => `${m.uid}:${m.label}`)).toEqual(['a:阿甲改名']);
  });

  it('gives up on a group it may not view, but retries a network blip', async () => {
    const forbidden = () =>
      new Response(
        JSON.stringify({ error: { code: 'err.server.group.view_forbidden', http_status: 403 } }),
        { status: 400 },
      );
    const fetchImpl = vi.fn(async () => forbidden());
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await fetchGroupMembers('g4', session, opts)).toEqual([]);
    expect(await fetchGroupMembers('g4', session, opts)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // permanent: asked once

    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(ok([raw({ uid: 'z', name: '阿仄' })]));
    const flakyOpts = { fetchImpl: flaky as unknown as typeof fetch };
    expect(await fetchGroupMembers('g5', session, flakyOpts)).toEqual([]);
    expect((await fetchGroupMembers('g5', session, flakyOpts)).map((m) => m.uid)).toEqual(['z']);
  });

  it('does nothing without a session or group', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchGroupMembers('g6', null, { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual([]);
    expect(await fetchGroupMembers('', session, { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

/**
 * Force the next call to re-sync. The TTL is wall-clock, and faking timers around
 * awaited fetches is more fragile than nudging the cache the tests already own.
 */
function clearStaleness(groupId: string): void {
  void groupId;
  vi.setSystemTime(Date.now() + 10 * 60 * 1000);
}
