/**
 * Which conversation is open right now?
 *
 * The API can answer everything *about* a channel but not *which* channel the
 * user is looking at — that only exists in the page. So this module's whole job is
 * turning the page into one fact: the group id whose members we should load.
 *
 * Three sources, tried in order, because none of them is available everywhere:
 *
 *  1. `data-conversation-channel-id` / `-type` on `.wk-conversation-messages`.
 *     Upstream added these deliberately (octo-web `Components/Conversation/index.tsx`),
 *     so they are the closest thing to a supported contract. Checked first even
 *     though the currently deployed build does not emit them yet — when it ships,
 *     this path just starts working.
 *  2. The selected conversation-list row's avatar `<img>`: its `src` is
 *     `/api/v1/groups/<groupId>/avatar` (or `/users/<uid>/avatar` for a 1:1 chat).
 *     Verified against the live build. Only plain attributes, no framework
 *     internals — and for a thread it already points at the *parent* group, which
 *     is exactly what the member API wants.
 *  3. React fiber on `.wk-conversation-content` → `props.channel`. Last resort,
 *     kept because it is the only source that still works if the list is hidden.
 */

/** Octo channel types we care about (WuKongIM values). */
import { OCTO_SELECTORS } from './octoSelectors';

export const CHANNEL_TYPE_PERSON = 1;
export const CHANNEL_TYPE_GROUP = 2;
/** 子区 / thread. Its channelID is `<groupId>____<threadId>`. */
export const CHANNEL_TYPE_THREAD = 5;

export interface ChannelRef {
  /** Group id to use for member lookups (parent group for a thread). */
  groupId: string;
  /** False for 1:1 chats, where mentioning is meaningless. */
  isGroup: boolean;
  /**
   * The conversation's own id — a thread's is `<groupId>____<threadId>`, i.e. *not*
   * the group's. Needed by anything that reads this conversation's history, which
   * is a different scope from its roster. Falls back to `groupId` when only the
   * roster-level source was available.
   */
  channelId: string;
  /** WuKongIM channel type matching `channelId`. */
  channelType: number;
}

/**
 * Parse an Octo avatar URL into the channel it depicts.
 *
 * Deliberately tolerant about the prefix and query string: the app appends a
 * cache-busting `?v=…`, and a deployment could serve the API from a different
 * mount point.
 */
export function parseAvatarChannel(
  src: string | null | undefined,
): { kind: 'group' | 'user'; id: string } | null {
  if (!src) return null;
  const match = /\/(groups|users)\/([^/?#]+)\/avatar/.exec(src);
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  if (!id) return null;
  return { kind: match[1] === 'groups' ? 'group' : 'user', id };
}

/**
 * Group id behind a channel id. Threads carry their parent group in the id
 * (`<groupId>____<threadId>`), and thread members *are* the parent group's members
 * — upstream resolves them the same way.
 */
export function groupIdOfChannel(channelId: string | null | undefined): string {
  if (!channelId) return '';
  const cut = channelId.indexOf('____');
  return cut > 0 ? channelId.slice(0, cut) : channelId;
}

/** Does this channel type support mentions at all? */
export function isMentionableChannelType(channelType: number): boolean {
  return channelType === CHANNEL_TYPE_GROUP || channelType === CHANNEL_TYPE_THREAD;
}

/** Bounded fiber walk: `.wk-conversation-content` → nearest `props.channel`. */
function channelFromFiber(root: Element): ChannelRef | null {
  const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
  if (!key) return null;
  let fiber = (root as Element & Record<string, any>)[key];
  for (let depth = 0; fiber && depth < 20; depth += 1) {
    const channel = fiber.memoizedProps?.channel;
    if (channel?.channelID) {
      const channelId = String(channel.channelID);
      const channelType = Number(channel.channelType);
      return {
        groupId: groupIdOfChannel(channelId),
        isGroup: isMentionableChannelType(channelType),
        channelId,
        channelType,
      };
    }
    fiber = fiber.return;
  }
  return null;
}

/**
 * Resolve the open conversation. Returns null when nothing is open (or nothing
 * recognizable), which callers treat as "no member strip".
 */
export function readCurrentChannel(doc: Document = document): ChannelRef | null {
  const messages = doc.querySelector<HTMLElement>(OCTO_SELECTORS.conversationMessages);
  const attrId = messages?.dataset.conversationChannelId;
  if (attrId) {
    const attrType = Number(messages?.dataset.conversationChannelType ?? NaN);
    const isGroup = Number.isFinite(attrType)
      ? isMentionableChannelType(attrType)
      : readChannelFromList(doc)?.isGroup === true;
    return {
      groupId: groupIdOfChannel(attrId),
      isGroup,
      channelId: attrId,
      channelType: Number.isFinite(attrType) ? attrType : isGroup ? CHANNEL_TYPE_GROUP : CHANNEL_TYPE_PERSON,
    };
  }

  const fromList = readChannelFromList(doc);
  const fromFiber = readChannelFromFiber(doc);
  if (!fromList) return fromFiber;
  // The list row is the more robust source for *which group*, but it cannot tell a
  // thread from its parent group (its avatar is the parent's either way). When the
  // fiber agrees about the group, take its exact channel id/type so history-scoped
  // features read the conversation the user is actually in.
  if (fromFiber && fromFiber.groupId === fromList.groupId) {
    return { ...fromList, channelId: fromFiber.channelId, channelType: fromFiber.channelType };
  }
  return fromList;
}

/** Source 2: the highlighted row in the conversation list. */
export function readChannelFromList(doc: Document = document): ChannelRef | null {
  const selected = doc.querySelector(OCTO_SELECTORS.conversationListSelected);
  if (!selected) return null;
  for (const img of selected.querySelectorAll('img')) {
    const parsed = parseAvatarChannel(img.getAttribute('src'));
    if (!parsed) continue;
    const isGroup = parsed.kind === 'group';
    return {
      groupId: parsed.id,
      isGroup,
      channelId: parsed.id,
      channelType: isGroup ? CHANNEL_TYPE_GROUP : CHANNEL_TYPE_PERSON,
    };
  }
  return null;
}

/** Source 3: React fiber. */
export function readChannelFromFiber(doc: Document = document): ChannelRef | null {
  const content = doc.querySelector(OCTO_SELECTORS.conversation);
  return content ? channelFromFiber(content) : null;
}

/**
 * UIDs of people who spoke in the visible part of the conversation, oldest first.
 *
 * Read from each row's avatar `<img src="/api/v1/users/<uid>/avatar">` — the same
 * trick as above, and the only place the sender's identity (not just their name)
 * survives into the DOM.
 */
export function readRecentSpeakerUids(doc: Document = document, max = 60): string[] {
  const uids: string[] = [];
  const rows = doc.querySelectorAll(OCTO_SELECTORS.messageRow);
  const start = Math.max(0, rows.length - max);
  for (let i = start; i < rows.length; i += 1) {
    for (const img of rows[i].querySelectorAll('img')) {
      const parsed = parseAvatarChannel(img.getAttribute('src'));
      if (parsed?.kind === 'user') {
        uids.push(parsed.id);
        break;
      }
    }
  }
  return uids;
}
