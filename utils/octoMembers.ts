/**
 * Group members, straight from Octo's own member-sync endpoint.
 *
 * Endpoint: `GET /api/v1/groups/{groupId}/membersync?version={v}&limit={n}`
 *
 * This is the call Octo's own client makes for every group it opens (it backs the
 * WuKongIM SDK's `syncSubscribersCallback`), which is why it is the right one to
 * borrow: every ordinary member is allowed to make it, and the payload is the
 * authoritative member record rather than whatever happens to be on screen.
 *
 * Measured against the live deployment: 200 OK, 71 members in ~30 ms, and
 * `X-Space-Id` is *not* required (the group id already carries its space).
 * `version` is an incremental cursor — passing the highest version we have seen
 * returns `[]` when nothing changed, so refreshing a cached group is nearly free.
 *
 * Threads (子区) have no member list of their own; Octo resolves them against the
 * parent group, and so do we (see `groupIdOfChannel` in octoChannelContext).
 */

import { OctoApiError, octoApiGet, type OctoApiOptions, type OctoSession } from './octoApi';

/**
 * Wire shape of one member. Only the fields we actually use are declared; the
 * response carries more (invite_uid, timestamps, …) that we deliberately ignore.
 */
export interface RawGroupMember {
  uid?: string;
  name?: string;
  remark?: string;
  real_name?: string;
  /** Octo serializes this as boolean on some nodes and 1/"1"/"true" on others. */
  realname_verified?: boolean | number | string | null;
  /** 1 = owner, 0 = member (admins sit in between). */
  role?: number;
  /** Monotonic per-member version, used as the sync cursor. */
  version?: number;
  is_deleted?: number;
  /** 1 = this "member" is a bot/AI. */
  robot?: number;
}

export interface GroupMember {
  uid: string;
  /** What Octo would print for this person — see `memberDisplayName`. */
  label: string;
  role: number;
  isBot: boolean;
}

/**
 * Reproduce octo-web's display-name precedence (`Utils/displayName.ts`):
 * verified real name → remark → name.
 *
 * This has to match exactly, because the label we hand to the composer becomes
 * the visible `@…` text. If we picked a different field, the mention would read
 * differently from every other place that person's name appears.
 */
export function memberDisplayName(raw: RawGroupMember): string {
  const verified =
    raw.realname_verified === true ||
    raw.realname_verified === 1 ||
    raw.realname_verified === '1' ||
    raw.realname_verified === 'true';
  if (verified && raw.real_name) return raw.real_name;
  if (raw.remark) return raw.remark;
  return raw.name ?? '';
}

/**
 * Keep only members we could actually mention, and reduce them to the fields the
 * UI needs. Removed members stay in the sync response (that is how other clients
 * learn they left) but mentioning them is meaningless.
 */
export function normalizeMembers(raw: readonly RawGroupMember[]): GroupMember[] {
  const seen = new Set<string>();
  const members: GroupMember[] = [];
  for (const item of raw) {
    if (!item?.uid || item.is_deleted === 1) continue;
    const label = memberDisplayName(item);
    if (!label) continue; // Nothing sensible to show, and `addMention` needs a name.
    if (seen.has(item.uid)) continue;
    seen.add(item.uid);
    members.push({
      uid: item.uid,
      label,
      role: typeof item.role === 'number' ? item.role : 0,
      isBot: item.robot === 1,
    });
  }
  return members;
}

/** Highest `version` in a response — the cursor for the next incremental sync. */
export function maxMemberVersion(raw: readonly RawGroupMember[]): number {
  let max = 0;
  for (const item of raw) {
    if (typeof item?.version === 'number' && item.version > max) max = item.version;
  }
  return max;
}

export interface RankOptions {
  /** UIDs seen speaking in the visible conversation, oldest → newest. */
  recentUids?: readonly string[];
  /**
   * Per-uid score for "how much this conversation actually @s them"
   * (see octoMentionTargets). Dominates every structural rule below.
   */
  mentionScores?: ReadonlyMap<string, number>;
  /** The logged-in user, dropped from the result: @-ing yourself is never useful. */
  selfUid?: string;
  /** Hard cap. 0 (the default) means "no cap" — show the whole roster. */
  limit?: number;
}

/**
 * Order members for a quick-pick strip.
 *
 * Priority, highest first:
 *
 *  1. **Whoever this conversation actually @s** (`mentionScores`, mined from history).
 *     Measured on real groups, this is the only rule that matters in practice: the
 *     top target was an AI bot mentioned 19–53 times, which every structural guess
 *     below ranked behind a pile of humans.
 *  2. Whoever just spoke: replying to the last message is the other common case.
 *  3. Humans before bots. Only a tie-breaker now, but it keeps a bot-heavy roster
 *     (observed 15 of 24) from opening with a wall of robots when we know nothing.
 *  4. Owner/admin, then a stable alphabetical order so the strip does not reshuffle
 *     between renders.
 */
