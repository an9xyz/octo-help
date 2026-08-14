import type { StoredCompatReport } from '@/utils/octoShared';

export function normalizeStoredId(
  value: unknown,
  options: ReadonlyArray<{ id: string }>,
  fallback: string,
): string {
  return typeof value === 'string' && options.some((option) => option.id === value)
    ? value
    : fallback;
}

export function readCompatReport(value: unknown): StoredCompatReport | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredCompatReport>;
  if (!Array.isArray(candidate.brokenFeatures) || typeof candidate.checkedAt !== 'number') {
    return null;
  }
  const brokenFeatures = candidate.brokenFeatures
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(0, 12);
  return {
    brokenFeatures,
    brokenKeys: Array.isArray(candidate.brokenKeys)
      ? candidate.brokenKeys.filter((k): k is string => typeof k === 'string').slice(0, 12)
      : [],
    checkedAt: candidate.checkedAt,
  };
}

export function countFoldedConversations(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (total, keys) => total + (Array.isArray(keys) ? keys.filter((key) => typeof key === 'string').length : 0),
    0,
  );
}
