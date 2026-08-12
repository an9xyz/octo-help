// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setComposerFormatToolbar,
  teardownComposerFormatToolbar,
} from './octoComposerFormat';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function mountComposer(selectedText: string) {
  const card = document.createElement('div');
  card.className = 'wk-messageinput-card';
  const editorElement = document.createElement('div');
  editorElement.className = 'wk-messageinput-editor';
  const proseMirror = document.createElement('div');
  proseMirror.className = 'ProseMirror';
  proseMirror.textContent = selectedText;
  editorElement.appendChild(proseMirror);
  card.appendChild(editorElement);
  document.body.appendChild(card);

  const chainApi = {
    focus: vi.fn(),
    insertContentAt: vi.fn(),
    run: vi.fn(() => true),
  };
  chainApi.focus.mockReturnValue(chainApi);
  chainApi.insertContentAt.mockReturnValue(chainApi);
  const editor = {
    state: {
      selection: { from: 1, to: 1 + selectedText.length, empty: false },
      doc: {
        textBetween: vi.fn(() => selectedText),
        nodesBetween: vi.fn(),
      },
    },
    chain: vi.fn(() => chainApi),
  };
  Object.defineProperty(proseMirror, 'editor', { value: editor });

  const range = document.createRange();
  range.selectNodeContents(proseMirror.firstChild!);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  return { chainApi, proseMirror };
}

afterEach(() => {
  teardownComposerFormatToolbar();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('composer format toolbar', () => {
  it('renders for a composer text selection and writes Markdown through Tiptap on click', async () => {
    const { chainApi } = mountComposer('重点');

    setComposerFormatToolbar(true);
    document.dispatchEvent(new Event('selectionchange'));
    await nextFrame();

    const toolbar = document.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    const bold = toolbar?.querySelector<HTMLButtonElement>('[aria-label="加粗"]');
    expect(bold).not.toBeNull();
    bold?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    bold?.click();

    expect(chainApi.insertContentAt).toHaveBeenCalledWith(
      { from: 1, to: 3 },
      { type: 'text', text: '**重点**' },
    );
  });

  it('removes the toolbar when the selection is cleared or the feature is disabled', async () => {
    const { proseMirror } = mountComposer('重点');

    setComposerFormatToolbar(true);
    document.dispatchEvent(new Event('selectionchange'));
    await nextFrame();
    expect(document.querySelector('[role="toolbar"]')).not.toBeNull();

    setComposerFormatToolbar(true);
    await nextFrame();
    expect(document.querySelectorAll('[role="toolbar"]')).toHaveLength(1);

    proseMirror.parentElement?.parentElement?.remove();
    document.dispatchEvent(new Event('selectionchange'));
    await nextFrame();
    expect(document.querySelector('[role="toolbar"]')).toBeNull();

    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    await nextFrame();
    expect(document.querySelector('[role="toolbar"]')).toBeNull();

    setComposerFormatToolbar(false);
    expect(document.getElementById('octo-composer-format-style')).toBeNull();
  });
});
