import { MESSAGE_SOURCE, MESSAGE_TYPE, type ConvFoldChangeMessage, type StoredConvFoldMap } from './octoShared';
import { OCTO_SELECTORS } from './octoSelectors';
import { conversationRefFromRow } from './octoConvRowKey';

/**
 * Manual, extension-owned folding for Octo's native conversation rows.
 *
 * The native row remains the unit of rendering and interaction. We only stamp
 * attributes, float one shared hover action, and append one manual-fold aggregate
 * entry. That keeps unread state, selection, avatars, official pin behavior and
 * opening a conversation under Octo's control instead of cloning its sidebar.
 */

const STYLE_ID = 'octo-conv-fold-style';
const BODY_ATTRIBUTE = 'data-octo-conv-fold';
const FOLDED_ATTRIBUTE = 'data-octo-conv-folded';
const KEY_ATTRIBUTE = 'data-octo-conv-fold-key';
const ACTION_CLASS = 'octo-conv-fold-action';
const ENTRY_CLASS = 'octo-conv-fold-entry';
const ENTRY_ICON_CLASS = 'octo-conv-fold-entry-icon';
const ENTRY_TEXT_CLASS = 'octo-conv-fold-entry-text';
const ENTRY_TITLE_CLASS = 'octo-conv-fold-entry-title';
const ENTRY_SUMMARY_CLASS = 'octo-conv-fold-entry-summary';
const ENTRY_COUNT_CLASS = 'octo-conv-fold-entry-count';
const ENTRY_UNREAD_CLASS = 'octo-conv-fold-entry-unread';
const ENTRY_CHEVRON_CLASS = 'octo-conv-fold-entry-chevron';
const ENTRY_ORDER = -110;
const REVEAL_ORDER = -109;
const ACTION_WIDTH = 48;
const ACTION_HEIGHT = 24;
const ACTION_INSET = 10;

let enabled = false;
let foldedByScope: StoredConvFoldMap = {};
let expanded = false;
let frame = 0;
let rootObserver: MutationObserver | null = null;
const listObservers = new Map<Element, MutationObserver>();
let action: HTMLButtonElement | null = null;
let actionRow: Element | null = null;
let actionKey = '';
let actionScope = '';
let actionFolded = false;
let hideTimer = 0;

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

function clearHideTimer(): void {
  if (!hideTimer) return;
  window.clearTimeout(hideTimer);
  hideTimer = 0;
}

function hideAction(): void {
  clearHideTimer();
  action?.removeAttribute('data-visible');
  actionRow = null;
  actionKey = '';
  actionScope = '';
}

function scheduleHideAction(): void {
  clearHideTimer();
  hideTimer = window.setTimeout(hideAction, 80);
}

function positionAction(): void {
  if (!action || !actionRow || !actionRow.isConnected) {
    hideAction();
    return;
  }
  const rect = actionRow.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
    hideAction();
    return;
  }
  const indicators = actionRow.querySelector(OCTO_SELECTORS.conversationListIndicators);
  const indicatorsLeft = indicators?.getBoundingClientRect().left;
  const rightEdge = indicatorsLeft && indicatorsLeft > rect.left + ACTION_WIDTH
    ? indicatorsLeft - 8
    : rect.right - ACTION_INSET;
  action.style.top = `${Math.round(rect.top + (rect.height - ACTION_HEIGHT) / 2)}px`;
  action.style.left = `${Math.round(Math.max(rect.left + 54, rightEdge - ACTION_WIDTH))}px`;
}

function ensureAction(): HTMLButtonElement | null {
  if (action?.isConnected) return action;
  if (!document.body) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ACTION_CLASS;
  button.addEventListener('pointerenter', clearHideTimer);
  button.addEventListener('pointerleave', scheduleHideAction);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!actionKey || !actionScope) return;
    const next = !actionFolded;
    const scope = actionScope;
    const key = actionKey;
    hideAction();
    applyOptimisticChange(scope, key, next);
    emitChange(scope, key, next);
  });
  document.body.appendChild(button);
  action = button;
  return button;
}

function showAction(row: Element, folded: boolean, key: string, scope: string): void {
  const button = ensureAction();
  if (!button) return;
  clearHideTimer();
  actionRow = row;
  actionKey = key;
  actionScope = scope;
  actionFolded = folded;
  button.textContent = folded ? '恢复' : '折叠';
  button.title = folded ? '恢复到会话列表' : '折叠该会话';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('data-visible', 'true');
  positionAction();
}

function actionForRow(row: Element): void {
  const scope = currentScope();
  const ref = conversationRefFromRow(row);
  if (!enabled || !scope || !ref) {
    scheduleHideAction();
    return;
  }
  const isFolded = foldedKeys().has(ref.key);
  if (isFolded && !expanded) {
    scheduleHideAction();
    return;
  }
  showAction(row, isFolded, ref.key, scope);
}

