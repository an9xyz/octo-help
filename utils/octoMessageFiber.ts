const MAX_FIBER_DEPTH = 12;
const MAX_FIBER_NODES = 800;

function findFiberKey(element: Element): string | undefined {
  return Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
}

/**
 * Read the MessageWrap attached to an Octo message row without mutating React.
 *
 * Used by the new-message bubble to know who sent what: the rendered row shows the
 * text but not whether it is the user's own message, a system notice, or a duplicate,
 * and those all have to be filtered out before a pet says anything.
 */
export function getMessageWrapFromItem(item: Element): any | null {
  const key = findFiberKey(item);
  if (!key) return null;
  const rootFiber = (item as Element & Record<string, unknown>)[key] as
    | { child?: unknown }
    | undefined;
  if (!rootFiber) return null;

  const stack: Array<{ fiber: any; depth: number }> = [
    { fiber: rootFiber.child, depth: 1 },
  ];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_FIBER_NODES) {
    visited += 1;
    const node = stack.pop();
    if (!node?.fiber || node.depth > MAX_FIBER_DEPTH) continue;
    const { fiber, depth } = node;
    const props = fiber.memoizedProps;
    if (
      props &&
      typeof props === 'object' &&
      'message' in props &&
      props.message &&
      typeof props.message === 'object'
    ) {
      return props.message;
    }
    if (fiber.child) stack.push({ fiber: fiber.child, depth: depth + 1 });
    if (fiber.sibling) stack.push({ fiber: fiber.sibling, depth });
  }
  return null;
}
