import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module captures MutationObserver / requestAnimationFrame at call time, but
// installing them before load keeps the import side-effect free either way.
vi.hoisted(() => {
  function MockMO(this: any) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
  }
  globalThis.MutationObserver = MockMO as unknown as typeof MutationObserver;
});

import {
  setConvCompact,
  setConvRecentOnly,
  setConvSortActive,
  teardownConvCompact,
} from './octoConvCompact';
import { CONV_SORT_ORDER_MUTED } from './octoConvSort';

/**
 * What these tests protect.
 *
 * The important one is `every rule is scoped to a row`. The first version of this
 * stylesheet built a two-level gate as `body[..='2'],body[..='3']` and
 * interpolated it in front of a descendant selector. CSS binds the descendant to
 * the last alternative only, so `body[..='2']` was left as a bare selector with
 * `display:none` — at L2 the entire page went blank. Nothing in TypeScript, eslint
 * or a unit test of the pure logic could see it; only rendering it did.
 *
 * So the invariant is pinned as text: no comma-separated part of any selector list
 * may be a bare `body[...]` with no descendant.
 */

let elementsById: Map<string, any>;
let bodyAttrs: Map<string, string>;
/** Callbacks handed to requestAnimationFrame, run on demand by `flushFrames`. */
let frames: FrameRequestCallback[];
/** Conversation lists `document.querySelectorAll` should return. */
let lists: any[];

