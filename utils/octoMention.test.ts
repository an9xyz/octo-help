import { describe, expect, it, vi } from 'vitest';
import { canInsertMention, findComposerEditor, insertMention } from './octoMention';
import { OCTO_SELECTORS } from './octoSelectors';

/**
 * Stand-in for Tiptap's editor as it is actually reachable: hung on the
 * `.ProseMirror` element's own `editor` property (verified on the live build).
 */
function fakeDoc(editor: unknown, selector: string = OCTO_SELECTORS.composerEditor): Document {
  const element = { editor };
  return {
    querySelector: (query: string) => (query === selector ? element : null),
  } as unknown as Document;
}

function chainableEditor() {
  const inserted: unknown[] = [];
  const chain = {
    focus: () => chain,
    insertContent: (content: unknown) => {
      inserted.push(content);
      return chain;
    },
    run: () => true,
  };
  return {
    inserted,
    editor: {
      schema: { nodes: { mention: {} } },
      commands: { insertContent: () => true, focus: () => true },
      chain: () => chain,
    },
  };
}

describe('findComposerEditor', () => {
  it('finds the editor on the ProseMirror element', () => {
    const { editor } = chainableEditor();
    expect(findComposerEditor(fakeDoc(editor))).toBe(editor);
    expect(canInsertMention(fakeDoc(editor))).toBe(true);
  });

  it('rejects an editor whose schema has no mention node', () => {
    // Inserting a node the schema does not know throws inside Tiptap, so this is
    // checked up front — the UI is hidden rather than erroring on click.
    const editor = { schema: { nodes: {} }, commands: { insertContent: () => true } };
    expect(findComposerEditor(fakeDoc(editor))).toBeNull();
  });

  it('rejects a destroyed or unrecognizable editor', () => {
    expect(findComposerEditor(fakeDoc(undefined))).toBeNull();
    expect(findComposerEditor(fakeDoc({ isDestroyed: true, schema: { nodes: { mention: {} } } }))).toBeNull();
    expect(findComposerEditor(fakeDoc({ schema: { nodes: { mention: {} } } }))).toBeNull();
  });
});

describe('insertMention', () => {
  it('inserts a real mention node plus a trailing space', () => {
    // This exact payload is what Octo's own "@TA" runs. A mention is a *node*: the
    // send path only honours node-origin mentions, so plain "@name" text would
    // look right and notify nobody.
    const { editor, inserted } = chainableEditor();
    expect(insertMention('u1', '张三', fakeDoc(editor))).toBe(true);
    expect(inserted).toEqual([{ type: 'mention', attrs: { id: 'u1', label: '张三' } }, ' ']);
  });

  it('works without chain() support', () => {
    const calls: unknown[] = [];
    const editor = {
      schema: { nodes: { mention: {} } },
      commands: {
        focus: () => true,
        insertContent: (content: unknown) => {
          calls.push(content);
          return true;
        },
      },
    };
    expect(insertMention('u1', '张三', fakeDoc(editor))).toBe(true);
    expect(calls).toEqual([{ type: 'mention', attrs: { id: 'u1', label: '张三' } }, ' ']);
  });

  it('fails closed rather than inserting fake text', () => {
    // The whole point: if we cannot produce a real mention we insert nothing. A
    // cosmetic "@张三" would make the user believe someone was notified.
    expect(insertMention('u1', '张三', fakeDoc(undefined))).toBe(false);
    expect(insertMention('', '张三', fakeDoc(chainableEditor().editor))).toBe(false);
    expect(insertMention('u1', '', fakeDoc(chainableEditor().editor))).toBe(false);
  });

  it('reports failure when the editor throws', () => {
    const editor = {
      schema: { nodes: { mention: {} } },
      commands: { insertContent: () => true },
      chain: () => {
        throw new Error('schema changed');
      },
    };
    expect(insertMention('u1', '张三', fakeDoc(editor))).toBe(false);
  });

  it('falls back to a bare .ProseMirror when the composer wrapper is renamed', () => {
    const { editor } = chainableEditor();
    const doc = fakeDoc(editor, '.ProseMirror');
    expect(insertMention('u1', '张三', doc)).toBe(true);
  });
});

describe('no accidental global use', () => {
  it('does not read the ambient document when one is passed', () => {
    // The module must stay usable from a MAIN-world script that hands in its own
    // document; a stray global read would make behaviour depend on load order.
    const spy = vi.fn();
    // @ts-expect-error - deliberately absent in the node test environment
    globalThis.document = { querySelector: spy };
    insertMention('u1', '张三', fakeDoc(chainableEditor().editor));
    expect(spy).not.toHaveBeenCalled();
    // @ts-expect-error - cleanup
    delete globalThis.document;
  });
});
