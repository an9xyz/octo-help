/**
 * Read Octo's internal MessageWrap from a DOM element's React fiber tree.
 *
 * Used by the new-message bubble to know who sent what: the rendered row shows
 * the text but not whether it is the user's own message, a system notice, or a
 * duplicate, and those all have to be filtered out before a pet says anything.
 *
 * ## Why React fiber internals?
 *
 * Octo does not expose the MessageWrap in the rendered DOM — it is only
 * available as React props. The alternative would be to re-derive sender,
 * content-type and flags from the DOM, which is lossy (system notices look like
 * normal messages, duplicates are invisible) and would have to be kept in sync
 * with Octo's rendering logic — a copy that naturally drifts.
 *
 * ## The any escape hatch
 *
 * React's fiber type is private — there is no published TS type for it. The
 * interface below captures only the fields this function touches and asserts
 * them via repeated runtime checks, so a change in React's internals fails
 * closed (returns null) rather than crashing the extension.
 */

/** Minimal shape of a React fiber node — only the fields we read. */
interface ReactFiberNode {
  child?: ReactFiberNode;
  sibling?: ReactFiberNode;
  memoizedProps?: Record<string, unknown>;
  /** React 19 stores fiber as `return`; we walk the tree via child/sibling. */
  return?: ReactFiberNode;
}

const MAX_FIBER_DEPTH = 12;
const MAX_FIBER_NODES = 800;

function findFiberKey(element: Element): string | undefined {
  return Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
}

function asFiber(value: unknown): ReactFiberNode | null {
  if (!value || typeof value !== 'object') return null;
  // Must have at least one of the fiber fields we traverse
  const candidate = value as ReactFiberNode;
  if (candidate.child || candidate.sibling || candidate.memoizedProps) return candidate;
  return null;
}

/**
 * Walk the React fiber tree starting from a DOM element until we find a fiber
 * whose memoizedProps contains a `message` property. Returns `null` when no
 * such fiber is found (the page's React version changed, the element is not a
 * message row, or the tree structure differs).
 */
export function getMessageWrapFromItem(item: Element): Record<string, unknown> | null {
  const key = findFiberKey(item);
  if (!key) return null;
  const rootFiber = asFiber((item as unknown as Record<string, unknown>)[key]);
  if (!rootFiber?.child) return null;

  const stack: Array<{ fiber: ReactFiberNode; depth: number }> = [
    { fiber: rootFiber.child, depth: 1 },
  ];
  let visited = 0;

  while (stack.length > 0 && visited < MAX_FIBER_NODES) {
    visited += 1;
    const entry = stack.pop();
    if (!entry || entry.depth > MAX_FIBER_DEPTH) continue;
    const { fiber, depth } = entry;

    const props = fiber.memoizedProps;
    if (
      props &&
      typeof props === 'object' &&
      'message' in props &&
      props.message &&
      typeof props.message === 'object'
    ) {
      return props.message as Record<string, unknown>;
    }

    if (fiber.child) stack.push({ fiber: fiber.child, depth: depth + 1 });
    if (fiber.sibling) stack.push({ fiber: fiber.sibling, depth });
  }

  return null;
}
