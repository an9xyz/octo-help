import { OCTO_SELECTORS } from './octoSelectors';
import { planConvStamps, type ConvRowFacts } from './octoConvGroup';
import type { ConvCompactLevel } from './octoShared';

/**
 * Compact the sidebar conversation list, and optionally hide anything older than
 * a week.
 *
 * ## Why
 *
 * A row answers three questions — who, what happened, does it need me now — but
 * carries up to nine signals to do it. Two rounds of design landed on a ladder:
 *
 *   L1  减装饰    delete redundant decoration (subchannel glyph, AI badge, the
 *                 unreadable 14px avatar sub-badge). Pure CSS.
 *   L2  收面包屑  the breadcrumb stops owning a line and becomes a title prefix,
 *                 and parent-group rows that only restate a subchannel are merged.
 *   L3  单行      drop the preview text, the timestamp and the breadcrumb. One
 *                 line per row.
 *   L4  连续折叠  consecutive same-parent rows collapse under one header.
 *
 * L3 is the rung that matters most, and it is worth being explicit about why:
 * **the preview text is the information stream.** "牛奶: 我先刷新远端并确认…" does
 * not help you decide whether to act — it just makes you read the message while
 * deciding not to. Dropping it turns the list from "here is content" into "here is
 * who is active", which is the whole point of the feature. The unread count goes
 * with it, collapsed to a dot: 99+ and 19 lead to the same decision, and the big
 * number only adds urgency the user did not ask for.
 *
 * The breadcrumb goes too, and that is a reversal of what L2 does on purpose. At
 * L2 the parent group earns its place because the row still shows content, so you
 * are reading the row anyway. At L3 the row is one line whose only job is "who is
 * active" — and at 291 px of sidebar the prefix eats ~90 px to render
 * "FT-OctoCore…", which identifies nothing. The subchannel name is what you click;
 * which group it hangs under is not a decision input. It stays recoverable: L3
 * stamps `父群 · 名称 · 时间` into the row's `title`, so hovering gives back
 * everything the rung took away. L4 is where parent identity comes back for real,
 * as a header that pays for itself across several rows.
 *
 * ## Why only L4 conflicts with the attention sort
 *
 * `octoConvSort` reorders with CSS `order`, which changes the visual order while
 * leaving the DOM order alone. L4 asks "is the previous row the same parent?", and
 * "previous" can only mean DOM order. With both on, two DOM-adjacent rows can be
 * flung to opposite ends of the list and the collapse hides the breadcrumb of a
 * row that is no longer under its header. So L4 — and only L4 — steps down to L3
 * while the sort is active; `setConvSortActive` is how it finds out. The ladder is
 * ordered deliberately so that the rung people actually want (L3) never gets
 * disabled by that conflict.
 *
 * ## The one-week filter needs no timestamp
 *
 * See `isFoldableStaleRow` in octoConvGroup: Octo's own formatter switches format
 * at exactly 7×24 hours, so staleness is readable off the rendered time text.
 * Folding is never destructive — a footer row reveals what was folded, and pinned
 * or unread rows are never folded at all.
 *
 * ## Why there IS an observer here, unlike octoConvSort
 *
 * The sort is pure CSS reacting to Octo's own state classes, so it self-heals for
 * free. Compaction cannot be: merging, run detection and staleness depend on
 * relationships between rows and on rendered text, none of which CSS can read. So
 * this module stamps `data-octo-*` attributes and lets CSS render them.
 *
 * State goes in attributes, never in classes: a row's `className` is rewritten by
 * React on every unread/selected/mute flip, which would silently drop a class we
 * added. Our writes are attribute-only, and the observer watches
 * childList/characterData only — so it cannot see them and cannot loop. That is
 * also why `disconnect()` is not used while stamping: unlike a full re-scan,
 * `disconnect` would drop queued records we still need.
 */

const STYLE_ID = 'octo-conv-compact-style';
const LEVEL_ATTRIBUTE = 'data-octo-conv-compact';
/** `on` = fold stale rows, `open` = user expanded them. */
const RECENT_ATTRIBUTE = 'data-octo-conv-recent';