function onPointerOver(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(`.${ACTION_CLASS}`)) return;
  const row = target.closest(OCTO_SELECTORS.conversationListItem);
  if (row) actionForRow(row);
  else scheduleHideAction();
}

function onPointerOut(event: PointerEvent): void {
  if (!actionRow) return;
  const related = event.relatedTarget;
  if (related instanceof Node && (actionRow.contains(related) || action?.contains(related))) return;
  scheduleHideAction();
}

function onViewportChange(): void {
  if (actionRow) positionAction();
}

function onResize(): void {
  onViewportChange();
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

    .${ACTION_CLASS} {
      position: fixed;
      z-index: 2147483646;
      display: none;
      width: ${ACTION_WIDTH}px;
      height: ${ACTION_HEIGHT}px;
      padding: 0 6px;
      place-items: center;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #86909c;
      font: 12px/1 sans-serif;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: none;
    }
    .${ACTION_CLASS}[data-visible='true'] { display: grid; }
    .${ACTION_CLASS}:hover {
      background: #e9eef9;
      color: #245bdb;
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
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      position: relative;
      border-radius: 7px;
      background: #e9eef8;
    }
    .${ENTRY_ICON_CLASS}::before,
    .${ENTRY_ICON_CLASS}::after {
      position: absolute;
      width: 14px;
      height: 11px;
      border: 1.5px solid #5f6b7a;
      border-radius: 3px;
      background: #fff;
      content: '';
    }
    .${ENTRY_ICON_CLASS}::before { transform: translate(-2.5px, -2.5px); }
    .${ENTRY_ICON_CLASS}::after { transform: translate(2.5px, 2.5px); }
    .${ENTRY_CLASS}:hover .${ENTRY_ICON_CLASS} {
      background: #dfe7f5;
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

    body[theme-mode='dark'] .${ACTION_CLASS} {
      background: transparent;
      color: #d6d9de;
      box-shadow: none;
    }
    body[theme-mode='dark'] .${ACTION_CLASS}:hover {
      background: #273651;
      color: #a9c6ff;
    }
    body[theme-mode='dark'] .${ENTRY_CLASS} {
      border-color: rgba(255, 255, 255, .07);
      background: #25282d;
    }
    body[theme-mode='dark'] .${ENTRY_CLASS}:hover { background: #292c31; }
    body[theme-mode='dark'] .${ENTRY_TITLE_CLASS} { color: #e8eaed; }
    body[theme-mode='dark'] .${ENTRY_ICON_CLASS} { background: #32353b; }
    body[theme-mode='dark'] .${ENTRY_ICON_CLASS}::before,
    body[theme-mode='dark'] .${ENTRY_ICON_CLASS}::after {
      border-color: #aeb4bd;
      background: #272a2f;
    }
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
    const rows = rowsOf(list);
    for (const row of rows) {
      const ref = conversationRefFromRow(row);
      row.removeAttribute(FOLDED_ATTRIBUTE);
      row.removeAttribute(KEY_ATTRIBUTE);
      if (!scope || !ref) continue;

      row.setAttribute(KEY_ATTRIBUTE, ref.key);
      const isFolded = folded.has(ref.key);
      if (isFolded) {
        row.setAttribute(FOLDED_ATTRIBUTE, 'true');
      }
    }
  }
  if (actionRow) {
    if (!actionRow.isConnected) hideAction();
    else actionForRow(actionRow);
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
    if (target?.closest(`.${ACTION_CLASS},.${ENTRY_CLASS}`)) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length > 0 && nodes.every((node) => {
      if (node.nodeType !== 1) return false;
      const element = node as Element;
      return element.classList.contains(ACTION_CLASS) || element.classList.contains(ENTRY_CLASS);
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
  // Remove buttons left by an older hot-reloaded build. Native React rows must
  // never own extension children: they can corrupt virtual-list measurement.
  for (const legacy of document.querySelectorAll(
    `${OCTO_SELECTORS.conversationListItem} > .${ACTION_CLASS}`,
  )) legacy.remove();
  ensureAction();
  applyBodyState();
  syncObservers();
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('scroll', onViewportChange, true);
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
  document.removeEventListener('pointerover', onPointerOver, true);
  document.removeEventListener('pointerout', onPointerOut, true);
  document.removeEventListener('scroll', onViewportChange, true);
  window.removeEventListener('resize', onResize);
  clearHideTimer();
  action?.remove();
  action = null;
  actionRow = null;
  actionKey = '';
  actionScope = '';
  document.body?.removeAttribute(BODY_ATTRIBUTE);
  document.getElementById(STYLE_ID)?.remove();
  for (const button of document.querySelectorAll(`.${ACTION_CLASS}`)) button.remove();
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
  foldedByScope = {};
  cleanup();
}