function mockEl(tag: string): any {
  const self: any = {
    tagName: tag.toUpperCase(),
    textContent: '',
    children: [],
    parentNode: null,
    remove: vi.fn(() => {
      if (self.id) elementsById.delete(self.id);
    }),
    appendChild: vi.fn((child: any) => {
      child.parentNode = self;
      self.children.push(child);
      if (child.id) elementsById.set(child.id, child);
    }),
    setAttribute: vi.fn((n: string, v: string) => bodyAttrs.set(n, v)),
    removeAttribute: vi.fn((n: string) => bodyAttrs.delete(n)),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
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

/**
 * A row that answers just enough of the DOM surface `factsOf`/`titleOf` touch.
 * Attribute writes are recorded so the stamps can be asserted.
 */
function fakeRow(parts: { crumb?: string; name?: string; time?: string } = {}): any {
  const attrs = new Map<string, string>();
  const texts: Record<string, string | undefined> = {
    '.wk-conv-breadcrumb': parts.crumb,
    '.wk-conversationlist-item-name > h3': parts.name,
    '.wk-conversationlist-item-time': parts.time,
  };
  return {
    attrs,
    querySelector: (selector: string) =>
      texts[selector] != null ? { textContent: texts[selector] } : null,
    matches: () => false,
    getAttribute: (n: string) => attrs.get(n) ?? null,
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string, v: string) => attrs.set(n, v),
    removeAttribute: (n: string) => attrs.delete(n),
  };
}

/** A list container holding `rows`, shaped for the `:scope >` queries. */
function fakeList(rows: any[]): any {
  return {
    querySelector: (selector: string) =>
      selector.includes('wk-conversationlist-item') ? (rows[0] ?? null) : null,
    querySelectorAll: (selector: string) =>
      selector.includes('wk-conversationlist-item') ? rows : [],
    appendChild: vi.fn(),
  };
}

function flushFrames(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(0);
}

function css(): string {
  return (elementsById.get('octo-conv-compact-style')?.textContent as string) ?? '';
}

beforeEach(() => {
  elementsById = new Map();
  bodyAttrs = new Map();
  frames = [];
  lists = [];
  mockDoc = {
    createElement: vi.fn((tag: string) => mockEl(tag)),
    getElementById: vi.fn((id: string) => elementsById.get(id) ?? null),
    querySelectorAll: vi.fn((selector: string) =>
      selector === '.wk-conversationlist' ? lists : [],
    ),
    body: mockEl('body'),
    head: mockEl('head'),
    documentElement: mockEl('html'),
  };
  vi.stubGlobal('document', mockDoc);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  teardownConvCompact();
  setConvSortActive(false);
  setConvRecentOnly(false);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Selector lists in the generated sheet, comments and blocks stripped. */
function selectorParts(): string[] {
  const text = css().replace(/\/\*[\s\S]*?\*\//g, '');
  const parts: string[] = [];
  for (const chunk of text.split('}')) {
    const head = chunk.split('{')[0];
    if (!head || !head.trim()) continue;
    for (const one of head.split(',')) {
      const trimmed = one.trim();
      if (trimmed) parts.push(trimmed);
    }
  }
  return parts;
}

describe('the generated stylesheet', () => {
  it('never leaves a bare body selector in a rule', () => {
    setConvCompact('l4');
    const bare = selectorParts().filter((s) => /^body\[[^\]]*\]$/.test(s));
    // A bare `body[...]` rule applies its declarations to the whole page. The
    // original bug hid <body> at L2 exactly this way.
    expect(bare).toEqual([]);
  });

  it('scopes every rule to the conversation list or to our own node', () => {
    setConvCompact('l4');
    for (const part of selectorParts()) {
      // Either it targets Octo's list, or it is the one node we inject.
      expect(part).toMatch(/wk-conv|octo-conv-stale-foot/);
    }
  });

  it('never sizes the presence badge like the avatar', () => {
    setConvCompact('l3');
    // The badge is an absolutely positioned sibling of the avatar image, pinned to
    // bottom/right: -1px. Sizing it 26px turns it into a green disc that covers
    // the avatar completely — the 「头像变绿」 bug. Any selector that assigns the
    // avatar box's size must therefore exclude it.
    const avatarSizing = selectorParts().filter((s) =>
      /wk-conversationlist-item-avatar-box\s*>/.test(s),
    );
    expect(avatarSizing.length).toBeGreaterThan(0);
    for (const part of avatarSizing) {
      if (part.includes('> *')) {
        expect(part).toContain(':not(.wk-onlinestatusbadge)');
      }
    }
  });

  it('hides the merged row at every level from L2 up', () => {
    setConvCompact('l4');
    const merged = selectorParts().filter((s) => s.includes('data-octo-conv-merged'));
    // Each level must carry its own full selector, not share one via a comma.
    for (const level of ["compact='2']", "compact='3']", "compact='4']"]) {
      expect(merged.some((s) => s.includes(level))).toBe(true);
    }
  });

  it('promotes the breadcrumb at L2 and drops it from L3 up', () => {
    setConvCompact('l4');
    const crumb = selectorParts().filter((s) => s.endsWith('.wk-conv-breadcrumb'));
    // L2 lays it out as a title prefix; L3 turns the row into one line where the
    // parent group is no longer a decision input, so it goes away entirely.
    expect(crumb.some((s) => s.includes("compact='2']"))).toBe(true);
    for (const level of ["compact='3']", "compact='4']"]) {
      expect(crumb.some((s) => s.includes(level))).toBe(true);
    }
  });
});

describe('the hover text L3 leaves behind', () => {
  it('carries parent, name and time once the row is one line', () => {
    lists = [fakeList([fakeRow({ crumb: 'FT-OctoCore小分队', name: 'octo-设置中心', time: '星期三 16:54' })])];
    setConvCompact('l3');
    flushFrames();
    const row = lists[0].querySelectorAll('.wk-conversationlist-item')[0];
    // Everything L3 hid — breadcrumb and timestamp — stays one hover away.
    expect(row.getAttribute('title')).toBe('FT-OctoCore小分队 · octo-设置中心 · 星期三 16:54');
    expect(row.getAttribute('data-octo-conv-title')).toBe('true');
  });

  it('omits the parts a row does not have', () => {
    const row = fakeRow({ name: '孙悟空', time: '刚刚' });
    lists = [fakeList([row])];
    setConvCompact('l3');
    flushFrames();
    expect(row.getAttribute('title')).toBe('孙悟空 · 刚刚');
  });

  it('is not written below L3, where nothing is hidden', () => {
    const row = fakeRow({ crumb: 'A', name: 'B', time: '刚刚' });
    lists = [fakeList([row])];
    setConvCompact('l2');
    flushFrames();
    expect(row.hasAttribute('title')).toBe(false);
    expect(row.hasAttribute('data-octo-conv-title')).toBe(false);
  });

  it('drops the title again when the level steps back down', () => {
    const row = fakeRow({ crumb: 'A', name: 'B', time: '刚刚' });
    lists = [fakeList([row])];
    setConvCompact('l3');
    flushFrames();
    expect(row.hasAttribute('title')).toBe(true);
    setConvCompact('l2');
    flushFrames();
    // Only titles we stamped are ever removed — the marker attribute is the proof
    // of ownership, so it has to go with it.
    expect(row.hasAttribute('title')).toBe(false);
    expect(row.hasAttribute('data-octo-conv-title')).toBe(false);
  });

  it('never touches a title Octo put there itself', () => {
    const row = fakeRow({ crumb: 'A', name: 'B', time: '刚刚' });
    row.setAttribute('title', 'Octo自己的');
    lists = [fakeList([row])];
    setConvCompact('l3');
    flushFrames();
    // Overwriting it would replace information we do not own — and leave us with
    // nothing to restore on teardown.
    expect(row.getAttribute('title')).toBe('Octo自己的');
    expect(row.hasAttribute('data-octo-conv-title')).toBe(false);
  });
});

describe('levels', () => {
  it('stamps the level onto the body attribute', () => {
    setConvCompact('l1');
    expect(bodyAttrs.get('data-octo-conv-compact')).toBe('1');
    setConvCompact('l4');
    expect(bodyAttrs.get('data-octo-conv-compact')).toBe('4');
  });

  it('off removes the attribute and the stylesheet', () => {
    setConvCompact('l2');
    setConvCompact('off');
    expect(bodyAttrs.has('data-octo-conv-compact')).toBe(false);
    expect(css()).toBe('');
  });

  it('injects only one stylesheet across repeated level changes', () => {
    setConvCompact('l1');
    setConvCompact('l2');
    setConvCompact('l3');
    setConvCompact('l4');
    expect(mockDoc.head.children).toHaveLength(1);
  });
});

describe('the L4 / sort exclusion', () => {
  it('degrades L4 to L3 while the attention sort is active', () => {
    setConvSortActive(true);
    setConvCompact('l4');
    // L4 groups by "same parent as the previous row", which only holds in DOM
    // order; the sort reorders visually with CSS `order`.
    expect(bodyAttrs.get('data-octo-conv-compact')).toBe('3');
  });

  it('restores L4 when the sort is switched off', () => {
    setConvCompact('l4');
    setConvSortActive(true);
    expect(bodyAttrs.get('data-octo-conv-compact')).toBe('3');
    setConvSortActive(false);
    expect(bodyAttrs.get('data-octo-conv-compact')).toBe('4');
  });

  it('leaves the lower rungs alone when the sort is active', () => {
    // The ladder is ordered so the rung people actually want — L3, the one that
    // stops streaming message content — is never disabled by this conflict.
    setConvSortActive(true);
    for (const [level, expected] of [['l1', '1'], ['l2', '2'], ['l3', '3']] as const) {
      setConvCompact(level);
      expect(bodyAttrs.get('data-octo-conv-compact')).toBe(expected);
    }
  });
});

describe('the one-week filter', () => {
  it('is independent of the compaction level', () => {
    setConvRecentOnly(true);
    // No level chosen, yet the filter still applies.
    expect(bodyAttrs.get('data-octo-conv-recent')).toBe('on');
    expect(bodyAttrs.has('data-octo-conv-compact')).toBe(false);
  });

  it('switches the gate to open while expanded, without losing the filter', () => {
    setConvCompact('l3');
    setConvRecentOnly(true);
    expect(bodyAttrs.get('data-octo-conv-recent')).toBe('on');
  });

  it('re-collapses on every re-enable', () => {
    // An expansion is a one-off "let me look", not a stored preference.
    setConvRecentOnly(true);
    setConvRecentOnly(false);
    setConvRecentOnly(true);
    expect(bodyAttrs.get('data-octo-conv-recent')).toBe('on');
  });

  it('removes the gate when switched off', () => {
    setConvRecentOnly(true);
    setConvRecentOnly(false);
    expect(bodyAttrs.has('data-octo-conv-recent')).toBe(false);
  });

  it('parks the revealed older rows below every sort rung, but above the footer', () => {
    setConvRecentOnly(true);
    const text = css();
    // Without this, expanding 「更早的 N 个会话」 flings four-month-old rows to the
    // TOP of the list: a read old row lands on the sort's 「其它」 rung (0), which
    // outranks every muted row (10). Observed on a real account.
    const reveal = /data-octo-conv-recent='open'\]\[data-octo-conv-sort='true'\][\s\S]*?order:\s*(\d+)/.exec(
      text,
    );
    expect(reveal).not.toBeNull();
    const revealOrder = Number(reveal![1]);
    const footerOrder = Number(/octo-conv-stale-foot\s*\{[\s\S]*?order:\s*(\d+)/.exec(text)![1]);
    expect(revealOrder).toBeGreaterThan(CONV_SORT_ORDER_MUTED);
    expect(footerOrder).toBeGreaterThan(revealOrder);
  });

  it('only orders the reveal while the sort has made the list a flex container', () => {
    setConvRecentOnly(true);
    // `order` is inert without the sort, and with the sort off DOM order already
    // puts the older rows last — so the rule must stay gated on the sort's own
    // attribute rather than fire on its own.
    const revealParts = selectorParts().filter((s) => s.includes("recent='open'"));
    expect(revealParts.length).toBeGreaterThan(0);
    for (const part of revealParts) {
      expect(part).toContain("data-octo-conv-sort='true'");
    }
  });
});

describe('teardown', () => {
  it('is safe when the feature never started', () => {
    expect(() => teardownConvCompact()).not.toThrow();
  });

  it('removes the stylesheet and both body attributes', () => {
    setConvCompact('l4');
    setConvRecentOnly(true);
    teardownConvCompact();
    expect(css()).toBe('');
    expect(bodyAttrs.has('data-octo-conv-compact')).toBe(false);
    expect(bodyAttrs.has('data-octo-conv-recent')).toBe(false);
  });

  it('resets the requested state so a replay after master-off re-applies', () => {
    // teardown runs as PageFeature.stop; the content script then replays every
    // setting on master-on. If the requested state survived, the `=== enabled`
    // guard in setConvRecentOnly would swallow that replay as "no change".
    setConvRecentOnly(true);
    teardownConvCompact();
    setConvRecentOnly(true);
    expect(bodyAttrs.get('data-octo-conv-recent')).toBe('on');
  });
});
