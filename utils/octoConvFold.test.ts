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
  indicatorLeft: number | null = null;
  private listeners = new Map<string, EventListener>();

  constructor(readonly kind: 'plain' | 'row' | 'list' = 'plain') {
    super();
  }

  get classList() {
    return { contains: (name: string) => this.className.split(/\s+/).includes(name) };
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    child.isConnected = true;
    this.children.push(child);
    if (child.id) elementsById.set(child.id, child);
    return child;
  }

  remove() {
    this.isConnected = false;
    if (this.id) elementsById.delete(this.id);
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.({
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
    if (selector === '.octo-conv-fold-action' && this.className === 'octo-conv-fold-action') return this;
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
    return [];
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
      querySelectorAll: (selector: string) => {
        if (selector === '.wk-conversationlist') return [list];
        if (selector.includes('data-octo-conv-fold')) return [row];
        if (selector === '.octo-conv-fold-action') {
          return body.children.filter((child) => child.className === 'octo-conv-fold-action');
        }
        if (selector === '.octo-conv-fold-entry') {
          return list.children.filter((child) => child.className === 'octo-conv-fold-entry');
        }
        return [];
      },
      addEventListener: (type: string, listener: EventListener) => documentListeners.set(type, listener),
      removeEventListener: (type: string) => documentListeners.delete(type),
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

  it('mounts one shared action outside React-owned rows', () => {
    setConvFoldEnabled(true);
    flushFrames();

    expect(row.children).toEqual([]);
    expect(body.children.filter((child) => child.className === 'octo-conv-fold-action')).toHaveLength(1);
  });

  it('folds the hovered row through the shared action', () => {
    setConvFoldEnabled(true);
    flushFrames();
    documentListeners.get('pointerover')?.({ target: row } as unknown as Event);

    const button = body.children.find((child) => child.className === 'octo-conv-fold-action');
    expect(button?.getAttribute('data-visible')).toBe('true');
    expect(button?.textContent).toBe('折叠');
    button?.dispatch('click');

    expect(posted).toContainEqual(expect.objectContaining({
      type: 'convFoldChange',
      scope: 'user:space',
      conversationKey: '2:channel',
      folded: true,
    }));
  });

  it('positions the clear text action before the unread badge', () => {
    row.indicatorLeft = 250;
    setConvFoldEnabled(true);
    flushFrames();
    documentListeners.get('pointerover')?.({ target: row } as unknown as Event);

    const button = body.children.find((child) => child.className === 'octo-conv-fold-action');
    expect(button?.style.left).toBe('194px');
    expect(button?.textContent).toBe('折叠');
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
  });

});
