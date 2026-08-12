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
      padding: var(--wk-sp-1, 4px);
      border: 1px solid var(--wk-border, color-mix(in srgb, currentColor 16%, transparent));
      border-radius: var(--wk-r-md, 8px);
      background: var(--wk-bg-elevated, var(--wk-bg-surface, #fff));
      box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
      color: var(--wk-text-primary, currentColor);
      user-select: none;
    }
    .${TOOLBAR_CLASS}[hidden] { display: none; }
    .${TOOLBAR_CLASS}-button {
      min-width: 30px;
      height: 30px;
      padding: 0 var(--wk-sp-2, 8px);
      border: 0;
      border-radius: var(--wk-r-sm, 5px);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-weight: 650;
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
      font-size: 12px;
      letter-spacing: -0.04em;
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
  const width = toolbar.offsetWidth;
  const height = toolbar.offsetHeight;
  const left = Math.min(
    Math.max(TOOLBAR_GAP_PX, rect.left + rect.width / 2 - width / 2),
    Math.max(TOOLBAR_GAP_PX, viewportWidth - width - TOOLBAR_GAP_PX),
  );
  const top = Math.max(TOOLBAR_GAP_PX, rect.top - height - TOOLBAR_GAP_PX);
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
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
  document.removeEventListener('scroll', handleDocumentSelectionChange, true);
  window.removeEventListener('resize', handleDocumentSelectionChange);
  removeToolbar();
  document.getElementById(STYLE_ID)?.remove();
}
