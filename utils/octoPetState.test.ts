import { describe, expect, it } from 'vitest';
import { isBuiltInCompanionId } from './octoPetState';
import { getCompanionPassDurationMs } from './octoBuiltInCompanion';

describe('isBuiltInCompanionId', () => {
  it.each(['ant', 'snail', 'wizard', 'zombie'])('accepts built-in companion %s', (id) => {
    expect(isBuiltInCompanionId(id)).toBe(true);
  });

  it.each([undefined, null, '', 'cat', 4])('rejects unsupported value %s', (value) => {
    expect(isBuiltInCompanionId(value)).toBe(false);
  });
});

describe('getCompanionPassDurationMs', () => {
  it('keeps the snail awake for its complete slow crossing', () => {
    expect(getCompanionPassDurationMs('snail')).toBe(22_000);
  });

  it('uses each companion animation duration', () => {
    expect(getCompanionPassDurationMs('ant')).toBe(13_000);
    expect(getCompanionPassDurationMs('wizard')).toBe(15_000);
    expect(getCompanionPassDurationMs('zombie')).toBe(18_000);
  });
});
