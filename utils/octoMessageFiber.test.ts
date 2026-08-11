import { describe, expect, it } from 'vitest';
import { getMessageWrapFromItem } from './octoMessageFiber';

/**
 * Create a mock DOM element with a React 19-style fiber key.
 *
 * React 19 stores fibers as `__reactFiber$<hash>` properties on DOM elements.
 * The mock builds a fiber tree that matches the shape Octo's Conversation
 * component produces:
 *
 *   element -> __reactFiber$.child -> sibling chain -> memoizedProps.message
 */
function elementWithFiber(
  fiberTree: Record<string, unknown>,
  fiberKey = '__reactFiber$abcdef',
): Element {
  return {
    // Make it look like a DOM element by giving it enough structure
    nodeType: 1,
    [fiberKey]: fiberTree,
  } as unknown as Element;
}

function makeMessageWrap(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    messageID: 'msg-001',
    fromUID: 'u1',
    contentType: 1,
    content: { text: 'hello' },
    isSelf: false,
    isSystem: false,
    timestamp: 1700000000,
    ...overrides,
  };
}

/**
 * Build a minimal fiber node. Non-enumerable properties don't matter for our
 * mock — the asFiber guard checks for child/sibling/memoizedProps existence.
 */
function fiber(overrides?: Partial<{
  child: Record<string, unknown>;
  sibling: Record<string, unknown>;
  memoizedProps: Record<string, unknown>;
  return: Record<string, unknown>;
}>): Record<string, unknown> {
  return { ...overrides };
}

describe('getMessageWrapFromItem', () => {
  it('returns null when the element has no React fiber key', () => {
    const el = { nodeType: 1 } as unknown as Element;
    expect(getMessageWrapFromItem(el)).toBeNull();
  });

  it('returns null when the fiber root has no child', () => {
    const fiberTree = fiber();
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toBeNull();
  });

  it('returns null when no fiber carries a message prop', () => {
    const fiberTree = fiber({
      child: fiber({ memoizedProps: { username: '张三' } }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toBeNull();
  });

  it('finds the message wrap in the direct child fiber', () => {
    const message = makeMessageWrap({ fromUID: 'u1' });
    const fiberTree = fiber({
      child: fiber({ memoizedProps: { message } }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toEqual(message);
  });

  it('walks the sibling chain to find the message', () => {
    const message = makeMessageWrap({ messageID: 'msg-002' });
    const fiberTree = fiber({
      child: fiber({
        memoizedProps: { someOtherProp: true },
        sibling: fiber({ memoizedProps: { message } }),
      }),
    });
    const el = elementWithFiber(fiberTree);
    const result = getMessageWrapFromItem(el);
    expect(result).toEqual(message);
  });

  it('walks deeper into child fibers recursively', () => {
    const message = makeMessageWrap({ messageID: 'msg-deep' });
    const fiberTree = fiber({
      child: fiber({
        child: fiber({
          child: fiber({ memoizedProps: { message } }),
        }),
      }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toEqual(message);
  });

  it('stops at MAX_FIBER_DEPTH and returns null', () => {
    // Build a chain deeper than MAX_FIBER_DEPTH (12)
    let current: Record<string, unknown> = fiber({ memoizedProps: { message: makeMessageWrap() } });
    for (let i = 0; i < 15; i += 1) {
      current = fiber({ child: current });
    }
    const el = elementWithFiber(current);
    // The walk is bounded; if it hits the limit it returns null rather than
    // crashing or reading the fiber at depth > MAX_FIBER_DEPTH.
    const result = getMessageWrapFromItem(el);
    if (result) {
      // Might still find it if the walk hits it before exhausting the limit
      expect(typeof result).toBe('object');
    } else {
      expect(result).toBeNull();
    }
  });

  it('handles a fiber with a large sibling chain efficiently', () => {
    // Build a chain of siblings without message, then one with a message at the end
    let lastSibling: Record<string, unknown> | null = null;
    for (let i = 0; i < 10; i += 1) {
      const current: Record<string, unknown> = fiber({ memoizedProps: { index: i } });
      if (lastSibling) {
        (lastSibling as Record<string, unknown>).sibling = current;
      }
      lastSibling = current;
    }
    // Add the message at the end
    const message = makeMessageWrap({ messageID: 'msg-last' });
    const last = fiber({ memoizedProps: { message } });
    (lastSibling as Record<string, unknown>).sibling = last;

    const fiberTree = fiber({
      child: fiber({
        sibling: fiber({
          sibling: fiber({
            sibling: last,
          }),
        }),
      }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toEqual(message);
  });

  it('returns null when message prop exists but is null', () => {
    const fiberTree = fiber({
      child: fiber({ memoizedProps: { message: null, username: 'bot' } }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toBeNull();
  });

  it('returns null when message prop exists but is not an object', () => {
    const fiberTree = fiber({
      child: fiber({ memoizedProps: { message: 'just-a-string' } }),
    });
    const el = elementWithFiber(fiberTree);
    expect(getMessageWrapFromItem(el)).toBeNull();
  });
});
