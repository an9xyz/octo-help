import { OCTO_SELECTORS } from './octoSelectors';

export type ComposerFormatKind =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'quote'
  | 'codeBlock';

interface ComposerSelection {
  from: number;
  to: number;
  empty?: boolean;
}

interface ComposerDocument {
  textBetween: (from: number, to: number, blockSeparator?: string) => string;
  nodesBetween?: (
    from: number,
    to: number,
    visit: (node: { isInline?: boolean; isText?: boolean }) => void,
  ) => void;
}

interface ComposerFormatChain {
  focus: () => ComposerFormatChain;
  insertContentAt: (
    range: { from: number; to: number },
    content: { type: 'text'; text: string },
  ) => ComposerFormatChain;
  run: () => boolean;
}

export interface ComposerFormatEditor {
  isDestroyed?: boolean;
  state?: {
    selection?: ComposerSelection;
    doc?: ComposerDocument;
  };
  chain?: () => ComposerFormatChain;
}

const STYLE_ID = 'octo-composer-format-style';
const TOOLBAR_ID = 'octo-composer-format-toolbar';
const TOOLBAR_CLASS = 'octo-composer-format-toolbar';
const TOOLBAR_GAP_PX = 8;

const FORMAT_BUTTONS: ReadonlyArray<{
  kind: ComposerFormatKind;
  label: string;
  glyph: string;
}> = [
  { kind: 'bold', label: '加粗', glyph: 'B' },
  { kind: 'italic', label: '斜体', glyph: 'I' },
  { kind: 'strike', label: '删除线', glyph: 'S' },
  { kind: 'quote', label: '引用', glyph: '❝' },
  { kind: 'inlineCode', label: '行内代码', glyph: '<>' },
  { kind: 'codeBlock', label: '代码块', glyph: '{ }' },
];

let enabled = false;
let refreshFrame: number | null = null;

function stripOuterMarker(text: string, prefix: string, suffix: string): string | null {
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return null;
  const inner = text.slice(prefix.length, text.length - suffix.length);
  return inner ? inner : null;
}

function formatQuote(text: string): string {
  const lines = text.split('\n');
  const quoted = lines.every((line) => line.startsWith('> '));
  return quoted
    ? lines.map((line) => line.slice(2)).join('\n')
    : lines.map((line) => `> ${line}`).join('\n');
}

function formatCodeBlock(text: string): string {
  const wrapped = stripOuterMarker(text, '```\n', '\n```');
  return wrapped ?? `\`\`\`\n${text}\n\`\`\``;
}

/**
 * Builds the Markdown accepted by Octo's existing text-message renderer. The
 * user interacts with a visible selection toolbar; these delimiters are never
 * something they have to type themselves.
 */
export function markdownForComposerSelection(
  kind: ComposerFormatKind,
  selectedText: string,
): string | null {
  if (!selectedText) return null;

  switch (kind) {
    case 'bold':
      return stripOuterMarker(selectedText, '**', '**') ?? `**${selectedText}**`;
    case 'italic':
      return stripOuterMarker(selectedText, '*', '*') ?? `*${selectedText}*`;
    case 'strike':
      return stripOuterMarker(selectedText, '~~', '~~') ?? `~~${selectedText}~~`;
    case 'inlineCode':
      return selectedText.includes('\n')
        ? formatCodeBlock(selectedText)
        : stripOuterMarker(selectedText, '`', '`') ?? `\`${selectedText}\``;
    case 'quote':
      return formatQuote(selectedText);
    case 'codeBlock':
      return formatCodeBlock(selectedText);
  }
}

function selectionContainsNonTextInline(
  doc: ComposerDocument,
  from: number,
  to: number,
): boolean {
  let found = false;
  doc.nodesBetween?.(from, to, (node) => {
    if (node.isInline && !node.isText) found = true;
  });
  return found;
}

/**
 * Replace a text-only editor selection through a Tiptap transaction. Mentions
 * and attachment atoms are intentionally rejected: flattening either into
 * Markdown would lose the structured node that Octo needs at send time.
 */
