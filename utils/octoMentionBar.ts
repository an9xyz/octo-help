/**
 * Quick-@ strip: a row of small member avatars under the comfortable composer.
 * Click one and that person is mentioned for real.
 *
 * Why it exists: Octo's own shortcut is "right-click someone's avatar in the
 * message list → @TA", which only works for people who happen to have spoken
 * recently *and* are still on screen. Otherwise you type `@`, wait for the
 * dropdown, and filter by name. The strip puts the handful of people you actually
 * reply to one click away.
 *
 * Where the data comes from: Octo's member API (see octoMembers.ts), not the DOM.
 * The DOM shows *rendered* names, which are ambiguous (two 张三), lossy (bots and
 * removed members look like anyone else) and only cover who happens to be on
 * screen. The API returns the roster with uid + role + robot flags, which is what
 * a mention needs — a mention is a uid, and guessing it from a name is exactly the
 * class of bug this avoids.
 *
 * This module runs in the MAIN world for one hard reason: inserting a real mention
 * needs the Tiptap editor object that lives on the page's `.ProseMirror` element.
 * Since we are already there, the API call happens there too — a plain same-origin
 * request with the page's own token, so no credential ever crosses into another
 * context and no host permission is involved.
 */

import { readPageSession } from './octoApi';
import {
  readCurrentChannel,
  readRecentSpeakerUids,
  type ChannelRef,
} from './octoChannelContext';
import {
  cachedGroupMembers,
  clearMemberCache,
  fetchGroupMembers,
  memberAvatarUrl,
  rankMentionCandidates,
  type GroupMember,
} from './octoMembers';
import { canInsertMention, insertMention } from './octoMention';
import {
  bumpMentionTarget,
  cachedMentionTargets,
  clearMentionTargets,
  fetchMentionTargets,
} from './octoMentionTargets';
import { OCTO_SELECTORS } from './octoSelectors';

const BAR_CLASS = 'octo-mention-bar';
const CHIP_CLASS = 'octo-mention-chip';
const STYLE_ID = 'octo-mention-bar-style';
const CARD_SELECTOR = OCTO_SELECTORS.composer;

/**
 * How many shortcuts to show.
 *
 * Five, because this is a shortcut rather than a member list. The whole roster was
 * tried first and it was worse: a 24-person group produced 24 tiny avatars, so
 * finding the one bot you always ping was its own small search — the problem the
 * feature exists to remove. With history-ranked ordering the target is almost always
 * in the first few, and the roster is still one `@` keystroke away in Octo's own
 * dropdown when it is not.
 */
const MAX_CHIPS = 5;

/** Debounce for DOM-triggered re-evaluation. Long enough to coalesce a channel
 *  switch's mutation storm, short enough to feel immediate. */
const RESYNC_DELAY_MS = 180;

let enabled = false;
let observer: MutationObserver | null = null;
let resyncTimer: number | null = null;
let renderedGroupId: string | null = null;
let renderedSignature = '';
/** Group we are currently loading, so a channel switch can ignore a late reply. */
let pendingGroupId: string | null = null;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${BAR_CLASS} {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      padding: 6px 2px 2px;
      margin-top: 2px;
      border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
    }
    .${BAR_CLASS}::-webkit-scrollbar { height: 0; display: none; }
    .${BAR_CLASS}-label {
      flex: none;
      font-size: 11px;
      line-height: 1;
      opacity: 0.45;
      user-select: none;
      /* The label is a hint, not a control: never let it eat a click meant for
       * the composer behind it. */
      pointer-events: none;
    }
    .${CHIP_CLASS} {
      flex: none;
      position: relative;
      display: block;
      /* Bigger than a message avatar on purpose: with only five of them this is a
       * click target, and 22px was fiddly to hit. */
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      /* Transform-only hover: no layout thrash inside the composer. */
      transition: scale 140ms ease, filter 140ms ease;
      scale: 1;
    }
    .${CHIP_CLASS}:hover,
    .${CHIP_CLASS}:focus-visible {
      scale: 1.18;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.22));
      outline: none;
    }
    .${CHIP_CLASS}-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      /* Transparent avatars must not show the composer through them. */
      background: #fff;
      display: block;
    }
    .${CHIP_CLASS}[data-octo-bot="true"]::after {
      content: "AI";
      position: absolute;
      right: -2px;
      bottom: -2px;
      font-size: 8px;
      line-height: 1;
      font-weight: 700;
      padding: 1px 2px;
      border-radius: 3px;
      color: #fff;
      background: #7c6bf0;
      pointer-events: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .${CHIP_CLASS} { transition: none; }
      .${CHIP_CLASS}:hover, .${CHIP_CLASS}:focus-visible { scale: 1; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function removeBar(): void {
  for (const bar of document.querySelectorAll(`.${BAR_CLASS}`)) bar.remove();
  renderedGroupId = null;
  renderedSignature = '';
}

/**
 * Identity of what is currently painted. Re-rendering on every mutation would
 * fight React and reset scroll position, so the strip is only rebuilt when the
 * people in it actually change.
 */
function signatureOf(members: readonly GroupMember[]): string {
  return members.map((m) => `${m.uid}:${m.label}`).join('|');
}

function buildChip(member: GroupMember, channelId: string): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = CHIP_CLASS;
  chip.dataset.octoUid = member.uid;
  if (member.isBot) chip.dataset.octoBot = 'true';
  chip.title = `@${member.label}`;
  chip.setAttribute('aria-label', `@${member.label}`);

  const avatar = document.createElement('img');
  avatar.className = `${CHIP_CLASS}-avatar`;
  avatar.src = memberAvatarUrl(member.uid);
  avatar.alt = '';
  avatar.loading = 'lazy';
  avatar.decoding = 'async';
  chip.appendChild(avatar);

  chip.addEventListener('mousedown', (event) => {
    // The composer steals focus on mousedown; claiming the event here keeps the
    // caret where the user left it so the mention lands at the caret.
    event.preventDefault();
  });
  chip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!insertMention(member.uid, member.label)) {
      // Editor handle vanished (Octo upgrade, composer replaced). Fail closed:
      // remove the strip rather than pretend the click worked.
      removeBar();
      return;
    }
    // Credit the pick so the next render puts this person first. Deliberately NOT
    // re-rendering right now: moving a button out from under the cursor the instant
    // it is clicked is hostile when you are mentioning two people in a row. The
    // reorder lands on the next natural sync (sending the message causes one).
    bumpMentionTarget(channelId, member.uid);
  });
  return chip;
}

