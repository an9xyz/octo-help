import { describe, expect, it } from 'vitest';
import { OCTO_SELECTORS } from './octoSelectors';
import {
  groupIdOfChannel,
  isMentionableChannelType,
  parseAvatarChannel,
  readChannelFromList,
  readCurrentChannel,
  readRecentSpeakerUids,
} from './octoChannelContext';

/**
 * Minimal Document stand-in. The functions under test only ever call
 * `querySelector` / `querySelectorAll`, which is the point: the fewer DOM APIs
 * they touch, the fewer ways Octo's markup can break them.
 */
function fakeDoc(map: Record<string, unknown>): Document {
  const pick = (selector: string) => map[selector] ?? null;
  return {
    querySelector: (selector: string) => pick(selector),
    querySelectorAll: (selector: string) => {
      const value = pick(selector);
      if (!value) return [];
      return Array.isArray(value) ? value : [value];
    },
  } as unknown as Document;
}

function imgHost(srcs: string[]) {
  return {
    querySelectorAll: () => srcs.map((src) => ({ getAttribute: () => src })),
  };
}

describe('parseAvatarChannel', () => {
  it('reads group and user ids out of the avatar URL Octo renders', () => {
    // Measured on the live build: conversation rows carry
    // `/api/v1/groups/<id>/avatar?v=…`, which is the only place the *id* (not just
    // the name) of the open conversation survives into plain DOM.
    expect(parseAvatarChannel('/api/v1/groups/bc0145733b2749fe8bd57cac4061ffd5/avatar?v=17860')).toEqual({
      kind: 'group',
      id: 'bc0145733b2749fe8bd57cac4061ffd5',
    });
    expect(parseAvatarChannel('/api/v1/users/27w7mreIOwk655ad47a_bot/avatar?v=1')).toEqual({
      kind: 'user',
      id: '27w7mreIOwk655ad47a_bot',
    });
  });

  it('ignores anything else', () => {
    expect(parseAvatarChannel('/api/v1/organizations/x/logo')).toBeNull();
    expect(parseAvatarChannel('')).toBeNull();
    expect(parseAvatarChannel(null)).toBeNull();
  });
});

describe('groupIdOfChannel', () => {
  it('maps a thread channel back to its parent group', () => {
    // Threads have no roster of their own — Octo resolves their members against
    // the parent group, and the member endpoint only accepts the group id.
    expect(groupIdOfChannel('bc0145733b2749fe8bd57cac4061ffd5____2048765652532989952')).toBe(
      'bc0145733b2749fe8bd57cac4061ffd5',
    );
    expect(groupIdOfChannel('75bcaf3a886f4b989cc4268b93586a17')).toBe('75bcaf3a886f4b989cc4268b93586a17');
    expect(groupIdOfChannel(undefined)).toBe('');
  });
});

describe('isMentionableChannelType', () => {
  it('accepts groups and threads, rejects 1:1', () => {
    expect(isMentionableChannelType(2)).toBe(true);
    expect(isMentionableChannelType(5)).toBe(true);
    expect(isMentionableChannelType(1)).toBe(false);
  });
});

describe('readCurrentChannel', () => {
  it('prefers upstream data attributes when the deployment has them', () => {
    const doc = fakeDoc({
      [OCTO_SELECTORS.conversationMessages]: {
        dataset: { conversationChannelId: 'g____t', conversationChannelType: '5' },
      },
    });
    // A thread's own channel id is kept alongside the group id: the roster comes
    // from the parent group, but anything reading *this conversation's* history
    // must not read the parent's.
    expect(readCurrentChannel(doc)).toEqual({
      groupId: 'g',
      isGroup: true,
      channelId: 'g____t',
      channelType: 5,
    });
  });

  it('falls back to the selected conversation row (today\u2019s deployed build)', () => {
    const doc = fakeDoc({
      [OCTO_SELECTORS.conversationMessages]: { dataset: {} },
      [OCTO_SELECTORS.conversationListSelected]: imgHost(['/api/v1/groups/G1/avatar?v=1']),
    });
    const expected = { groupId: 'G1', isGroup: true, channelId: 'G1', channelType: 2 };
    expect(readCurrentChannel(doc)).toEqual(expected);
    expect(readChannelFromList(doc)).toEqual(expected);
  });

  it('marks a 1:1 chat as not mentionable', () => {
    const doc = fakeDoc({
      [OCTO_SELECTORS.conversationListSelected]: imgHost(['/api/v1/users/U1/avatar?v=1']),
    });
    expect(readCurrentChannel(doc)).toEqual({
      groupId: 'U1',
      isGroup: false,
      channelId: 'U1',
      channelType: 1,
    });
  });

  it('skips avatars it cannot parse instead of stopping at the first image', () => {
    const doc = fakeDoc({
      [OCTO_SELECTORS.conversationListSelected]: imgHost(['data:image/png;base64,AAA', '/api/v1/groups/G2/avatar']),
    });
    expect(readCurrentChannel(doc)).toEqual({
      groupId: 'G2',
      isGroup: true,
      channelId: 'G2',
      channelType: 2,
    });
  });

  it('returns null when nothing is open', () => {
    expect(readCurrentChannel(fakeDoc({}))).toBeNull();
  });
});

describe('readRecentSpeakerUids', () => {
  it('lists speakers oldest-first from row avatars', () => {
    const rows = [
      imgHost(['/api/v1/users/a/avatar']),
      imgHost(['data:image/png;base64,x']), // e.g. a custom logo: no uid to learn
      imgHost(['/api/v1/users/b/avatar', '/api/v1/users/c/avatar']), // first wins
    ];
    const doc = fakeDoc({ [OCTO_SELECTORS.messageRow]: rows });
    expect(readRecentSpeakerUids(doc)).toEqual(['a', 'b']);
  });

  it('only looks at the tail of a long conversation', () => {
    const rows = Array.from({ length: 10 }, (_, i) => imgHost([`/api/v1/users/u${i}/avatar`]));
    expect(readRecentSpeakerUids(fakeDoc({ [OCTO_SELECTORS.messageRow]: rows }), 3)).toEqual(['u7', 'u8', 'u9']);
  });
});
