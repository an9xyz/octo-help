import { OCTO_SELECTORS } from './octoSelectors';

/**
 * Sort the sidebar conversation list by attention instead of by recency.
 *
 * ## The problem
 *
 * Octo's sidebar offers two mutually exclusive tabs, 关注 and 最近, and neither
 * orders by importance. 关注 is ordered by a server-side manual `follow_sort`
 * and deliberately disables pin, so new activity never floats up — it is a
 * static bookshelf. 最近 is pure reverse-chronological, so a few high-volume bot
 * groups (CI, code review) push real conversations off the first screen. And
 * while you sit on 关注, non-followed conversations are not merely sorted last —
 * they are absent from the list entirely, so you have to ping-pong between tabs.
 *
 * ## Why this file contains no logic
 *
 * The interesting discovery is that Octo already computes the only signal that
 * matters and publishes it as a class. Its row renderer emits the same
 * `.wk-mention` span for a group @me *and* for an unread 1v1, and that span
 * survives mute — the render condition is `hasMention || (unread && !muted)`.
 * So "someone is waiting on me" is readable as `:has(.wk-mention)`. Pin is
 * `-top`, mute (including a subchannel inheriting its parent group) is `-muted`.
 * All three are maintained live by React.
 *
 * That means the whole feature is a stylesheet: CSS reacts to Octo's own state
 * classes and re-sorts as they flip, with no MutationObserver, no DOM writes and
 * nothing to keep in sync. Resist adding JavaScript here — a pass that stamps
 * rows would have to re-run on every render, and everything it could compute is
 * already in the class list.
 *
 * ## Why `order` and not moving rows
 *
 * React owns these nodes. Moving a row within its container does not corrupt
 * React's references — but React re-imposes its own child order on every commit,
 * so a reordering pass would fight each render and flicker, and moving a node
 * drops `:hover`. Reparenting rows into our own section wrappers would be worse:
 * `removeChild` is called against the parent React recorded, so that one throws.
 * `order` sidesteps all of it because layout is not the DOM tree.
 */

const STYLE_ID = 'octo-conv-sort-style';
const ENABLED_ATTRIBUTE = 'data-octo-conv-sort';

/**
 * Order rungs. Gaps are intentional so a future rung can land between two
 * existing ones without renumbering.
 *
 * 「其它」 is deliberately absent: it must inherit the CSS default of `0`. Giving
 * the common case an explicit positive value would put every row that no rule
 * has matched yet — including freshly inserted ones — above the whole list for a
 * frame.
 *
 * Pin outranks @me on purpose. Pinning is an explicit, long-lived choice over a
 * handful of conversations, and honouring it is more predictable than letting a
 * mention displace it. Swap the two numbers to invert that.
 */
const ORDER_PINNED = -40;
const ORDER_NEEDS_ME = -30;
const ORDER_MUTED = 10;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  const gate = `body[${ENABLED_ATTRIBUTE}='true']`;
  const { conversationList, conversationListItem } = OCTO_SELECTORS;
  const top = OCTO_SELECTORS.conversationListItemTop;
  const muted = OCTO_SELECTORS.conversationListItemMuted;
  const mention = OCTO_SELECTORS.conversationListMention;
  // Every rung is written to be mutually exclusive via :not(), so which rung a
  // row lands on never depends on specificity arithmetic or source order. That
  // matters more than it looks: `:has()` takes the specificity of its most
  // specific argument, so a naive `:has(.wk-mention)` rule outweighs a plain
  // `.wk-conversationlist-item-top` rule and would silently invert the intended
  // pin-beats-mention precedence below.
  style.textContent = `
    /*
     * Scoped to lists that actually contain normal rows, which is exactly the
     * 最近 tab: 'compact' is a whole-list prop and the compact branch returns
     * '.wk-conv-compact-item' instead, so a 关注-tab container matches zero
     * '.wk-conversationlist-item' and never becomes a flex container at all.
     * Its drag-to-sort therefore keeps working untouched — which is why this is
     * a selector rather than a JS tab probe that could misread an empty list.
     *
     * The container's last children are Octo's <ContextMenus> nodes. They look
     * like a hazard here and are not: both are position:fixed, so they are not
     * flex items and 'order' cannot reach them.
     */
    ${gate} ${conversationList}:has(> ${conversationListItem}) {
      display: flex;
      flex-direction: column;
    }

    /*
     * Load-bearing, not defensive. The container is height:100%, and a column
     * flex container with negative free space SHRINKS its items rather than
     * overflowing. Rows carrying a breadcrumb or an external-group tag have
     * slack to give, so without this the sidebar quietly compresses as the list
     * grows — which reads as a font bug, not a layout one.
     */
    ${gate} ${conversationList}:has(> ${conversationListItem}) > * {
      flex: 0 0 auto;
    }

    /* Rung 1: pinned. Wins outright. */
    ${gate} ${top} {
      order: ${ORDER_PINNED};
    }

    /* Rung 2: someone is waiting on me — group @me or an unread 1v1, and it
     * pierces mute. See the header comment on .wk-mention. */
    ${gate} ${conversationListItem}:has(${mention}):not(${top}) {
      order: ${ORDER_NEEDS_ME};
    }

    /* Rung 3: 其它 — no rule, so order stays at the CSS default 0. */

    /*
     * Rung 4: muted sinks. This is the rung that pays for itself. Today muting
     * is all-or-nothing, so people will not mute the bot groups that most need
     * it. Because rung 2 excludes muted rows from sinking when they @me you,
     * muting becomes "turn the volume down" rather than "give up on this group".
     */
    ${gate} ${muted}:not(${top}):not(:has(${mention})) {
      order: ${ORDER_MUTED};
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

export function setConvSort(enabled: boolean): void {
  if (!enabled) {
    teardownConvSort();
    return;
  }
  ensureStyle();
  document.body?.setAttribute(ENABLED_ATTRIBUTE, 'true');
}

export function teardownConvSort(): void {
  document.body?.removeAttribute(ENABLED_ATTRIBUTE);
  document.getElementById(STYLE_ID)?.remove();
}
