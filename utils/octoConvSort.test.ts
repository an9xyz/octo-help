import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConvSort, teardownConvSort } from './octoConvSort';
import { OCTO_SELECTORS } from './octoSelectors';

/**
 * What these tests protect.
 *
 * The feature is a single stylesheet, so the failure modes are not logic bugs —
 * they are (a) leaving the style or the body attribute behind after teardown,
 * which breaks the "master off looks uninstalled" guarantee, and (b) someone
 * editing the CSS and dropping one of two rules whose absence is invisible in
 * review:
 *
 *   - `flex: 0 0 auto`, without which the sidebar silently compresses instead of
 *     overflowing, and
 *   - the `:not(:has(mention))` exclusion on the muted rung, without which a
 *     muted conversation that is @me-ing you sinks to the bottom — the exact
 *     opposite of the feature's purpose.
 *
 * Both are pinned as selector-text assertions. That is deliberately a little
 * brittle: these strings are the whole feature, so a change to them should have
 * to be acknowledged.
 */

let elementsById: Map<string, any>;
let bodyAttributes: Map<string, string>;

function mockEl(tag: string): any {
  const self: any = {
    tagName: tag.toUpperCase(),
    textContent: '',
    children: [],
    parentNode: null,
    remove: vi.fn(() => {
      if (self.parentNode) {
        const idx = self.parentNode.children.indexOf(self);
        if (idx >= 0) self.parentNode.children.splice(idx, 1);
      }
      if (self.id) elementsById.delete(self.id);
    }),
    appendChild: vi.fn((child: any) => {
      child.parentNode = self;
      self.children.push(child);
      if (child.id) elementsById.set(child.id, child);
    }),
    setAttribute: vi.fn((name: string, value: string) => {
      bodyAttributes.set(name, value);
    }),
    removeAttribute: vi.fn((name: string) => {
      bodyAttributes.delete(name);
    }),
  };
  let _id = '';
  Object.defineProperty(self, 'id', {
    get: () => _id,
    set: (v: string) => {
      _id = v;
      if (v) elementsById.set(v, self);
    },
    configurable: true,
  });
  return self;
}

let mockDoc: any;

/** The single <style> the feature injected, or null. */
function injectedStyle(): any {
  return elementsById.get('octo-conv-sort-style') ?? null;
}

beforeEach(() => {
  elementsById = new Map();
  bodyAttributes = new Map();
  mockDoc = {
    createElement: vi.fn((tag: string) => mockEl(tag)),
    getElementById: vi.fn((id: string) => elementsById.get(id) ?? null),
    body: mockEl('body'),
    head: mockEl('head'),
    documentElement: mockEl('html'),
  };
  vi.stubGlobal('document', mockDoc);
});

afterEach(() => {
  teardownConvSort();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('enabling', () => {
  it('injects the stylesheet and gates it with the body attribute', () => {
    setConvSort(true);
    expect(injectedStyle()).not.toBeNull();
    expect(bodyAttributes.get('data-octo-conv-sort')).toBe('true');
  });

  it('injects only one stylesheet no matter how often it is re-applied', () => {
    setConvSort(true);
    setConvSort(true);
    setConvSort(true);
    expect(mockDoc.head.children).toHaveLength(1);
  });
});

describe('teardown', () => {
  it('removes both the stylesheet and the body attribute', () => {
    setConvSort(true);
    teardownConvSort();
    expect(injectedStyle()).toBeNull();
    expect(bodyAttributes.has('data-octo-conv-sort')).toBe(false);
  });

  it('is safe when the feature never started', () => {
    // PageFeature.stop is called unconditionally on master-off, including for
    // features the user never switched on.
    expect(() => teardownConvSort()).not.toThrow();
  });

  it('leaves nothing behind that would double-apply on re-enable', () => {
    setConvSort(true);
    setConvSort(false);
    expect(injectedStyle()).toBeNull();
    setConvSort(true);
    expect(mockDoc.head.children).toHaveLength(1);
  });
});

describe('the generated stylesheet', () => {
  function css(): string {
    setConvSort(true);
    return injectedStyle().textContent as string;
  }

  it('stops rows from being shrunk by the flex container', () => {
    // Absent this, a column flex container with height:100% compresses its
    // items rather than overflowing, and the symptom reads as a font bug.
    expect(css()).toContain('flex: 0 0 auto');
  });

  it('only turns a list into a flex container when it holds normal rows', () => {
    // This is what keeps the 关注 tab (compact rows) out of the feature, so its
    // drag-to-sort is untouched.
    expect(css()).toContain(`:has(> ${OCTO_SELECTORS.conversationListItem})`);
  });

  it('keeps an @me row out of the muted rung', () => {
    const muted = OCTO_SELECTORS.conversationListItemMuted;
    const mention = OCTO_SELECTORS.conversationListMention;
    // The rung must be mutually exclusive rather than relying on the cascade:
    // `:has()` inherits its argument's specificity, so a plain mention rule
    // would outweigh the pin rule and invert the intended precedence.
    expect(css()).toContain(`${muted}:not(${OCTO_SELECTORS.conversationListItemTop}):not(:has(${mention}))`);
  });

  it('orders the rungs pinned < needs-me < default < muted', () => {
    const text = css();
    const orders = [...text.matchAll(/order:\s*(-?\d+)/g)].map((m) => Number(m[1]));
    // Three explicit rungs; 「其它」 is deliberately absent so it inherits 0.
    expect(orders).toHaveLength(3);
    expect(Math.min(...orders)).toBeLessThan(0);
    expect(Math.max(...orders)).toBeGreaterThan(0);
    expect(orders).not.toContain(0);
  });
});