/** Row stamps. `data-octo-*` per the extension-wide convention. */
const MERGED_ATTRIBUTE = 'data-octo-conv-merged';
const RUN_ATTRIBUTE = 'data-octo-conv-run';
const RUN_LABEL_ATTRIBUTE = 'data-octo-conv-run-label';
const STALE_ATTRIBUTE = 'data-octo-conv-stale';
/**
 * Marks a `title` we wrote ourselves, so cleanup never eats one of Octo's.
 * Octo puts no `title` on these rows today (checked on a live build), but "today"
 * is not something this module gets to assume.
 */
const TITLE_ATTRIBUTE = 'data-octo-conv-title';

/** The one node this feature injects: the "older conversations" reveal. */
const FOOTER_CLASS = 'octo-conv-stale-foot';

type Level = 0 | 1 | 2 | 3 | 4;

const LEVEL_NUMBER: Record<ConvCompactLevel, Level> = {
  off: 0,
  l1: 1,
  l2: 2,
  l3: 3,
  l4: 4,
};

let requestedLevel: ConvCompactLevel = 'off';
let sortActive = false;
let recentOnly = false;
/** Session-only: the user expanded the folded-away older conversations. */
let staleExpanded = false;
/** Level actually applied, after the L4-vs-sort degrade. */
let appliedLevel: Level = 0;

const listObservers = new Map<Element, MutationObserver>();
let rootObserver: MutationObserver | null = null;
let frame = 0;
let stamping = false;

function effectiveLevel(): Level {
  const n = LEVEL_NUMBER[requestedLevel];
  // Only the grouping rung needs DOM order, so only it steps down.
  return n === 4 && sortActive ? 3 : n;
}

/** True when the stamping pass has anything to compute. */
function needsStamping(): boolean {
  return appliedLevel >= 2 || recentOnly;
}

// ─── stylesheet ───────────────────────────────────────────────────────────

/**
 * Expand `levels × descendant` into a selector list.
 *
 * Every alternative carries its own full descendant chain, which is what makes the
 * original comma bug impossible to write here: a hand-built gate like
 * `body[..='2'],body[..='3'] .row` binds the descendant to the last alternative
 * only, leaving a bare `body[..='2']` that applied `display:none` to the whole
 * page. Requiring the first descendant part as a separate argument means this
 * helper can never emit a gate with nothing after it.
 */