function renderBar(
  card: Element,
  members: readonly GroupMember[],
  groupId: string,
  channelId: string,
): void {
  const signature = signatureOf(members);
  const existing = card.querySelector(`.${BAR_CLASS}`);
  if (existing && renderedGroupId === groupId && renderedSignature === signature) return;
  existing?.remove();

  if (members.length === 0) {
    renderedGroupId = groupId;
    renderedSignature = signature;
    return;
  }

  ensureStyle();
  const bar = document.createElement('div');
  bar.className = BAR_CLASS;
  bar.dataset.octoMentionBar = 'true';
  // Not a toolbar: it is a list of shortcuts, and screen readers should be able to
  // skip it without hunting through 12 unlabeled buttons.
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '快捷 @ 群成员');

  const label = document.createElement('span');
  label.className = `${BAR_CLASS}-label`;
  label.textContent = '@';
  bar.appendChild(label);

  for (const member of members) bar.appendChild(buildChip(member, channelId));
  card.appendChild(bar);
  renderedGroupId = groupId;
  renderedSignature = signature;
}

/** Rank the roster for the conversation currently on screen. */
function pickChips(
  members: readonly GroupMember[],
  selfUid: string,
  channelId: string,
): GroupMember[] {
  return rankMentionCandidates(members, {
    recentUids: readRecentSpeakerUids(),
    mentionScores: cachedMentionTargets(channelId),
    selfUid,
    limit: MAX_CHIPS,
  });
}

async function sync(): Promise<void> {
  if (!enabled) return;
  const card = document.querySelector(CARD_SELECTOR);
  if (!card) {
    removeBar();
    return;
  }
  // No editor handle → no way to insert a real mention → do not offer the button.
  if (!canInsertMention()) {
    removeBar();
    return;
  }

  const channel: ChannelRef | null = readCurrentChannel();
  if (!channel?.isGroup || !channel.groupId) {
    // 1:1 chat (or nothing open): mentioning has no meaning there, and Octo's own
    // @TA is disabled for person channels too.
    removeBar();
    return;
  }

  const session = readPageSession();
  if (!session) {
    removeBar();
    return;
  }

  const { groupId, channelId, channelType } = channel;
  // Paint from cache first so switching back to a group is instant.
  const cached = cachedGroupMembers(groupId);
  if (cached.length > 0) renderBar(card, pickChips(cached, session.uid, channelId), groupId, channelId);

  if (pendingGroupId === groupId) return;
  pendingGroupId = groupId;
  // Roster and mention history are independent reads; the strip needs both to be in
  // the right order, and neither should block the other.
  const [members] = await Promise.all([
    fetchGroupMembers(groupId, session),
    fetchMentionTargets(channelId, channelType, session),
  ]);
  pendingGroupId = null;

  // The user may have switched conversations while we were waiting; a stale roster
  // must never be painted into the new one.
  if (!enabled) return;
  const now = readCurrentChannel();
  if (now?.groupId !== groupId) return;
  const stillThere = document.querySelector(CARD_SELECTOR);
  if (!stillThere) return;
  renderBar(stillThere, pickChips(members, session.uid, channelId), groupId, channelId);
}

function scheduleSync(): void {
  if (!enabled) return;
  if (resyncTimer !== null) return;
  resyncTimer = window.setTimeout(() => {
    resyncTimer = null;
    void sync();
  }, RESYNC_DELAY_MS);
}

/**
 * Enable/disable the strip. Tied to the comfortable-composer switch: it is part of
 * that feature's promise (a nicer place to write), and it would look out of place
 * bolted onto Octo's stock one-line composer.
 */
export function setMentionQuickBar(next: boolean): void {
  if (next === enabled) {
    if (next) scheduleSync();
    return;
  }
  enabled = next;
  if (!next) {
    teardownMentionQuickBar();
    return;
  }
  // React re-renders the composer and swaps the whole conversation on channel
  // switch, so a single mount is not enough — watch and re-mount. The callback is
  // debounced and only reads a few selectors, so a body-wide observer is cheap
  // enough; the expensive part (the API call) is cached per group.
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
  });
  scheduleSync();
}

export function teardownMentionQuickBar(): void {
  enabled = false;
  observer?.disconnect();
  observer = null;
  if (resyncTimer !== null) {
    clearTimeout(resyncTimer);
    resyncTimer = null;
  }
  pendingGroupId = null;
  removeBar();
  document.getElementById(STYLE_ID)?.remove();
  // Rosters are personal data; drop them when the feature is off rather than
  // keeping them alive in memory for the rest of the page's life.
  clearMemberCache();
  clearMentionTargets();
}
