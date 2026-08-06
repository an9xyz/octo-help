/**
 * "Who gets @-ed in this conversation?" — mined from the group's own history.
 *
 * The problem this solves: any fixed ranking is somebody's guess. The first version
 * of the quick-@ strip ranked humans above bots, on the theory that a bot-heavy
 * roster would bury the people. Measured against a real account that was exactly
 * backwards — the bots were the whole point of the feature.
 *
 * So instead of guessing, read the history. Octo's history endpoint returns each
 * message's `payload.mention.uids`, so "who this group actually mentions, and how
 * recently" is a fact:
 *
 *     POST /api/v1/message/channel/sync
 *     { channel_id, channel_type, start_message_seq, end_message_seq, pull_mode, limit }
 *     → { messages: [ { from_uid, message_seq, payload: { mention: { uids: [...] } } } ] }
 *
 * Measured on three real groups (200 messages each, 190–360 ms): the top target was
 * an AI bot mentioned 19 / 53 times, against 1 mention from the user themselves in
 * the same window. That is why *everyone's* mentions count, not just the user's —
 * their own history alone is too small a sample to rank on. Mentions the user sent
 * still count double, because "who I ping" beats "who the group pings" when we have
 * evidence of both.
 *
 * Two properties worth noting:
 *
 *  - **No learning period.** The ranking comes from history, so it is right the
 *    first time the strip appears rather than after a week of watching. That also
 *    means nothing needs persisting: after a reload we simply mine again.
 *  - **Per conversation.** The bot everyone pings in the frontend group is not the
 *    one they ping in the bug-report group (measured: completely different top 5).
 */

import { octoApiPostQuery, type OctoApiOptions, type OctoSession } from './octoApi';

/** Only the fields we read. `payload` shape differs per message type. */
interface SyncedMessage {
  from_uid?: string;
  message_seq?: number;
  payload?: {
    mention?: { uids?: string[] };
  } | null;
}

interface SyncResponse {
  messages?: SyncedMessage[] | null;
}

/** Messages per request. Octo's own history pages are this size. */
const PAGE_SIZE = 100;

/**
 * How many pages back to look.
 *
 * Measured: 2 pages (200 messages) return in ~200–360 ms and already contain
 * dozens of mentions. A third page pushed the walk to ~6 s — paging deeper into
 * history gets progressively slower — without changing the top targets. Mining runs
 * in the background and the strip is usable before it lands, but a 6-second-late
 * reorder is worse than a slightly smaller sample.
 */
const PAGE_COUNT = 2;

/** Extra weight for a mention the user sent themselves. */
const SELF_MENTION_WEIGHT = 2;

/** Re-mine at most this often per conversation. */
const TARGETS_TTL_MS = 5 * 60 * 1000;

/**
 * Score mention targets from a window of history.
 *
 * Each mention is worth 1–2 points depending on where it sits in the window (newest
 * ≈ 2, oldest ≈ 1), doubled when the user sent it. The decay matters because habits
 * move: the bot everyone pinged last month should not permanently outrank the one
 * being pinged today.
 *
 * `selfUid` is excluded as a *target* — a shortcut to @ yourself is useless.
 *
 * Pure, so the weighting is testable without a network or a browser.
 */
export function scoreMentionTargets(
  messages: readonly SyncedMessage[],
  selfUid?: string,
): Map<string, number> {
  const scores = new Map<string, number>();
  if (messages.length === 0) return scores;

  const seqs = messages.map((m) => (typeof m?.message_seq === 'number' ? m.message_seq : 0));
  const minSeq = Math.min(...seqs);
  const maxSeq = Math.max(...seqs);
  const span = maxSeq - minSeq || 1;

  for (const message of messages) {
    const uids = message?.payload?.mention?.uids;
    if (!uids?.length) continue;
    const seq = typeof message.message_seq === 'number' ? message.message_seq : minSeq;
    const recency = 1 + (seq - minSeq) / span;
    const weight = message.from_uid === selfUid ? recency * SELF_MENTION_WEIGHT : recency;
    for (const uid of uids) {
      if (!uid || uid === selfUid) continue;
      scores.set(uid, (scores.get(uid) ?? 0) + weight);
    }
  }
  return scores;
}

interface TargetsEntry {
  scores: Map<string, number>;
  minedAt: number;
  inflight?: Promise<Map<string, number>>;
}

const conversations = new Map<string, TargetsEntry>();

function entryFor(key: string): TargetsEntry {
  let entry = conversations.get(key);
  if (!entry) {
    entry = { scores: new Map(), minedAt: 0 };
    conversations.set(key, entry);
  }
  return entry;
}

async function mine(
  channelId: string,
  channelType: number,
  session: OctoSession,
  options: OctoApiOptions,
): Promise<Map<string, number>> {
  const collected: SyncedMessage[] = [];
  // `start_message_seq: 0` means "from the newest"; pull_mode 0 walks backwards.
  let cursor = 0;
  for (let page = 0; page < PAGE_COUNT; page += 1) {
    const response = await octoApiPostQuery<SyncResponse>(
      'message/channel/sync',
      {
        channel_id: channelId,
        channel_type: channelType,
        start_message_seq: cursor,
        end_message_seq: 0,
        pull_mode: 0,
        limit: PAGE_SIZE,
      },
      session,
      options,
    );
    const messages = response?.messages ?? [];
    if (messages.length === 0) break;
    collected.push(...messages);
    const oldest = Math.min(...messages.map((m) => m.message_seq ?? 0));
    if (oldest <= 1) break;
    cursor = oldest - 1;
  }
  return scoreMentionTargets(collected, session.uid);
}

/**
 * Mention scores for a conversation, cached. Never throws: a failed mining run just
 * means the strip falls back to its structural ordering.
 *
 * Keyed by the *channel*, not the group: a thread and its parent group share a
 * roster but are different conversations with different mention patterns.
 */
export async function fetchMentionTargets(
  channelId: string,
  channelType: number,
  session: OctoSession | null,
  options: OctoApiOptions = {},
): Promise<Map<string, number>> {
  if (!channelId || !session) return new Map();
  const entry = entryFor(channelId);
  if (entry.inflight) return entry.inflight;
  if (Date.now() - entry.minedAt < TARGETS_TTL_MS) return entry.scores;

  const request = mine(channelId, channelType, session, options)
    .then((scores) => {
      // Merge rather than replace: picks made during this session (below) are not in
      // the history window yet, and losing them would reshuffle the strip right
      // after the user used it.
      for (const [uid, score] of entry.scores) {
        scores.set(uid, (scores.get(uid) ?? 0) + score);
      }
      entry.scores = scores;
      entry.minedAt = Date.now();
      return scores;
    })
    .catch(() => entry.scores)
    .finally(() => {
      entry.inflight = undefined;
    });
  entry.inflight = request;
  return request;
}

/** Cached scores without triggering a request. */
export function cachedMentionTargets(channelId: string | null): Map<string, number> {
  if (!channelId) return new Map();
  return conversations.get(channelId)?.scores ?? new Map();
}

/**
 * Credit a mention the user just made, so the next render puts that person first.
 * Weighted like a fresh self-sent mention.
 */
export function bumpMentionTarget(channelId: string | null, uid: string): void {
  if (!channelId || !uid) return;
  const entry = entryFor(channelId);
  entry.scores.set(uid, (entry.scores.get(uid) ?? 0) + 2 * SELF_MENTION_WEIGHT);
}

export function clearMentionTargets(): void {
  conversations.clear();
}
