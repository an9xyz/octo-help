/** Stable identity for one rendered Octo conversation row. */
export interface ConversationRowRef {
  channelId: string;
  channelType: number;
  key: string;
}

interface ReactFiberNode {
  key?: unknown;
}

function reactFiberOf(element: Element): ReactFiberNode | null {
  const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  const value = (element as unknown as Record<string, unknown>)[fiberKey];
  return value && typeof value === 'object' ? (value as ReactFiberNode) : null;
}

/**
 * Octo keys each native row as `<channelId>-<channelType>`. Unlike the avatar,
 * this preserves a subchannel's full `group____thread` id rather than collapsing
 * it to the parent group. The parser takes the final dash so opaque IDs may
 * contain dashes themselves.
 */
export function parseConversationFiberKey(value: unknown): ConversationRowRef | null {
  if (typeof value !== 'string') return null;
  const cut = value.lastIndexOf('-');
  if (cut <= 0 || cut === value.length - 1) return null;
  const channelId = value.slice(0, cut);
  const channelType = Number(value.slice(cut + 1));
  if (!channelId || !Number.isInteger(channelType) || channelType <= 0) return null;
  return { channelId, channelType, key: `${channelType}:${channelId}` };
}

/** Fail closed when Octo changes its React key shape. */
export function conversationRefFromRow(row: Element): ConversationRowRef | null {
  return parseConversationFiberKey(reactFiberOf(row)?.key);
}