export function applyComposerFormat(
  editor: ComposerFormatEditor | null | undefined,
  kind: ComposerFormatKind,
): boolean {
  const selection = editor?.state?.selection;
  const doc = editor?.state?.doc;
  if (!editor || editor.isDestroyed || !selection || !doc) return false;
  if (selection.empty || selection.from >= selection.to) return false;
  if (selectionContainsNonTextInline(doc, selection.from, selection.to)) return false;

  const replacement = markdownForComposerSelection(
    kind,
    doc.textBetween(selection.from, selection.to, '\n'),
  );
  if (!replacement || typeof editor.chain !== 'function') return false;

  try {
    return editor
      .chain()
      .focus()
      .insertContentAt(
        { from: selection.from, to: selection.to },
        { type: 'text', text: replacement },
      )
      .run();
  } catch {
    return false;
  }
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${TOOLBAR_CLASS} {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: var(--wk-sp-1, 4px);
      max-width: calc(100vw - 16px);
      padding: var(--wk-sp-2, 8px);
      border: 0;
      border-radius: var(--wk-r-md, 8px);
      background: var(--wk-text-primary);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--wk-text-primary) 35%, transparent);
      color: var(--wk-bg-surface);
      user-select: none;
    }
    body[theme-mode='dark'] .${TOOLBAR_CLASS} {
      background: var(--wk-bg-deep);
      color: var(--wk-text-primary);
    }
    .${TOOLBAR_CLASS}[hidden] { display: none; }
    .${TOOLBAR_CLASS}::after {
      position: absolute;
      z-index: 0;
      bottom: calc(-1 * var(--wk-sp-2, 8px));
      left: var(--octo-composer-toolbar-arrow-left, 50%);
      width: var(--wk-sp-4, 16px);
      height: var(--wk-sp-2, 8px);
      content: '';
      background: var(--wk-text-primary);
      clip-path: polygon(0 0, 100% 0, 50% 100%);
      pointer-events: none;
      transform: translateX(-50%);
    }
    body[theme-mode='dark'] .${TOOLBAR_CLASS}::after { background: var(--wk-bg-deep); }
    .${TOOLBAR_CLASS}[data-octo-placement='bottom']::after {
      top: calc(-1 * var(--wk-sp-2, 8px));
      bottom: auto;
      transform: translateX(-50%) rotate(180deg);
    }
    .${TOOLBAR_CLASS}-button {
      position: relative;
      z-index: 1;
      min-width: var(--wk-sp-10, 40px);
      height: var(--wk-sp-10, 40px);
      padding: 0 var(--wk-sp-2, 8px);
      border: 0;
      border-radius: var(--wk-r-sm, 5px);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: var(--wk-text-size-3xl, 22px);
      font-weight: 700;
      line-height: 1;
    }
    .${TOOLBAR_CLASS}-button:hover,
    .${TOOLBAR_CLASS}-button:focus-visible {
      background: var(--wk-bg-hover, color-mix(in srgb, currentColor 10%, transparent));
      outline: none;
    }
    .${TOOLBAR_CLASS}-button[data-octo-format='italic'] { font-style: italic; }
    .${TOOLBAR_CLASS}-button[data-octo-format='strike'] { text-decoration: line-through; }
    .${TOOLBAR_CLASS}-button[data-octo-format='inlineCode'],
    .${TOOLBAR_CLASS}-button[data-octo-format='codeBlock'] {
      font-family: var(--wk-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      letter-spacing: -0.04em;
    }
    .${TOOLBAR_CLASS}-button[data-octo-format='quote'] {
      margin-left: var(--wk-sp-1, 4px);
    }
    .${TOOLBAR_CLASS}-button[data-octo-format='quote']::before {
      position: absolute;
      top: var(--wk-sp-1, 4px);
      bottom: var(--wk-sp-1, 4px);
      left: calc(-1 * var(--wk-sp-1, 4px));
      width: 1px;
      content: '';
      background: color-mix(in srgb, currentColor 28%, transparent);
    }
    @media (max-width: 360px) {
      .${TOOLBAR_CLASS} {
        gap: var(--wk-sp-0-5, 2px);
        padding: var(--wk-sp-1, 4px);
      }
      .${TOOLBAR_CLASS}-button {
        min-width: var(--wk-sp-8, 32px);
        height: var(--wk-sp-8, 32px);
        font-size: var(--wk-text-size-2xl, 18px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .${TOOLBAR_CLASS}-button { transition: none; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function removeToolbar(): void {
  document.getElementById(TOOLBAR_ID)?.remove();
}

function findComposerSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>(OCTO_SELECTORS.composerEditor);
}

function findComposerFormatEditor(surface: HTMLElement): ComposerFormatEditor | null {
  const editor = (surface as HTMLElement & { editor?: ComposerFormatEditor }).editor;
  if (!editor || editor.isDestroyed || typeof editor.chain !== 'function') return null;
  return editor;
}

function currentComposerRange(surface: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return surface.contains(range.commonAncestorContainer) ? range : null;
}

function positionToolbar(
  toolbar: HTMLElement,
  range: Range,
  composerSurface: HTMLElement,
): void {
  const rect = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : composerSurface.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const width = toolbar.offsetWidth;
  const height = toolbar.offsetHeight;
  const left = Math.min(
    Math.max(TOOLBAR_GAP_PX, rect.left + rect.width / 2 - width / 2),
    Math.max(TOOLBAR_GAP_PX, viewportWidth - width - TOOLBAR_GAP_PX),
  );
  const placeBelow = rect.top - height - TOOLBAR_GAP_PX < TOOLBAR_GAP_PX;
  const maxTop = Math.max(TOOLBAR_GAP_PX, viewportHeight - height - TOOLBAR_GAP_PX);
  const top = placeBelow
    ? Math.min(Math.max(TOOLBAR_GAP_PX, rect.bottom + TOOLBAR_GAP_PX), maxTop)
    : Math.max(TOOLBAR_GAP_PX, rect.top - height - TOOLBAR_GAP_PX);
  const minArrowLeft = TOOLBAR_GAP_PX;
  const maxArrowLeft = Math.max(minArrowLeft, width - TOOLBAR_GAP_PX);
  const arrowLeft = Math.min(
    Math.max(minArrowLeft, rect.left + rect.width / 2 - left),
    maxArrowLeft,
  );
  toolbar.dataset.octoPlacement = placeBelow ? 'bottom' : 'top';
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  toolbar.style.setProperty('--octo-composer-toolbar-arrow-left', `${Math.round(arrowLeft)}px`);
}

function createToolbar(): HTMLElement | null {
  if (!document.body) return null;

  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;
  toolbar.className = TOOLBAR_CLASS;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', '消息格式');
  toolbar.addEventListener('mousedown', (event) => {
    // Keep the ProseMirror selection alive while a format action is clicked.
    event.preventDefault();
  });

  for (const item of FORMAT_BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${TOOLBAR_CLASS}-button`;
    button.dataset.octoFormat = item.kind;
    button.textContent = item.glyph;
    button.title = item.label;
    button.setAttribute('aria-label', item.label);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const surface = findComposerSurface();
      if (!surface) return;
      applyComposerFormat(findComposerFormatEditor(surface), item.kind);
      scheduleRefresh();
    });
    toolbar.appendChild(button);
  }

  document.body.appendChild(toolbar);
  return toolbar;
}

function refreshToolbar(): void {
  if (!enabled) return;
  const surface = findComposerSurface();
  if (!surface || !findComposerFormatEditor(surface)) {
    removeToolbar();
    return;
  }

  const range = currentComposerRange(surface);
  if (!range) {
    removeToolbar();
    return;
  }

  const toolbar = document.getElementById(TOOLBAR_ID) ?? createToolbar();
  if (!toolbar) return;
  positionToolbar(toolbar, range, surface);
}

function scheduleRefresh(): void {
  if (!enabled || refreshFrame !== null) return;
  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = null;
    refreshToolbar();
  });
}

function handleDocumentSelectionChange(): void {
  scheduleRefresh();
}

function shortcutFormatKind(event: KeyboardEvent): ComposerFormatKind | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;

  switch (event.key.toLowerCase()) {
    case 'b': return 'bold';
    case 'i': return 'italic';
    default: return null;
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  const kind = shortcutFormatKind(event);
  if (!kind) return;

  const surface = findComposerSurface();
  if (!surface || !currentComposerRange(surface)) return;
  if (!applyComposerFormat(findComposerFormatEditor(surface), kind)) return;

  // Only consume the browser shortcut after the page editor accepted the
  // transaction; unsupported selections retain their normal browser behavior.
  event.preventDefault();
  scheduleRefresh();
}

/** Enable the selection toolbar in the existing Octo composer. */
export function setComposerFormatToolbar(next: boolean): void {
  if (!next) {
    teardownComposerFormatToolbar();
    return;
  }
  if (enabled) {
    scheduleRefresh();
    return;
  }

  enabled = true;
  ensureStyle();
  document.addEventListener('selectionchange', handleDocumentSelectionChange);
  document.addEventListener('keydown', handleDocumentKeydown);
  document.addEventListener('scroll', handleDocumentSelectionChange, true);
  window.addEventListener('resize', handleDocumentSelectionChange);
  scheduleRefresh();
}

/** Remove every injected listener, node and style so the feature is reversible. */
export function teardownComposerFormatToolbar(): void {
  enabled = false;
  if (refreshFrame !== null) {
    window.cancelAnimationFrame(refreshFrame);
    refreshFrame = null;
  }
  document.removeEventListener('selectionchange', handleDocumentSelectionChange);
  document.removeEventListener('keydown', handleDocumentKeydown);
  document.removeEventListener('scroll', handleDocumentSelectionChange, true);
  window.removeEventListener('resize', handleDocumentSelectionChange);
  removeToolbar();
  document.getElementById(STYLE_ID)?.remove();
}
