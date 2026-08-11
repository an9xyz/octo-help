import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── MutationObserver must exist BEFORE module load ─────────────────────
vi.hoisted(() => {
  function MockMutationObserverCtor(this: any, _cb: () => void) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
  }
  globalThis.MutationObserver = MockMutationObserverCtor as unknown as typeof MutationObserver;
});

// ─── Module mocks ───────────────────────────────────────────────────────

vi.mock('./octoApi', () => ({
  readPageSession: vi.fn(() => ({ uid: 'u-self', sid: 's1', token: 'tk' })),
}));

vi.mock('./octoChannelContext', () => ({
  readCurrentChannel: vi.fn(() => ({
    groupId: 'g1', channelId: 'g1', channelType: 2, isGroup: true,
  })),
  readRecentSpeakerUids: vi.fn(() => ['u1', 'u2', 'u3']),
}));

vi.mock('./octoMembers', () => ({
  cachedGroupMembers: vi.fn(() => []),
  clearMemberCache: vi.fn(),
  fetchGroupMembers: vi.fn(() =>
    Promise.resolve([
      { uid: 'u1', label: '张三', isBot: false },
      { uid: 'u2', label: '李四', isBot: false },
      { uid: 'u3', label: 'AI助手', isBot: true },
    ]),
  ),
  memberAvatarUrl: vi.fn((uid: string) => `/api/v1/users/${uid}/avatar`),
  rankMentionCandidates: vi.fn((members: readonly any[], _opts: any) => members.slice(0, 5)),
}));

vi.mock('./octoMention', () => ({
  canInsertMention: vi.fn(() => true),
  insertMention: vi.fn(() => true),
}));

vi.mock('./octoMentionTargets', () => ({
  bumpMentionTarget: vi.fn(),
  cachedMentionTargets: vi.fn(() => ({})),
  clearMentionTargets: vi.fn(),
  fetchMentionTargets: vi.fn(() => Promise.resolve()),
}));

import { setMentionQuickBar, teardownMentionQuickBar } from './octoMentionBar';

// ─── DOM mock ───────────────────────────────────────────────────────────

let elementsById: Map<string, any>;

function mockEl(tag: string): any {
  const self: any = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    style: {},
    dataset: {},
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
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  let _id = '';
  Object.defineProperty(self, 'id', {
    get: () => _id,
    set: (v: string) => { _id = v; if (v) elementsById.set(v, self); },
    configurable: true,
  });
  return self;
}

let mockDoc: any;
let moSpy: { observe: any; disconnect: any };

beforeEach(() => {
  elementsById = new Map();
  const head = mockEl('head');
  const body = mockEl('body');
  const composerCard = mockEl('div');
  composerCard.className = 'wk-messageinput-card';
  body.children.push(composerCard);

  // Each test gets fresh spy instances for observe/disconnect
  moSpy = { observe: vi.fn(), disconnect: vi.fn() };

  // Replace MutationObserver so the module creates instances with our spys
  function TestMO(this: any, _cb: () => void) {
    this.observe = moSpy.observe;
    this.disconnect = moSpy.disconnect;
  }
  globalThis.MutationObserver = TestMO as unknown as typeof MutationObserver;

  mockDoc = {
    createElement: vi.fn((tag: string) => mockEl(tag)),
    getElementById: vi.fn((id: string) => elementsById.get(id) ?? null),
    querySelector: vi.fn((sel: string) => {
      if (sel === '.wk-messageinput-card') return composerCard;
      return null;
    }),
    querySelectorAll: vi.fn(() => []),
    body,
    head,
    documentElement: mockEl('html'),
  };

  vi.stubGlobal('document', mockDoc);
  vi.stubGlobal('window', {
    setTimeout: vi.fn((_fn: (...args: unknown[]) => unknown) => 42),
    clearTimeout: vi.fn(),
  });
});

afterEach(() => {
  teardownMentionQuickBar();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe('setMentionQuickBar', () => {
  it('creates a MutationObserver instance on enable', () => {
    setMentionQuickBar(true);
    expect(moSpy.observe).toHaveBeenCalled();
  });

  it('calls observe on the document body with childList+subtree', () => {
    setMentionQuickBar(true);
    expect(moSpy.observe).toHaveBeenCalledWith(
      mockDoc.body,
      expect.objectContaining({ childList: true, subtree: true }),
    );
  });

  it('is idempotent — does not create duplicate observers', () => {
    setMentionQuickBar(true);
    const callCount = moSpy.observe.mock.calls.length;

    setMentionQuickBar(true); // same state, no-op

    expect(moSpy.observe.mock.calls.length).toBe(callCount);
  });

  it('removes injected style element on disable', () => {
    setMentionQuickBar(true);
    // Simulate the style that sync() would inject
    const style = mockDoc.createElement('style');
    style.id = 'octo-mention-bar-style';
    mockDoc.head.appendChild(style);
    expect(mockDoc.getElementById('octo-mention-bar-style')).not.toBeNull();

    setMentionQuickBar(false);

    expect(mockDoc.getElementById('octo-mention-bar-style')).toBeNull();
  });
});

describe('teardownMentionQuickBar', () => {
  it('removes injected style element', () => {
    setMentionQuickBar(true);
    const style = mockDoc.createElement('style');
    style.id = 'octo-mention-bar-style';
    mockDoc.head.appendChild(style);

    teardownMentionQuickBar();

    expect(mockDoc.getElementById('octo-mention-bar-style')).toBeNull();
  });

  it('disconnects the MutationObserver', () => {
    setMentionQuickBar(true);

    teardownMentionQuickBar();

    expect(moSpy.disconnect).toHaveBeenCalled();
  });

  it('clears caches', async () => {
    const { clearMemberCache } = await import('./octoMembers');
    const { clearMentionTargets } = await import('./octoMentionTargets');

    setMentionQuickBar(true);
    teardownMentionQuickBar();

    expect(clearMemberCache).toHaveBeenCalled();
    expect(clearMentionTargets).toHaveBeenCalled();
  });

  it('is safe to call multiple times', () => {
    expect(() => {
      teardownMentionQuickBar();
      teardownMentionQuickBar();
      teardownMentionQuickBar();
    }).not.toThrow();
  });
});