function at(levels: readonly Level[], first: string, ...rest: string[]): string {
  const tail = [first, ...rest].join(' ');
  return levels.map((l) => `body[${LEVEL_ATTRIBUTE}='${l}'] ${tail}`).join(',\n    ');
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;

  const S = OCTO_SELECTORS;
  const item = S.conversationListItem;
  const L1: readonly Level[] = [1, 2, 3, 4];
  const L2: readonly Level[] = [2, 3, 4];
  const L3: readonly Level[] = [3, 4];
  const L4: readonly Level[] = [4];
  const fold = `body[${RECENT_ATTRIBUTE}='on']`;

  style.textContent = `
    /* ═══ L1 — 删掉纯冗余的装饰 ═══ */

    /* 子区图标：面包屑/前缀已经说明所属，图标是第三次重复 */
    ${at(L1, item, S.conversationListThreadIcon)} { display: none; }

    /* AI 徽章：只在会话列表里删，消息区的徽章不受影响 */
    ${at(L1, item, S.aiBadge)} { display: none; }

    /* 头像上的「该群有子区」小角标：40px 下只是一团灰点 */
    ${at(L1, item, S.conversationListGroupHashBadge)} { display: none; }

    /* ═══ L2 — 面包屑不再独占一行 ═══ */

    /*
     * 用 grid 把面包屑挪到标题行前面。列宽 auto，所以没有面包屑的行（普通群、
     * 私聊、AI）第一列自然塌成 0 宽；间距用面包屑自己的 margin 而不是 gap，
     * 否则那些行会多出一段空隙。
     */
    ${at(L2, item, S.conversationListItemRight)} {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 0;
      align-items: baseline;
    }
    ${at(L2, item, S.conversationListBreadcrumb)} {
      grid-area: 1 / 1 / 2 / 2;
      max-width: 88px;
      margin-right: 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      opacity: .75;
    }
    ${at(L2, item, S.conversationListItemFirstLine)} {
      grid-area: 1 / 2 / 2 / 3;
      min-width: 0;
    }
    ${at(L2, item, S.conversationListItemSecondLine)} {
      grid-area: 2 / 1 / 3 / 3;
      min-width: 0;
    }

    /*
     * 加前缀会占掉标题列的宽度，标题因此更容易撑出去。flex 子项的 min-width 默认是
     * auto，nowrap 文本于是拒绝收缩、直接压到时间上面（真机上验证过这个现象）。
     * 显式给 0 让它改为省略号，这样结果不依赖 Octo 自己有没有设这一条。
     */
    ${at(L2, item, S.conversationListItemName)},
    ${at(L2, item, `${S.conversationListItemName} > h3`)} {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 归并掉的父群行：它的内容已经由对应子区行表达 */
    ${at(L2, `${item}[${MERGED_ATTRIBUTE}='true']`)} { display: none; }

    /* ═══ L3 — 单行：不再把消息内容推到眼前 ═══ */

    /*
     * 未读指示器原本在第二行里，而第二行整行要收掉。用 display:contents 把第二行
     * 从布局里「摘掉」，它的子节点直接成为 -right 这个 grid 的成员，未读点于是能
     * 落到第一行右侧。这是唯一能在不搬 DOM 的前提下跨行搬运子节点的办法。
     */
    ${at(L3, item, S.conversationListItemRight)} {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
    }
    ${at(L3, item, S.conversationListItemSecondLine)} { display: contents; }
    ${at(L3, item, S.conversationListLastMsg)} { display: none; }
    ${at(L3, item, S.conversationListIndicators)} {
      grid-area: 1 / 3 / 2 / 4;
      margin-left: 6px;
    }

    /* 面包屑：子区挂在哪个群下不是一个决策输入，而它要吃掉侧边栏近三成宽度
       去渲染一个被截成「FT-OctoCore…」的前缀。标题拿回整行宽度，父群名进 title。
       L4 才是父群真正回来的地方 —— 以一个能摄住好几行的分组表头的形式。 */
    ${at(L3, item, S.conversationListBreadcrumb)} { display: none; }

    /* 时间：顺序已经表达新旧，精确到分钟只在引用某条消息时才有用 —— 那时已经点进去了。
       仍然可达：盖章时会把「父群 · 名称 · 时间」写进 title，悬停可见。 */
    ${at(L3, item, S.conversationListTime)} { display: none; }

    /*
     * 未读数字 → 圆点。99+ 和 19 导向同一个决定，数字只多添一份催促感。
     *
     * background 必须显式给红色：这个 pill 原本是「浅粉底 + 红字」，只把文字藏掉的话
     * 留下的是浅粉的点，几乎看不见 —— 而它恰好是整行最重要的信号。真机截图才发现。
     */
    ${at(L3, item, S.conversationListUnreadNum)} {
      width: 7px;
      height: 7px;
      min-width: 0;
      padding: 0;
      border-radius: 50%;
      font-size: 0;
      line-height: 0;
      color: transparent;
      overflow: hidden;
      background: #f53f3f;
    }
    /* 免打扰的未读保持灰色，别把「已经静音了」的群也点成红的。 */
    ${at(L3, item, S.conversationListUnreadNumMuted)} { background: #c9cdd4; }

    /* 行高随之收紧；头像按比例缩小，仍然当扫读锚点。 */
    ${at(L3, item)} { padding-top: 5px; padding-bottom: 5px; }
    ${at(L3, item, S.conversationListAvatarBox)} { width: 26px; height: 26px; }
    /*
     * 只缩头像本体，绝不碰它的兄弟节点。头像盒里还压着一个绝对定位的在线状态点
     * （.wk-onlinestatusbadge-empty，9px、成功色绿），一条 " > * " 的规则会把它一起
     * 放大成 26px —— 它 bottom/right: -1px，于是铺满整个盒子，把头像糊成一块纯绿圆。
     * 真机上「头像变绿」就是这么来的：不是配色问题，是这个角标被吹大了。
     *
     * 通配那层兜底仍然留着（Octo 哪天把 img 包一层 wrapper 也不会失效），只是显式
     * 排掉这两个覆盖在头像上的角标。
     */
    ${at(L3, item, `${S.conversationListAvatarBox} > ${S.avatarImage}`)},
    ${at(
      L3,
      item,
      `${S.conversationListAvatarBox} > *:not(${S.conversationListOnlineBadge}):not(${S.conversationListGroupHashBadge})`,
    )} { width: 26px; height: 26px; }

    /* 状态点同比例收小（Octo 自己的紧凑图标就是 7px + 1.5px 描边）。 */
    ${at(L3, item, S.conversationListOnlineBadgeEmpty)} {
      width: 7px;
      height: 7px;
      border-width: 1.5px;
    }

    /* ═══ L4 — 连续同父群折叠 ═══ */

    /* 面包屑在 L3 就已经收掉了（见上），组内归属由表头 + 缩进表达。 */

    /* 缩进轨：让组内行明显挂在表头下面 */
    ${at(L4, `${item}[${RUN_ATTRIBUTE}]`, S.conversationListItemRight)} {
      border-left: 2px solid #dcdfe5;
      padding-left: 10px;
    }

    /*
     * 组内后续行的头像与首行完全相同（同一个父群），隐藏它但保留占位，
     * 这样缩进轨是齐的。用 visibility 而不是 display 正是为了保住那段宽度。
     */
    ${at(L4, `${item}[${RUN_ATTRIBUTE}='cont']`, S.conversationListAvatarBox)} {
      visibility: hidden;
    }

    /*
     * 表头由首行的 ::before 生成，文字来自我们盖的属性 —— 不注入任何节点，
     * React 因此完全感知不到它，也没有 reconcile 冲突。
     */
    ${at(L4, `${item}[${RUN_ATTRIBUTE}='first']`)} {
      position: relative;
      padding-top: 26px;
    }
    ${at(L4, `${item}[${RUN_ATTRIBUTE}='first']::before`)} {
      content: attr(${RUN_LABEL_ATTRIBUTE});
      position: absolute;
      top: 0;
      left: 12px;
      right: 12px;
      height: 22px;
      display: flex;
      align-items: center;
      font-size: 11.5px;
      font-weight: 600;
      color: #4e5969;
      background: #fafbfc;
      border-radius: 4px;
      padding: 0 8px;
      box-sizing: border-box;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      pointer-events: none;
    }

    /* ═══ 一周过滤 ═══ 独立于等级，所以用自己的 body 属性门控 */

    ${fold} ${item}[${STALE_ATTRIBUTE}='true'] { display: none; }

    /*
     * 唯一注入的节点。order 给一个很大的值，这样即使「按重要性排序」把容器变成
     * flex 并重排了所有行，它依然留在最后。
     */
    .${FOOTER_CLASS} {
      order: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 12px;
      border-top: 1px solid #f2f3f5;
      background: #fcfcfd;
      color: #86909c;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      flex: 0 0 auto;
    }
    .${FOOTER_CLASS}:hover { background: #f7f8fa; color: #4e5969; }
    .${FOOTER_CLASS}[hidden] { display: none; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// ─── reading facts off the DOM ────────────────────────────────────────────

function text(root: Element, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? '';
}

function factsOf(row: Element): ConvRowFacts {
  return {
    crumb: text(row, OCTO_SELECTORS.conversationListBreadcrumb),
    preview: text(row, OCTO_SELECTORS.conversationListLastMsg),
    hasIndicator: row.querySelector(OCTO_SELECTORS.conversationListIndicators) != null,
    // Octo's own 「有人在等我」 span: group @me or an unread 1v1, and it survives mute.
    mentioned: row.querySelector(OCTO_SELECTORS.conversationListMention) != null,
    // The muted variant of the unread pill — backlog in a conversation the user
    // already silenced, so the week filter is allowed to fold it.
    mutedUnread: row.querySelector(OCTO_SELECTORS.conversationListUnreadNumMuted) != null,
    isAi: row.querySelector(OCTO_SELECTORS.aiBadge) != null,
    time: text(row, OCTO_SELECTORS.conversationListTime),
    // The pinned class is Octo's own, maintained live by React.
    pinned: row.matches(OCTO_SELECTORS.conversationListItemTop),
  };
}

/** Lists that hold normal rows — i.e. the 最近 tab. 关注 renders compact rows. */
function normalLists(): Element[] {
  return Array.from(document.querySelectorAll(OCTO_SELECTORS.conversationList)).filter(
    (list) => list.querySelector(`:scope > ${OCTO_SELECTORS.conversationListItem}`) != null,
  );
}

function rowsOf(list: Element): Element[] {
  return Array.from(list.querySelectorAll(`:scope > ${OCTO_SELECTORS.conversationListItem}`));
}

/**
 * Hover text carrying everything L3 took off the row: parent group, name, time.
 *
 * The name is read off the `<h3>` rather than off `-name`, because Octo nests the
 * timestamp *inside* `-name` — `textContent` there would yield "Code Review刚刚".
 * Returns '' when there is no name to anchor the tooltip on, which is also how a
 * lower level asks for the title to be dropped again.
 */
function titleOf(row: Element): string {
  const name = text(row, `${OCTO_SELECTORS.conversationListItemName} > h3`);
  if (!name) return '';
  const crumb = text(row, OCTO_SELECTORS.conversationListBreadcrumb);
  const time = text(row, OCTO_SELECTORS.conversationListTime);
  return [crumb, name, time].filter(Boolean).join(' · ');
}

/**
 * Write (or drop) our hover text on one row.
 *
 * Guarded by `TITLE_ATTRIBUTE` so removal only ever touches a title we wrote, and
 * by an equality check so a re-stamp of an unchanged row performs no DOM write at
 * all — the observer ignores attributes, but a pointless write is still a write.
 */
function stampTitle(row: Element, title: string): void {
  const owned = row.hasAttribute(TITLE_ATTRIBUTE);
  if (title) {
    // A title that was there before we ever stamped is Octo's. Overwriting it
    // would replace information we do not own — and leave nothing to restore on
    // teardown — so those rows simply keep theirs.
    if (!owned && row.hasAttribute('title')) return;
    if (row.getAttribute('title') !== title) row.setAttribute('title', title);
    if (!owned) row.setAttribute(TITLE_ATTRIBUTE, 'true');
    return;
  }
  if (!owned) return;
  row.removeAttribute('title');
  row.removeAttribute(TITLE_ATTRIBUTE);
}

function clearRowStamps(row: Element): void {
  row.removeAttribute(MERGED_ATTRIBUTE);
  row.removeAttribute(RUN_ATTRIBUTE);
  row.removeAttribute(RUN_LABEL_ATTRIBUTE);
  row.removeAttribute(STALE_ATTRIBUTE);
  stampTitle(row, '');
}

// ─── the folded-away footer ───────────────────────────────────────────────

function footerOf(list: Element): HTMLElement | null {
  return list.querySelector(`:scope > .${FOOTER_CLASS}`);
}

function ensureFooter(list: Element): HTMLElement {
  const existing = footerOf(list);
  if (existing) return existing;
  const foot = document.createElement('div');
  foot.className = FOOTER_CLASS;
  foot.setAttribute('role', 'button');
  foot.setAttribute('tabindex', '0');
  foot.addEventListener('click', (event) => {
    // The row underneath would otherwise receive this through React's delegated
    // listener and open a conversation.
    event.stopPropagation();
    event.preventDefault();
    staleExpanded = !staleExpanded;
    applyRecentAttribute();
    refreshFooters();
  });
  // Appending as the container's last child is safe: React only ever removes
  // children it created, so an extra sibling is left alone. Moving *its* rows
  // would not be.
  list.appendChild(foot);
  return foot;
}

function refreshFooters(): void {
  for (const list of normalLists()) {
    const hidden = rowsOf(list).filter(
      (row) => row.getAttribute(STALE_ATTRIBUTE) === 'true',
    ).length;
    if (!recentOnly || hidden === 0) {
      footerOf(list)?.remove();
      continue;
    }
    const foot = ensureFooter(list);
    foot.textContent = staleExpanded ? '收起更早的会话' : `更早的 ${hidden} 个会话 ›`;
  }
}

function removeFooters(): void {
  for (const foot of document.querySelectorAll(`.${FOOTER_CLASS}`)) foot.remove();
}

function applyRecentAttribute(): void {
  if (!recentOnly) {
    document.body?.removeAttribute(RECENT_ATTRIBUTE);
    return;
  }
  document.body?.setAttribute(RECENT_ATTRIBUTE, staleExpanded ? 'open' : 'on');
}

// ─── stamping ─────────────────────────────────────────────────────────────

function stampAll(): void {
  if (!needsStamping()) return;
  if (stamping) return;
  stamping = true;
  try {
    for (const list of normalLists()) {
      const rows = rowsOf(list);
      const plan = planConvStamps(rows.map(factsOf), {
        groupRuns: appliedLevel >= 4,
        groupAi: appliedLevel >= 4,
        foldStale: recentOnly,
      });
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const stamp = plan[i];
        if (stamp.merged) row.setAttribute(MERGED_ATTRIBUTE, 'true');
        else row.removeAttribute(MERGED_ATTRIBUTE);
        if (stamp.stale) row.setAttribute(STALE_ATTRIBUTE, 'true');
        else row.removeAttribute(STALE_ATTRIBUTE);
        if (stamp.run) {
          row.setAttribute(RUN_ATTRIBUTE, stamp.run);
          if (stamp.runLabel) row.setAttribute(RUN_LABEL_ATTRIBUTE, stamp.runLabel);
          else row.removeAttribute(RUN_LABEL_ATTRIBUTE);
        } else {
          row.removeAttribute(RUN_ATTRIBUTE);
          row.removeAttribute(RUN_LABEL_ATTRIBUTE);
        }
        // L3 hid the breadcrumb and the timestamp; the tooltip is where they stay
        // reachable. Below L3 nothing is hidden, so nothing needs a tooltip.
        stampTitle(row, appliedLevel >= 3 ? titleOf(row) : '');
      }
    }
    refreshFooters();
  } catch {
    // A structure change on Octo's side must degrade to "no compaction", never
    // take the page down.
  } finally {
    stamping = false;
  }
}

function clearAllStamps(): void {
  for (const row of document.querySelectorAll(
    `[${MERGED_ATTRIBUTE}],[${RUN_ATTRIBUTE}],[${RUN_LABEL_ATTRIBUTE}],[${STALE_ATTRIBUTE}],[${TITLE_ATTRIBUTE}]`,
  )) {
    clearRowStamps(row);
  }
}

/**
 * Coalesce to the next frame rather than a timed debounce.
 *
 * The stamp has to land before paint or a freshly inserted row shows for a frame
 * without its header/indent and visibly jumps. A 120 ms debounce would guarantee
 * that flicker; rAF runs after the mutation task and before the next paint.
 */
function scheduleStamp(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    stampAll();
  });
}

// ─── observers ────────────────────────────────────────────────────────────

function isOwnFooterMutation(records: MutationRecord[]): boolean {
  return records.every((record) => {
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.length === 0) return false;
    return nodes.every(
      (node) =>
        node.nodeType === 1 && (node as Element).classList?.contains(FOOTER_CLASS),
    );
  });
}

function watchList(list: Element): void {
  if (listObservers.has(list)) return;
  const observer = new MutationObserver((records) => {
    // Our own footer insert/remove is a childList mutation, so it has to be
    // filtered or every stamp pass would schedule another one.
    if (isOwnFooterMutation(records)) return;
    scheduleStamp();
  });
  // No `attributes`: our row stamps are attributes, so leaving them unobserved is
  // what makes a feedback loop structurally impossible rather than merely guarded.
  // `characterData` is needed because a preview or a timestamp can change without
  // any node being added or removed — and the timestamp is what staleness reads.
  observer.observe(list, { childList: true, subtree: true, characterData: true });
  listObservers.set(list, observer);
}

function syncObservers(): void {
  for (const list of normalLists()) watchList(list);
  // Drop observers for lists that were unmounted (tab switch), so we do not hold
  // detached nodes alive.
  for (const [list, observer] of listObservers) {
    if (!list.isConnected) {
      observer.disconnect();
      listObservers.delete(list);
    }
  }
}

function attachObservers(): void {
  if (!needsStamping()) return;
  syncObservers();
  if (!rootObserver && document.body) {
    // The list container itself mounts and unmounts as the user switches tabs, so
    // something has to notice a new one appearing.
    rootObserver = new MutationObserver(() => {
      syncObservers();
      scheduleStamp();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
  }
  scheduleStamp();
}

function detachObservers(): void {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  for (const observer of listObservers.values()) observer.disconnect();
  listObservers.clear();
  rootObserver?.disconnect();
  rootObserver = null;
}

// ─── public surface ───────────────────────────────────────────────────────

/** Undo every page-side trace. Shared by "nothing to do" and by real teardown. */
function cleanupDom(): void {
  detachObservers();
  clearAllStamps();
  removeFooters();
  document.body?.removeAttribute(LEVEL_ATTRIBUTE);
  document.body?.removeAttribute(RECENT_ATTRIBUTE);
  document.getElementById(STYLE_ID)?.remove();
}

function apply(): void {
  const next = effectiveLevel();
  const wasStamping = needsStamping();
  appliedLevel = next;

  if (next === 0 && !recentOnly) {
    // Nothing to render. Clean the page but keep the requested state: this path
    // is also reached from setConvSortActive, and forgetting what the user asked
    // for here would make the next setting message look like a no-op.
    staleExpanded = false;
    cleanupDom();
    return;
  }

  ensureStyle();
  if (next === 0) document.body?.removeAttribute(LEVEL_ATTRIBUTE);
  else document.body?.setAttribute(LEVEL_ATTRIBUTE, String(next));
  applyRecentAttribute();

  if (needsStamping()) {
    attachObservers();
    // Level changes alter the plan (grouping on/off), so re-stamp even when the
    // observer was already running.
    scheduleStamp();
  } else if (wasStamping) {
    // Dropping to a level that needs no stamping: stop watching and clear, or a
    // later re-enable inherits a grouping computed for a list that has moved on.
    detachObservers();
    clearAllStamps();
    removeFooters();
  }
}

export function setConvCompact(level: ConvCompactLevel): void {
  requestedLevel = level;
  apply();
}

/** Hide conversations older than a week. Orthogonal to the level. */
export function setConvRecentOnly(enabled: boolean): void {
  if (recentOnly === enabled) return;
  recentOnly = enabled;
  // Re-collapse on every re-enable: an expansion is a one-off "let me look",
  // not a preference.
  staleExpanded = false;
  apply();
}

/**
 * Tell compaction whether the attention sort is running, so L4 can step down to
 * L3. See the header for why the two cannot both be on.
 */
export function setConvSortActive(active: boolean): void {
  if (sortActive === active) return;
  sortActive = active;
  apply();
}

export function teardownConvCompact(): void {
  appliedLevel = 0;
  staleExpanded = false;
  // Reset the *requested* state, not just the applied state. This runs as
  // PageFeature.stop on master-off, and the content script replays every setting
  // on master-on. If `recentOnly` stayed true here, that replay would hit the
  // `=== enabled` guard in setConvRecentOnly, count as "no change", and the
  // feature would never come back.
  //
  // `sortActive` is deliberately NOT reset: it mirrors another feature's state,
  // arrives on its own message, and clearing it here would let L4 come back while
  // the sort is still running.
  requestedLevel = 'off';
  recentOnly = false;
  cleanupDom();
}
