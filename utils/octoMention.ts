/**
 * Insert a *real* mention into Octo's composer.
 *
 * The important discovery here: a mention is not text. Octo's send path only
 * honours mentions that came from a Tiptap `mention` **node** — on send the editor
 * is serialized to `@[uid:label]` and re-parsed, and node-origin broadcast
 * sentinels are the only ones allowed to route (octo-web#330 hardened literal
 * text against forging `@所有人`). So typing `@张三` into the box produces text that
 * *looks* right and notifies nobody. Anything we build has to produce the node.
 *
 * Second discovery, which makes that easy and cheap: Tiptap hangs the editor
 * instance on its own DOM element. `.ProseMirror` has an own `editor` property
 * (verified on the live build), so we can call the exact command Octo's own
 * "@TA" menu calls —
 *
 *     editor.commands.insertContent({ type: 'mention', attrs: { id, label } })
 *
 * — with no React internals involved. Verified end to end: the resulting node is
 * `<span data-type="mention" data-id="…" data-label="…">`, i.e. indistinguishable
 * from one picked out of Octo's own dropdown.
 *
 * If that handle is ever missing we **fail closed** and insert nothing. A fake @
 * is worse than no feature: the user would believe someone was notified.
 */

import { OCTO_SELECTORS } from './octoSelectors';

/** Minimal slice of the Tiptap editor we rely on. */
interface TiptapLike {
  commands?: {
    insertContent?: (content: unknown) => boolean;
    focus?: () => boolean;
  };
  chain?: () => any;
  schema?: { nodes?: Record<string, unknown> };
  isDestroyed?: boolean;
}

/**
 * The composer's editor, or null when the composer is absent / not the shape we
 * know. Also rejects an editor whose schema has no `mention` node, since inserting
 * one would throw inside Tiptap.
 */
export function findComposerEditor(doc: Document = document): TiptapLike | null {
  const element =
    doc.querySelector(OCTO_SELECTORS.composerEditor) ?? doc.querySelector('.ProseMirror');
  if (!element) return null;
  const editor = (element as Element & { editor?: TiptapLike }).editor;
  if (!editor || editor.isDestroyed) return null;
  if (typeof editor.commands?.insertContent !== 'function') return null;
  if (!editor.schema?.nodes?.mention) return null;
  return editor;
}

/** Is the quick-@ path available at all? Used to decide whether to show the UI. */
export function canInsertMention(doc: Document = document): boolean {
  return findComposerEditor(doc) != null;
}

/**
 * Insert `@label ` as a real mention node. Returns false when the editor handle is
 * gone, so the caller can hide the UI instead of silently doing nothing.
 *
 * The trailing space mirrors Octo's own `addMention`: without it the next thing you
 * type lands glued to the chip.
 */
export function insertMention(uid: string, label: string, doc: Document = document): boolean {
  if (!uid || !label) return false;
  const editor = findComposerEditor(doc);
  if (!editor) return false;
  try {
    // Prefer the chained form so focus/insert/insert land in one transaction and
    // the caret ends up after the chip — the same sequence Octo uses.
    if (typeof editor.chain === 'function') {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'mention', attrs: { id: uid, label } })
        .insertContent(' ')
        .run();
      return true;
    }
    editor.commands?.focus?.();
    editor.commands?.insertContent?.({ type: 'mention', attrs: { id: uid, label } });
    editor.commands?.insertContent?.(' ');
    return true;
  } catch {
    // A Tiptap schema/version change is the realistic cause. Report failure so the
    // strip disappears rather than looking broken.
    return false;
  }
}
