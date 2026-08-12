import { describe, expect, it, vi } from 'vitest';

import {
  applyComposerFormat,
  markdownForComposerSelection,
  type ComposerFormatKind,
} from './octoComposerFormat';

describe('markdownForComposerSelection', () => {
  const cases: Array<[ComposerFormatKind, string, string]> = [
    ['bold', '重点', '**重点**'],
    ['italic', '补充', '*补充*'],
    ['strike', '过期', '~~过期~~'],
    ['inlineCode', 'pnpm test', '`pnpm test`'],
    ['quote', '第一行\n第二行', '> 第一行\n> 第二行'],
    ['codeBlock', 'const x = 1;', '```\nconst x = 1;\n```'],
  ];

  it.each(cases)('formats %s without making the user type Markdown', (kind, selected, expected) => {
    expect(markdownForComposerSelection(kind, selected)).toBe(expected);
  });

  it('uses a fenced code block when inline code spans multiple lines', () => {
    expect(markdownForComposerSelection('inlineCode', 'a\nb')).toBe('```\na\nb\n```');
  });

  it.each([
    ['bold', '**重点**', '重点'],
    ['italic', '*补充*', '补充'],
    ['strike', '~~过期~~', '过期'],
    ['inlineCode', '`pnpm test`', 'pnpm test'],
    ['quote', '> 第一行\n> 第二行', '第一行\n第二行'],
    ['codeBlock', '```\nconst x = 1;\n```', 'const x = 1;'],
  ] as Array<[ComposerFormatKind, string, string]>)('toggles %s off when its own Markdown is selected', (kind, selected, expected) => {
    expect(markdownForComposerSelection(kind, selected)).toBe(expected);
  });

  it('returns null for an empty selection', () => {
    expect(markdownForComposerSelection('bold', '')).toBeNull();
  });
});

describe('applyComposerFormat', () => {
  function createEditor(options: {
    text: string;
    hasNonTextInline?: boolean;
  }) {
    const chainApi = {
      focus: vi.fn(),
      insertContentAt: vi.fn(),
      run: vi.fn(() => true),
    };
    chainApi.focus.mockReturnValue(chainApi);
    chainApi.insertContentAt.mockReturnValue(chainApi);
    const chain = vi.fn(() => chainApi);
    const nodesBetween = vi.fn((_: number, __: number, visit: (node: { isInline?: boolean; isText?: boolean }) => void) => {
      if (options.hasNonTextInline) visit({ isInline: true, isText: false });
    });

    return {
      editor: {
        state: {
          selection: { from: 4, to: 4 + options.text.length, empty: options.text.length === 0 },
          doc: {
            textBetween: vi.fn(() => options.text),
            nodesBetween,
          },
        },
        chain,
      },
      chain,
      focus: chainApi.focus,
      insertContentAt: chainApi.insertContentAt,
      nodesBetween,
    };
  }

  it('replaces the selected text through the page editor transaction', () => {
    const { editor, chain, focus, insertContentAt } = createEditor({ text: '重点' });

    expect(applyComposerFormat(editor, 'bold')).toBe(true);
    expect(chain).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(insertContentAt).toHaveBeenCalledWith(
      { from: 4, to: 6 },
      { type: 'text', text: '**重点**' },
    );
  });

  it('writes selected angle brackets as a text node instead of parsed HTML', () => {
    const { editor, insertContentAt } = createEditor({ text: '<draft>' });

    expect(applyComposerFormat(editor, 'italic')).toBe(true);
    expect(insertContentAt).toHaveBeenCalledWith(
      { from: 4, to: 11 },
      { type: 'text', text: '*<draft>*' },
    );
  });

  it('does not flatten a real mention or attachment into untrusted text', () => {
    const { editor, insertContentAt, nodesBetween } = createEditor({
      text: '@Alice',
      hasNonTextInline: true,
    });

    expect(applyComposerFormat(editor, 'italic')).toBe(false);
    expect(nodesBetween).toHaveBeenCalledWith(4, 10, expect.any(Function));
    expect(insertContentAt).not.toHaveBeenCalled();
  });

  it('does not run a transaction for a collapsed selection', () => {
    const { editor, insertContentAt } = createEditor({ text: '' });

    expect(applyComposerFormat(editor, 'quote')).toBe(false);
    expect(insertContentAt).not.toHaveBeenCalled();
  });

  it('fails closed when the page editor has been destroyed or lost its transaction API', () => {
    const { editor, insertContentAt } = createEditor({ text: '重点' });
    Object.assign(editor, { isDestroyed: true });

    expect(applyComposerFormat(editor, 'bold')).toBe(false);
    expect(applyComposerFormat(undefined, 'bold')).toBe(false);
    expect(insertContentAt).not.toHaveBeenCalled();
  });
});
