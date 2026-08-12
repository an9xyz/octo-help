import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  function MockMO(this: any) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
  }
  globalThis.MutationObserver = MockMO as unknown as typeof MutationObserver;
});

import { setConvFoldEnabled, setConvFoldState, teardownConvFold } from './octoConvFold';

let frames: FrameRequestCallback[];
let elementsById: Map<string, FakeElement>;
let documentListeners: Map<string, EventListener>;
let posted: unknown[];

class FakeNode {}

class FakeElement extends FakeNode {
  attrs = new Map<string, string>();
  children: FakeElement[] = [];
  className = '';
  dataset: Record<string, string> = {};
  id = '';
  isConnected = true;
  parent: FakeElement | null = null;
  style: Record<string, string> = {};
  textContent = '';
  title = '';
  type = '';
  name = '';
  avatarBox: FakeElement | null = null;
  indicatorLeft: number | null = null;
  private listeners = new Map<string, EventListener>();

  constructor(readonly kind: 'plain' | 'row' | 'list' = 'plain') {
    super();
  }

  get classList() {
    return { contains: (name: string) => this.className.split(/\s+/).includes(name) };
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get parentElement() {
    return this.parent;
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    child.isConnected = true;
    this.children.push(child);
    if (child.id) elementsById.set(child.id, child);
    return child;
  }

  insertBefore(child: FakeElement, before: FakeElement | null) {
    child.parent = this;
    child.isConnected = true;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    if (child.id) elementsById.set(child.id, child);
    return child;
  }

  remove() {
    this.isConnected = false;
    for (const child of this.children) child.isConnected = false;
    if (this.id) elementsById.delete(this.id);
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.({
      currentTarget: this,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event);
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  matches() {
    return false;
  }

  closest(selector: string) {
    if (selector === '.wk-conversationlist-item' && this.kind === 'row') return this;
    if (selector.includes('.octo-conv-fold-entry')) {
      if (this.className === 'octo-conv-fold-entry') return this;
      for (let parent = this.parent; parent; parent = parent.parent) {
        if (parent.className === 'octo-conv-fold-entry') return parent;
      }
    }
    return null;
  }

  contains(node: FakeNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  getBoundingClientRect() {
    return { top: 20, right: 300, bottom: 68, left: 0, width: 300, height: 48 };
  }

  querySelector(selector: string): FakeElement | null {
    if (this.kind === 'row' && selector === '.wk-conversationlist-item-name > h3') {
      const heading = new FakeElement();
      heading.textContent = this.name;
      return heading;
    }
    if (this.kind === 'row' && selector === '.wk-conversationlist-item-avatar-box') {
      if (!this.avatarBox) {
        this.avatarBox = new FakeElement();
        const image = new FakeElement();
        image.className = 'wk-avatar';
        this.avatarBox.appendChild(image);
      }
      return this.avatarBox;
    }
    if (this.kind === 'row' && selector === '.wk-conversationlist-item-indicators' && this.indicatorLeft) {
      const indicators = new FakeElement();
      indicators.getBoundingClientRect = () => ({
        top: 20,
        right: this.indicatorLeft! + 20,
        bottom: 40,
        left: this.indicatorLeft!,
        width: 20,
        height: 20,
      });
      return indicators;
    }
    if (this.kind === 'list') {
      if (selector.includes('wk-conversationlist-item')) {
        return this.children.find((child) => child.kind === 'row') ?? null;
      }
      if (selector.includes('octo-conv-fold-entry')) {
        return this.children.find((child) => child.className === 'octo-conv-fold-entry') ?? null;
      }
      if (selector.includes('octo-conv-fold-row-toggle')) {
        return this.children.find((child) => child.className === 'octo-conv-fold-row-toggle') ?? null;
      }
    }
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    if (!className) return null;
    for (const child of this.children) {
      if (child.className === className) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (this.kind === 'list' && selector.includes('wk-conversationlist-item')) {
      return this.children.filter((child) => child.kind === 'row');
    }
    if (selector === '*') {
      return this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
    }
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    if (!className) return [];
    return this.children.flatMap((child) => [
      ...(child.className === className ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

function flushFrames(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(0);
}

describe('conversation fold action', () => {
  let body: FakeElement;
  let head: FakeElement;
  let list: FakeElement;
  let row: FakeElement;

  beforeEach(() => {
    frames = [];
    elementsById = new Map();
    documentListeners = new Map();
    posted = [];
    body = new FakeElement();
    head = new FakeElement();
    list = new FakeElement('list');
    row = new FakeElement('row');
    row.name = '项目会话';
    Object.assign(row, { '__reactFiber$test': { key: 'channel-2' } });
    list.appendChild(row);

    vi.stubGlobal('Node', FakeNode);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => key === 'octo.session.sid' ? 'sid' : null,
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'uidsid' ? 'user' : key === 'currentSpaceId' ? 'space' : null,
    });
    vi.stubGlobal('document', {
      body,
      head,
      documentElement: new FakeElement(),
      createElement: () => new FakeElement(),
      getElementById: (id: string) => elementsById.get(id) ?? null,
      querySelector: (selector: string) => body.querySelector(selector),
      querySelectorAll: (selector: string) => {
        if (selector === '.wk-conversationlist') return [list];
        if (selector.includes('data-octo-conv-fold')) return [row];
        if (selector === '.octo-conv-fold-entry') {
          return list.children.filter((child) => child.className === 'octo-conv-fold-entry');
        }
        return [];
      },
      addEventListener: (type: string, listener: EventListener) => documentListeners.set(type, listener),
      removeEventListener: (type: string) => documentListeners.delete(type),
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      clearTimeout,
      setTimeout,
      postMessage: (message: unknown) => posted.push(message),
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    teardownConvFold();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('mounts the avatar-action toggle with original avatars by default', () => {
    setConvFoldEnabled(true);
    flushFrames();

    const toggle = list.querySelector('.octo-conv-fold-row-toggle');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.querySelector('.octo-conv-fold-row-toggle-label')?.textContent).toBe('章鱼折叠入口');
    expect(toggle?.getAttribute('aria-label')).toContain('点击可折叠或恢复会话');
    expect(row.querySelector('.wk-conversationlist-item-avatar-box')?.getAttribute('data-octo-conv-fold-avatar-action')).toBeNull();
  });

  it('replaces the row avatar with the octopus action when enabled', () => {
    setConvFoldEnabled(true);
    flushFrames();
    list.querySelector('.octo-conv-fold-row-toggle')?.dispatch('click');
    flushFrames();

    const avatar = row.querySelector('.wk-conversationlist-item-avatar-box');
    expect(avatar?.getAttribute('data-octo-conv-fold-avatar-action')).toBe('open');
    expect(avatar?.getAttribute('aria-label')).toBe('点击折叠该会话');
    expect(avatar?.getAttribute('title')).toBe('点击折叠该会话');
  });

  it('folds through the octopus avatar', () => {
    setConvFoldEnabled(true);
    flushFrames();
    list.querySelector('.octo-conv-fold-row-toggle')?.dispatch('click');
    flushFrames();

    const avatar = row.querySelector('.wk-conversationlist-item-avatar-box');
    expect(posted).toEqual([]);
    avatar?.dispatch('click');

    expect(posted).toContainEqual(expect.objectContaining({
      type: 'convFoldChange',
      scope: 'user:space',
      conversationKey: '2:channel',
      folded: true,
    }));
  });

  it('uses restore affordance when the folded row is visible in expanded mode', () => {
    setConvFoldState({ 'user:space': ['2:channel'] });
    setConvFoldEnabled(true);
    flushFrames();
    const entry = list.children.find((child) => child.className === 'octo-conv-fold-entry');
    entry?.dispatch('click');
    list.querySelector('.octo-conv-fold-row-toggle')?.dispatch('click');
    flushFrames();

    const avatar = row.querySelector('.wk-conversationlist-item-avatar-box');
    expect(avatar?.getAttribute('aria-label')).toBe('点击恢复到会话列表');
    expect(avatar?.getAttribute('data-octo-conv-fold-avatar-action')).toBe('folded');
    avatar?.dispatch('click');

    expect(posted).toContainEqual(expect.objectContaining({
      type: 'convFoldChange',
      scope: 'user:space',
      conversationKey: '2:channel',
      folded: false,
    }));
  });

  it('renders a WeChat-style entry and expands the folded native rows', () => {
    setConvFoldState({ 'user:space': ['2:channel'] });
    setConvFoldEnabled(true);
    flushFrames();

    const entry = list.children.find((child) => child.className === 'octo-conv-fold-entry');
    expect(entry?.querySelector('.octo-conv-fold-entry-title')?.textContent).toBe('折叠的会话');
    expect(entry?.querySelector('.octo-conv-fold-entry-summary')?.textContent).toBe('项目会话');
    expect(entry?.querySelector('.octo-conv-fold-entry-count')?.textContent).toBe('1 个');
    expect(row.getAttribute('data-octo-conv-folded')).toBe('true');

    entry?.dispatch('click');
    expect(body.getAttribute('data-octo-conv-fold')).toBe('open');
    expect(entry?.getAttribute('aria-expanded')).toBe('true');
    const css = head.children.find((child) => child.textContent.includes('data-octo-conv-folded'))?.textContent;
    expect(css).toContain('order: -109 !important');
    expect(css).toContain('margin: 3px 7px 0 13px');
    expect(css).toContain('background: rgba(255, 255, 255, .78)');
    expect(css).toContain('data:image/svg+xml');
    expect(css).toContain('f44393');
    expect(css).toContain('[data-octo-conv-fold-avatar-action]');
    expect(css).toContain('visibility: hidden !important');
    expect(css).not.toContain('flex: 0 0 22px');
    expect(css).not.toContain('right: 32px');
    expect(css).not.toContain('display: flex;\n      align-items: center;\n      gap: 8px;');
    const entryIconCss = css?.match(/\.octo-conv-fold-entry-icon \{[^}]+}/)?.[0];
    expect(entryIconCss).not.toContain('border-radius');
  });

});
