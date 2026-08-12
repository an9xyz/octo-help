import { describe, expect, it } from 'vitest';
import { conversationRefFromRow, parseConversationFiberKey } from './octoConvRowKey';

describe('conversation row identity', () => {
  it('keeps a subchannel id intact and takes the final dash as the type separator', () => {
    expect(parseConversationFiberKey('group____thread-with-dash-5')).toEqual({
      channelId: 'group____thread-with-dash',
      channelType: 5,
      key: '5:group____thread-with-dash',
    });
  });

  it('rejects malformed keys', () => {
    expect(parseConversationFiberKey('')).toBeNull();
    expect(parseConversationFiberKey('channel-x')).toBeNull();
    expect(parseConversationFiberKey('-2')).toBeNull();
    expect(parseConversationFiberKey(null)).toBeNull();
  });

  it('reads the React fiber attached to the native row', () => {
    const row = { __reactFiber$test: { key: 'person-1' } } as unknown as Element;
    expect(conversationRefFromRow(row)?.key).toBe('1:person');
  });
});