export function rankMentionCandidates(
  members: readonly GroupMember[],
  options: RankOptions = {},
): GroupMember[] {
  const { recentUids = [], mentionScores, selfUid, limit = 0 } = options;
  // Most recent speaker first; a UID's *latest* appearance is what counts.
  const recency = new Map<string, number>();
  recentUids.forEach((uid, index) => recency.set(uid, index));

  const pool = members.filter((m) => m.uid !== selfUid);
  const sorted = [...pool].sort((a, b) => {
    const ha = mentionScores?.get(a.uid) ?? 0;
    const hb = mentionScores?.get(b.uid) ?? 0;
    if (ha !== hb) return hb - ha;
    const ra = recency.get(a.uid);
    const rb = recency.get(b.uid);
    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      if (ra !== rb) return rb - ra;
    }
    if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
    if (a.role !== b.role) return b.role - a.role;
    return a.label.localeCompare(b.label, 'zh-Hans-CN');
  });
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

/** Avatar URL for a UID — the same endpoint Octo's own `<img>` tags use. */
export function memberAvatarUrl(uid: string): string {
  return `/api/v1/users/${encodeURIComponent(uid)}/avatar`;
}

/**
 * Page size for a sync. Matches Octo's own client (`syncSubscribersCallback` asks
 * for 10000), so "all members" means the same thing here as it does in the app.
 *
 * Note the response includes members who have *left* (`is_deleted: 1`) — that is
 * how a client learns about departures during an incremental sync. Measured on a
 * real group: 35 records, 11 of them departed, i.e. the 24 the app shows in
 * 「聊天信息（24）」. `normalizeMembers` does that filtering, which is why our count
 * matches the app's rather than the raw record count.
 */
const MEMBER_SYNC_LIMIT = 10000;

/** Re-sync a cached group at most this often. */
const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  members: GroupMember[];
  names: Map<string, string>;
  version: number;
  fetchedAt: number;
  /** Set when the API said "no" in a way that will not change on retry. */
  denied?: boolean;
  inflight?: Promise<GroupMember[]>;
}

const cache = new Map<string, CacheEntry>();

function indexNames(members: readonly GroupMember[]): Map<string, string> {
  return new Map(members.map((m) => [m.uid, m.label]));
}

async function syncMembers(
  groupId: string,
  session: OctoSession,
  entry: CacheEntry,
  options: OctoApiOptions,
): Promise<GroupMember[]> {
  const raw = await octoApiGet<RawGroupMember[] | null>(
    `groups/${encodeURIComponent(groupId)}/membersync?version=${entry.version}&limit=${MEMBER_SYNC_LIMIT}`,
    session,
    options,
  );
  const list = Array.isArray(raw) ? raw : [];
  entry.fetchedAt = Date.now();
  // An incremental sync returns only what changed. Empty means "still current",
  // which is the common case and must not wipe the roster we already have.
  if (list.length === 0 && entry.members.length > 0) return entry.members;

  const incoming = normalizeMembers(list);
  if (entry.members.length === 0) {
    entry.members = incoming;
  } else {
    // Merge: changed members replace their old record, everyone else stays.
    const merged = new Map(entry.members.map((m) => [m.uid, m]));
    const removed = new Set(
      list.filter((item) => item.is_deleted === 1 && item.uid).map((item) => item.uid as string),
    );
    for (const member of incoming) merged.set(member.uid, member);
    for (const uid of removed) merged.delete(uid);
    entry.members = [...merged.values()];
  }
  entry.names = indexNames(entry.members);
  entry.version = Math.max(entry.version, maxMemberVersion(list));
  return entry.members;
}

/**
 * Members of a group, cached. Concurrent callers share one request; a cached
 * roster is returned immediately and refreshed in the background when stale.
 *
 * Returns `[]` rather than throwing for the two "expected" failures (not logged
 * in, not allowed to see this group) so callers can treat "no members" as "hide
 * the feature" without a try/catch at every call site.
 */
export async function fetchGroupMembers(
  groupId: string,
  session: OctoSession | null,
  options: OctoApiOptions = {},
): Promise<GroupMember[]> {
  if (!groupId || !session) return [];
  let entry = cache.get(groupId);
  if (!entry) {
    entry = { members: [], names: new Map(), version: 0, fetchedAt: 0 };
    cache.set(groupId, entry);
  }
  if (entry.denied) return [];
  if (entry.inflight) return entry.inflight;
  const fresh = Date.now() - entry.fetchedAt < MEMBER_CACHE_TTL_MS;
  if (fresh && entry.members.length > 0) return entry.members;

  const request = syncMembers(groupId, session, entry, options)
    .catch((error: unknown) => {
      if (error instanceof OctoApiError && (error.isForbidden || error.isAuthError)) {
        // Permanent for this group (or until re-login): stop asking.
        entry!.denied = error.isForbidden;
        return [] as GroupMember[];
      }
      // Transient (network/timeout): keep whatever we had and allow a later retry
      // by leaving `fetchedAt` stale.
      return entry!.members;
    })
    .finally(() => {
      entry!.inflight = undefined;
    });
  entry.inflight = request;
  return request;
}

/**
 * Display name for a UID, from cache only — no network, no await.
 *
 * The shape a synchronous DOM pass needs: it cannot await, so it can only use what
 * is already known. Undefined means "not in the roster we have".
 */
export function cachedMemberName(groupId: string | null, uid: string): string | undefined {
  if (!groupId || !uid) return undefined;
  return cache.get(groupId)?.names.get(uid);
}

/** Cached roster without triggering a fetch. */
export function cachedGroupMembers(groupId: string | null): GroupMember[] {
  if (!groupId) return [];
  return cache.get(groupId)?.members ?? [];
}

/** Drop all cached rosters (feature turned off, or logout). */
export function clearMemberCache(): void {
  cache.clear();
}
