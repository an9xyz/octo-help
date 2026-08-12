import { MESSAGE_SOURCE, MESSAGE_TYPE, type ConvFoldChangeMessage, type StoredConvFoldMap } from './octoShared';
import { OCTO_SELECTORS } from './octoSelectors';
import { conversationRefFromRow } from './octoConvRowKey';

/**
 * Manual, extension-owned folding for Octo's native conversation rows.
 *
 * The native row remains the unit of rendering and interaction. We only stamp
 * attributes, add a small per-row fold action, and append one manual-fold aggregate
 * entry. That keeps unread state, selection, avatars, official pin behavior and
 * opening a conversation under Octo's control instead of cloning its sidebar.
 */

const STYLE_ID = 'octo-conv-fold-style';
const BODY_ATTRIBUTE = 'data-octo-conv-fold';
const FOLDED_ATTRIBUTE = 'data-octo-conv-folded';
const KEY_ATTRIBUTE = 'data-octo-conv-fold-key';
const AVATAR_ACTION_ATTRIBUTE = 'data-octo-conv-fold-avatar-action';
const AVATAR_SCOPE_ATTRIBUTE = 'data-octo-conv-fold-avatar-scope';
const AVATAR_KEY_ATTRIBUTE = 'data-octo-conv-fold-avatar-key';
const TOGGLE_CLASS = 'octo-conv-fold-row-toggle';
const TOGGLE_ICON_CLASS = 'octo-conv-fold-row-toggle-icon';
const TOGGLE_LABEL_CLASS = 'octo-conv-fold-row-toggle-label';
const TOGGLE_KNOB_CLASS = 'octo-conv-fold-row-toggle-knob';
const ENTRY_CLASS = 'octo-conv-fold-entry';
const ENTRY_ICON_CLASS = 'octo-conv-fold-entry-icon';
const ENTRY_TEXT_CLASS = 'octo-conv-fold-entry-text';
const ENTRY_TITLE_CLASS = 'octo-conv-fold-entry-title';
const ENTRY_SUMMARY_CLASS = 'octo-conv-fold-entry-summary';
const ENTRY_COUNT_CLASS = 'octo-conv-fold-entry-count';
const ENTRY_UNREAD_CLASS = 'octo-conv-fold-entry-unread';
const ENTRY_CHEVRON_CLASS = 'octo-conv-fold-entry-chevron';
const TOGGLE_ORDER = -111;
const ENTRY_ORDER = -110;
const REVEAL_ORDER = -109;
const PLUGIN_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M512 1024a128.102857 128.102857 0 0 1-111.805714-65.725714 128 128 0 0 1-218.285715-61.405715 128 128 0 0 1-126.114285-221.714285C19.142857 606.537143 0 529.222857 0 448 0 184.228571 210.548571 0 512 0s512 184.228571 512 448c0 81.222857-19.142857 158.537143-55.84 227.131429a128 128 0 0 1-126.114286 221.714285 128 128 0 0 1-218.285714 61.405715A128.102857 128.102857 0 0 1 512 1024z" fill="#f44393"/><path d="M896 704c-2.377143 0-4.731429 0.148571-7.051429 0.354286C941.714286 634.125714 972.8 546.64 972.8 448c0-254.491429-206.308571-396.8-460.8-396.8S51.2 193.508571 51.2 448c0 98.64 31.074286 186.125714 83.851429 256.354286-2.285714-0.205714-4.674286-0.354286-7.051429-0.354286a76.8 76.8 0 1 0 76.8 76.8c0-1.337143-0.137143-2.651429-0.205714-3.977143a443.097143 443.097143 0 0 0 51.211428 36.571429A76.765714 76.765714 0 1 0 384 870.4c0-1.142857-0.114286-2.205714-0.171429-3.314286a498.422857 498.422857 0 0 0 53.622858 10.742857 76.8 76.8 0 1 0 149.097142 0 498.422857 498.422857 0 0 0 53.622858-10.742857c0 1.142857-0.171429 2.194286-0.171429 3.314286a76.8 76.8 0 1 0 128.194286-56.96 443.097143 443.097143 0 0 0 51.211428-36.571429c-0.068571 1.325714-0.205714 2.64-0.205714 3.977143A76.8 76.8 0 1 0 896 704z" fill="#F5CEDB"/><path d="M972.8 780.8a76.8 76.8 0 0 1-153.6 0c0-1.28 0.125714-2.685714 0.251429-3.965714a431.531429 431.531429 0 0 1-51.325715 36.571428A76.742857 76.742857 0 1 1 640 870.4c0-1.142857 0.125714-2.171429 0.125714-3.325714a484.571429 484.571429 0 0 1-53.634285 10.754285 76.8 76.8 0 1 1-148.982858 0 484.571429 484.571429 0 0 1-53.634285-10.754285c0 1.142857 0.125714 2.171429 0.125714 3.325714a76.8 76.8 0 1 1-128.125714-56.96 431.531429 431.531429 0 0 1-51.325715-36.571429c0.125714 1.28 0.251429 2.685714 0.251429 3.965715a76.8 76.8 0 1 1-84.868571-76.411429A515.942857 515.942857 0 0 0 428.8 806.4c281.348571 0 510.205714-224 518.274286-503.428571 16.64 43.142857 25.725714 91.657143 25.725714 145.028571 0 98.685714-31.108571 186.114286-83.84 256.388571A61.554286 61.554286 0 0 1 896 704a76.868571 76.868571 0 0 1 76.8 76.8z" fill="#EBC5D2"/><path d="M512 550.4a64.068571 64.068571 0 0 1-64-64 12.8 12.8 0 1 1 25.6 0 38.4 38.4 0 0 0 76.8 0 12.8 12.8 0 1 1 25.6 0 64.068571 64.068571 0 0 1-64 64z" fill="#25467A"/><path d="M384 384m-38.4 0a38.4 38.4 0 1 0 76.8 0 38.4 38.4 0 1 0-76.8 0Z" fill="#25467A"/><path d="M640 384m-38.4 0a38.4 38.4 0 1 0 76.8 0 38.4 38.4 0 1 0-76.8 0Z" fill="#25467A"/><path d="M332.8 448h-51.2a25.6 25.6 0 1 0 0 51.2h51.2a25.6 25.6 0 1 0 0-51.2zM742.4 448h-51.2a25.6 25.6 0 1 0 0 51.2h51.2a25.6 25.6 0 0 0 0-51.2z" fill="#f44393"/></svg>';
const PLUGIN_ICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(PLUGIN_ICON_SVG)}`;

let enabled = false;
let foldedByScope: StoredConvFoldMap = {};
let expanded = false;
let avatarActionsVisible = false;
let frame = 0;
let rootObserver: MutationObserver | null = null;
const listObservers = new Map<Element, MutationObserver>();

function currentScope(): string | null {
  try {
    const sid = sessionStorage.getItem('octo.session.sid') ?? '';
    const uid = sessionStorage.getItem(`uid${sid}`) || localStorage.getItem(`uid${sid}`) || '';
    const space = localStorage.getItem('currentSpaceId') || 'default';
    return uid ? `${uid}:${space}` : null;
  } catch {
    return null;
  }
}

function foldedKeys(): Set<string> {
  const scope = currentScope();
  return new Set(scope ? foldedByScope[scope] ?? [] : []);
}

function normalLists(): Element[] {
  return Array.from(document.querySelectorAll(OCTO_SELECTORS.conversationList)).filter(
    (list) => list.querySelector(`:scope > ${OCTO_SELECTORS.conversationListItem}`) != null,
  );
}

function rowsOf(list: Element): Element[] {
  return Array.from(list.querySelectorAll(`:scope > ${OCTO_SELECTORS.conversationListItem}`));
}

function emitChange(scope: string, conversationKey: string, folded: boolean): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE.convFoldChange,
      scope,
      conversationKey,
      folded,
    } satisfies ConvFoldChangeMessage,
    '*',
  );
}

function applyOptimisticChange(scope: string, conversationKey: string, folded: boolean): void {
  const next = new Set(foldedByScope[scope] ?? []);
  if (folded) next.add(conversationKey);
  else next.delete(conversationKey);
  foldedByScope = { ...foldedByScope };
  if (next.size > 0) foldedByScope[scope] = [...next];
  else delete foldedByScope[scope];
  scheduleStamp();
}

function onAvatarActionClick(event: Event): void {
  const avatar = event.currentTarget as Element;
  const scope = avatar.getAttribute(AVATAR_SCOPE_ATTRIBUTE) ?? '';
  const key = avatar.getAttribute(AVATAR_KEY_ATTRIBUTE) ?? '';
  if (!scope || !key) return;
  event.preventDefault();
  event.stopPropagation();
  const next = avatar.getAttribute(AVATAR_ACTION_ATTRIBUTE) !== 'folded';
  applyOptimisticChange(scope, key, next);
  emitChange(scope, key, next);
}

function ensureAvatarAction(row: Element, folded: boolean, key: string, scope: string): void {
  const avatar = row.querySelector<HTMLElement>(OCTO_SELECTORS.conversationListAvatarBox);
  if (!avatar) return;
  const label = folded ? '点击恢复到会话列表' : '点击折叠该会话';
  avatar.setAttribute(AVATAR_ACTION_ATTRIBUTE, folded ? 'folded' : 'open');
  avatar.setAttribute(AVATAR_SCOPE_ATTRIBUTE, scope);
  avatar.setAttribute(AVATAR_KEY_ATTRIBUTE, key);
  avatar.setAttribute('role', 'button');
  avatar.setAttribute('aria-label', label);
  avatar.setAttribute('title', label);
  if (avatar.getAttribute('data-octo-conv-fold-bound') !== 'true') {
    avatar.addEventListener('click', onAvatarActionClick, true);
    avatar.setAttribute('data-octo-conv-fold-bound', 'true');
  }
}

function removeAvatarAction(row: Element): void {
  const avatar = row.querySelector<HTMLElement>(OCTO_SELECTORS.conversationListAvatarBox);
  avatar?.removeAttribute(AVATAR_ACTION_ATTRIBUTE);
  avatar?.removeAttribute(AVATAR_SCOPE_ATTRIBUTE);
  avatar?.removeAttribute(AVATAR_KEY_ATTRIBUTE);
  avatar?.removeAttribute('role');
  avatar?.removeAttribute('aria-label');
  avatar?.removeAttribute('title');
}

function updateRowActionToggle(toggle: HTMLButtonElement): void {
  const label = avatarActionsVisible
    ? '已开启章鱼折叠入口，点击章鱼头像可折叠或恢复会话'
    : '开启章鱼折叠入口，用章鱼头像替换会话头像，点击可折叠或恢复会话';
  toggle.setAttribute('aria-pressed', avatarActionsVisible ? 'true' : 'false');
  toggle.setAttribute('data-enabled', avatarActionsVisible ? 'true' : 'false');
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
}

function ensureRowActionToggle(list: Element): HTMLButtonElement {
  let toggle = list.querySelector<HTMLButtonElement>(`:scope > .${TOGGLE_CLASS}`);
  if (toggle) {
    updateRowActionToggle(toggle);
    return toggle;
  }
  toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = TOGGLE_CLASS;
  const icon = document.createElement('span');
  icon.className = TOGGLE_ICON_CLASS;
  icon.setAttribute('aria-hidden', 'true');
  toggle.appendChild(icon);
  const label = document.createElement('span');
  label.className = TOGGLE_LABEL_CLASS;
  label.textContent = '章鱼折叠入口';
  toggle.appendChild(label);
  const knob = document.createElement('span');
  knob.className = TOGGLE_KNOB_CLASS;
  knob.setAttribute('aria-hidden', 'true');
  toggle.appendChild(knob);
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    avatarActionsVisible = !avatarActionsVisible;
    scheduleStamp();
  });
  list.appendChild(toggle);
  updateRowActionToggle(toggle);
  return toggle;
}

function onResize(): void {
  if (enabled) scheduleStamp();
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  const row = OCTO_SELECTORS.conversationListItem;
  style.textContent = `
    body[${BODY_ATTRIBUTE}='on'] ${row}[${FOLDED_ATTRIBUTE}='true'] {
      display: none;
    }

    body[${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true'] {
      order: ${REVEAL_ORDER} !important;
      box-sizing: border-box;
      width: calc(100% - 20px);
      margin: 3px 7px 0 13px;
      border: 0;
      border-radius: 6px;
      background: rgba(255, 255, 255, .78);
      box-shadow: inset 0 0 0 1px rgba(78, 89, 105, .07);
    }
    body[${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true']:hover,
    body[${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true']${OCTO_SELECTORS.conversationListSelected} {
      background: #f2f5fb;
      box-shadow: inset 0 0 0 1px rgba(51, 112, 255, .12);
    }

    body[${BODY_ATTRIBUTE}] ${OCTO_SELECTORS.conversationList}:has(> ${row}) {
      display: flex;
      flex-direction: column;
    }
    body[${BODY_ATTRIBUTE}] ${OCTO_SELECTORS.conversationList}:has(> ${row}) > * {
      flex: 0 0 auto;
    }

    .${TOGGLE_CLASS} {
      order: ${TOGGLE_ORDER};
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 30px;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      margin: 0 10px 4px 13px;
      padding: 4px 8px;
      border: 0;
      border-bottom: 1px solid #eef0f2;
      background: transparent;
      color: #6b7280;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .${TOGGLE_CLASS}:hover { background: #f5f6f8; }
    .${TOGGLE_ICON_CLASS} {
      width: 18px;
      height: 18px;
      background: url("${PLUGIN_ICON_DATA_URL}") center / contain no-repeat;
      opacity: .72;
    }
    .${TOGGLE_LABEL_CLASS} {
      overflow: hidden;
      font-size: 12px;
      line-height: 16px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${TOGGLE_KNOB_CLASS} {
      position: relative;
      width: 30px;
      height: 16px;
      border-radius: 999px;
      background: #d7dbe1;
      transition: background .16s ease;
    }
    .${TOGGLE_KNOB_CLASS}::after {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(31, 35, 41, .18);
      content: '';
      transition: transform .16s ease;
    }
    .${TOGGLE_CLASS}[data-enabled='true'] .${TOGGLE_KNOB_CLASS} { background: #ff6ba8; }
    .${TOGGLE_CLASS}[data-enabled='true'] .${TOGGLE_KNOB_CLASS}::after { transform: translateX(14px); }

    [${AVATAR_ACTION_ATTRIBUTE}] {
      background: url("${PLUGIN_ICON_DATA_URL}") center / contain no-repeat !important;
      cursor: pointer;
      overflow: visible;
    }
    [${AVATAR_ACTION_ATTRIBUTE}] > * {
      visibility: hidden !important;
    }

    .${ENTRY_CLASS} {
      order: ${ENTRY_ORDER};
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto 7px 14px;
      align-items: center;
      gap: 9px;
      min-height: 48px;
      padding: 6px 11px;
      border: 0;
      border-top: 1px solid #f0f1f2;
      border-bottom: 1px solid #eef0f2;
      background: #f8f9fb;
      color: #1f2329;
      font: inherit;
      text-align: left;
      cursor: pointer;
      user-select: none;
      flex: 0 0 auto;
      margin-bottom: 3px;
    }
    .${ENTRY_CLASS}:hover { background: #f1f4f8; }
    .${ENTRY_ICON_CLASS} {
      display: block;
      width: 32px;
      height: 32px;
      background: url("${PLUGIN_ICON_DATA_URL}") center / contain no-repeat;
    }
    .${ENTRY_TEXT_CLASS} {
      display: grid;
      min-width: 0;
    }
    .${ENTRY_TITLE_CLASS} {
      overflow: hidden;
      color: #1f2329;
      font-size: 14px;
      font-weight: 500;
      line-height: 19px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${ENTRY_SUMMARY_CLASS} {
      overflow: hidden;
      margin-top: 1px;
      color: #86909c;
      font-size: 12px;
      line-height: 16px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${ENTRY_CLASS}[aria-expanded='true'] .${ENTRY_SUMMARY_CLASS} { display: none; }
    .${ENTRY_COUNT_CLASS} {
      color: #86909c;
      font-size: 12px;
      line-height: 18px;
      text-align: center;
      white-space: nowrap;
    }
    .${ENTRY_UNREAD_CLASS} {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #f54a45;
    }
    .${ENTRY_CLASS}[data-unread='false'] .${ENTRY_UNREAD_CLASS} { visibility: hidden; }
    .${ENTRY_CHEVRON_CLASS} {
      color: #c4c7cc;
      font: 14px/1 sans-serif;
      text-align: center;
    }

    body[theme-mode='dark'] .${TOGGLE_CLASS} {
      border-color: rgba(255, 255, 255, .07);
      color: #aeb4bd;
    }
    body[theme-mode='dark'] .${TOGGLE_CLASS}:hover { background: #292c31; }
    body[theme-mode='dark'] .${ENTRY_CLASS} {
      border-color: rgba(255, 255, 255, .07);
      background: #25282d;
    }
    body[theme-mode='dark'] .${ENTRY_CLASS}:hover { background: #292c31; }
    body[theme-mode='dark'] .${ENTRY_TITLE_CLASS} { color: #e8eaed; }
    body[theme-mode='dark'][${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true'] {
      background: rgba(41, 44, 50, .92);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06);
    }
    body[theme-mode='dark'][${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true']:hover,
    body[theme-mode='dark'][${BODY_ATTRIBUTE}='open'] ${row}[${FOLDED_ATTRIBUTE}='true']${OCTO_SELECTORS.conversationListSelected} {
      background: #30394b;
      box-shadow: inset 0 0 0 1px rgba(118, 163, 255, .14);
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function entryOf(list: Element): HTMLButtonElement | null {
  return list.querySelector(`:scope > .${ENTRY_CLASS}`);
}

function addEntryPart(parent: Element, className: string, text = ''): HTMLSpanElement {
  const part = document.createElement('span');
  part.className = className;
  part.textContent = text;
  parent.appendChild(part);
  return part;
}

function ensureEntry(list: Element): HTMLButtonElement {
  const existing = entryOf(list);
  if (existing) return existing;
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = ENTRY_CLASS;
  addEntryPart(entry, ENTRY_ICON_CLASS);
  const text = addEntryPart(entry, ENTRY_TEXT_CLASS);
  addEntryPart(text, ENTRY_TITLE_CLASS, '折叠的会话');
  addEntryPart(text, ENTRY_SUMMARY_CLASS);
  addEntryPart(entry, ENTRY_COUNT_CLASS);
  addEntryPart(entry, ENTRY_UNREAD_CLASS);
  addEntryPart(entry, ENTRY_CHEVRON_CLASS, '›');
  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    expanded = !expanded;
    applyBodyState();
    refreshEntries();
    entry.scrollIntoView?.({ block: 'nearest' });
  };
  entry.addEventListener('click', toggle);
  list.appendChild(entry);
  return entry;
}

function applyBodyState(): void {
  if (!enabled) document.body?.removeAttribute(BODY_ATTRIBUTE);
  else document.body?.setAttribute(BODY_ATTRIBUTE, expanded ? 'open' : 'on');
}

function setText(element: Element | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}

function rowName(row: Element): string {
  return row.querySelector(`${OCTO_SELECTORS.conversationListItemName} > h3`)?.textContent?.trim() ?? '';
}

function refreshEntries(): void {
  for (const list of normalLists()) {
    const rows = rowsOf(list).filter((row) => row.getAttribute(FOLDED_ATTRIBUTE) === 'true');
    if (!enabled || rows.length === 0) {
      entryOf(list)?.remove();
      continue;
    }
    const entry = ensureEntry(list);
    const names = [...new Set(rows.map(rowName).filter(Boolean))];
    const summary = expanded
      ? `已展开 ${rows.length} 个会话`
      : names.length > 0
        ? `${names.slice(0, 3).join('、')}${names.length > 3 ? ' 等' : ''}`
        : `${rows.length} 个会话`;
    const hasUnread = rows.some(
      (row) => row.querySelector(OCTO_SELECTORS.conversationListIndicators) != null,
    );
    entry.setAttribute('data-unread', hasUnread ? 'true' : 'false');
    entry.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    setText(entry.querySelector(`.${ENTRY_SUMMARY_CLASS}`), summary);
    setText(entry.querySelector(`.${ENTRY_COUNT_CLASS}`), `${rows.length} 个`);
    setText(entry.querySelector(`.${ENTRY_CHEVRON_CLASS}`), expanded ? '⌄' : '›');
  }
}

function stampAll(): void {
  if (!enabled) return;
  const scope = currentScope();
  const folded = foldedKeys();
  for (const list of normalLists()) {
    ensureRowActionToggle(list);
    const rows = rowsOf(list);
    for (const row of rows) {
      const ref = conversationRefFromRow(row);
      row.removeAttribute(FOLDED_ATTRIBUTE);
      row.removeAttribute(KEY_ATTRIBUTE);
      if (!scope || !ref) {
        removeAvatarAction(row);
        continue;
      }

      row.setAttribute(KEY_ATTRIBUTE, ref.key);
      const isFolded = folded.has(ref.key);
      if (avatarActionsVisible) ensureAvatarAction(row, isFolded, ref.key, scope);
      else removeAvatarAction(row);
      if (isFolded) {
        row.setAttribute(FOLDED_ATTRIBUTE, 'true');
      }
    }
  }
  refreshEntries();
}

function scheduleStamp(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    try {
      stampAll();
    } catch {
      // A changed Octo row shape degrades to no folding, never a broken list.
    }
  });
}

function isOwnMutation(records: MutationRecord[]): boolean {
  return records.every((record) => {
    const target = record.target instanceof Element
      ? record.target
      : record.target.parentElement;
    if (target?.closest(`[${AVATAR_ACTION_ATTRIBUTE}],.${ENTRY_CLASS}`)) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length > 0 && nodes.every((node) => {
      if (node.nodeType !== 1) return false;
      const element = node as Element;
      return element.hasAttribute(AVATAR_ACTION_ATTRIBUTE) || element.classList.contains(ENTRY_CLASS);
    });
  });
}

function watchList(list: Element): void {
  if (listObservers.has(list)) return;
  const observer = new MutationObserver((records) => {
    if (!isOwnMutation(records)) scheduleStamp();
  });
  observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  listObservers.set(list, observer);
}

function syncObservers(): void {
  for (const list of normalLists()) watchList(list);
  for (const [list, observer] of listObservers) {
    if (!list.isConnected) {
      observer.disconnect();
      listObservers.delete(list);
    }
  }
}

function attach(): void {
  ensureStyle();
  // Remove controls left by older hot-reloaded builds.
  for (const legacy of document.querySelectorAll(
    `${OCTO_SELECTORS.conversationListItem} > .octo-conv-fold-action`,
  )) legacy.remove();
  applyBodyState();
  syncObservers();
  window.addEventListener('resize', onResize);
  if (!rootObserver && document.body) {
    rootObserver = new MutationObserver((records) => {
      if (isOwnMutation(records)) return;
      syncObservers();
      scheduleStamp();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
  }
  scheduleStamp();
}

function cleanup(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  rootObserver?.disconnect();
  rootObserver = null;
  for (const observer of listObservers.values()) observer.disconnect();
  listObservers.clear();
  window.removeEventListener('resize', onResize);
  document.body?.removeAttribute(BODY_ATTRIBUTE);
  document.getElementById(STYLE_ID)?.remove();
  for (const toggle of document.querySelectorAll(`.${TOGGLE_CLASS}`)) toggle.remove();
  for (const avatar of document.querySelectorAll(`[${AVATAR_ACTION_ATTRIBUTE}]`)) {
    avatar.removeAttribute(AVATAR_ACTION_ATTRIBUTE);
    avatar.removeAttribute(AVATAR_SCOPE_ATTRIBUTE);
    avatar.removeAttribute(AVATAR_KEY_ATTRIBUTE);
    avatar.removeAttribute('role');
    avatar.removeAttribute('aria-label');
    avatar.removeAttribute('title');
  }
  for (const entry of document.querySelectorAll(`.${ENTRY_CLASS}`)) entry.remove();
  for (const row of document.querySelectorAll(
    `[${FOLDED_ATTRIBUTE}],[${KEY_ATTRIBUTE}]`,
  )) {
    row.removeAttribute(FOLDED_ATTRIBUTE);
    row.removeAttribute(KEY_ATTRIBUTE);
  }
}

export function setConvFoldEnabled(next: boolean): void {
  enabled = next;
  expanded = false;
  avatarActionsVisible = false;
  if (enabled) attach();
  else cleanup();
}

export function setConvFoldState(next: StoredConvFoldMap): void {
  foldedByScope = next;
  if (enabled) scheduleStamp();
}

export function teardownConvFold(): void {
  enabled = false;
  expanded = false;
  avatarActionsVisible = false;
  foldedByScope = {};
  cleanup();
}
