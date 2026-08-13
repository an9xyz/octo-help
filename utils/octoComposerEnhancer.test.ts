import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./octoMentionBar', () => ({
  setMentionQuickBar: vi.fn(),
  teardownMentionQuickBar: vi.fn(),
}));

vi.mock('./octoComposerFormat', () => ({
  setComposerFormatToolbar: vi.fn(),
  teardownComposerFormatToolbar: vi.fn(),
}));

import { setComposerEnhancement, teardownComposerEnhancement } from './octoComposerEnhancer';
import { setMentionQuickBar, teardownMentionQuickBar } from './octoMentionBar';
import {
  setComposerFormatToolbar,
  teardownComposerFormatToolbar,
} from './octoComposerFormat';

// ─── DOM mock ───────────────────────────────────────────────────────────

let bodyAttributes: Map<string, string | null>;
let elementsById: Map<string, any>;
let headAppendedElements: any[];

beforeEach(() => {
  bodyAttributes = new Map();
  elementsById = new Map();
  headAppendedElements = [];

  const mockBody = {
    setAttribute: vi.fn((key: string, value: string) => {
      bodyAttributes.set(key, value);
    }),
    removeAttribute: vi.fn((key: string) => {
      bodyAttributes.set(key, null);
    }),
  };

  vi.stubGlobal('document', {
    getElementById: vi.fn((id: string) => elementsById.get(id) ?? null),
    createElement: vi.fn((tag: string) => {
      const el: any = {
        tagName: tag.toUpperCase(),
        id: '',
        textContent: '',
        style: {} as Record<string, string>,
        remove: vi.fn(() => {
          elementsById.delete(el.id);
        }),
      };
      let _id = '';
      Object.defineProperty(el, 'id', {
        get: () => _id,
        set: (v: string) => { _id = v; if (v) elementsById.set(v, el); },
        configurable: true,
      });
      return el;
    }),
    head: {
      appendChild: vi.fn((child: any) => {
        headAppendedElements.push(child);
      }),
    },
    documentElement: {},
    body: mockBody,
  } as unknown as typeof document);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe('setComposerEnhancement', () => {
  it('injects style element on enable', () => {
    setComposerEnhancement(true);

    const style = elementsById.get('octo-composer-enhancement-style');
    expect(style).toBeDefined();
    expect(style.tagName).toBe('STYLE');
    expect(style.textContent).toContain('ProseMirror');
    expect(style.textContent).toContain('min-height: 60px');
  });

  it('appends style to document.head', () => {
    setComposerEnhancement(true);

    expect(headAppendedElements.length).toBe(1);
    expect(headAppendedElements[0].tagName).toBe('STYLE');
  });

  it('sets data-octo-composer-enhanced on body', () => {
    setComposerEnhancement(true);

    expect(bodyAttributes.get('data-octo-composer-enhanced')).toBe('true');
  });

  it('calls setMentionQuickBar(true) on enable', () => {
    setComposerEnhancement(true);

    expect(setMentionQuickBar).toHaveBeenCalledWith(true);
    expect(setComposerFormatToolbar).toHaveBeenCalledWith(true);
  });

  it('is idempotent — does not inject duplicate styles', () => {
    setComposerEnhancement(true);
    const styleCount = headAppendedElements.length;

    setComposerEnhancement(true);

    expect(headAppendedElements.length).toBe(styleCount);
  });
});

describe('disable via setComposerEnhancement(false)', () => {
  it('removes data attribute from body', () => {
    setComposerEnhancement(true);
    setComposerEnhancement(false);

    expect(bodyAttributes.get('data-octo-composer-enhanced')).toBeNull();
  });

  it('removes the injected style element', () => {
    setComposerEnhancement(true);
    expect(elementsById.has('octo-composer-enhancement-style')).toBe(true);

    setComposerEnhancement(false);

    expect(elementsById.has('octo-composer-enhancement-style')).toBe(false);
  });

  it('calls teardownMentionQuickBar', () => {
    setComposerEnhancement(true);
    setComposerEnhancement(false);

    expect(teardownMentionQuickBar).toHaveBeenCalled();
    expect(teardownComposerFormatToolbar).toHaveBeenCalled();
  });
});

describe('teardownComposerEnhancement', () => {
  it('removes data attribute from body', () => {
    setComposerEnhancement(true);
    teardownComposerEnhancement();

    expect(bodyAttributes.get('data-octo-composer-enhanced')).toBeNull();
  });

  it('removes the injected style element', () => {
    setComposerEnhancement(true);
    teardownComposerEnhancement();

    expect(elementsById.has('octo-composer-enhancement-style')).toBe(false);
  });

  it('calls teardownMentionQuickBar', () => {
    setComposerEnhancement(true);
    teardownComposerEnhancement();

    expect(teardownMentionQuickBar).toHaveBeenCalled();
    expect(teardownComposerFormatToolbar).toHaveBeenCalled();
  });

  it('is safe to call multiple times', () => {
    expect(() => {
      teardownComposerEnhancement();
      teardownComposerEnhancement();
      teardownComposerEnhancement();
    }).not.toThrow();
  });
});
