import { describe, it, expect } from 'vitest';
import { parseRepo, countFromLink, fetchRepoStatus, formatRepoStatus, buildRepoStatusCard } from './octoGithub';

describe('octoGithub', () => {
  it('parses owner/repo and github URLs', () => {
    expect(parseRepo('Mininglamp-OSS/octo-cli')).toEqual({ owner: 'Mininglamp-OSS', repo: 'octo-cli' });
    expect(parseRepo('https://github.com/facebook/react')).toEqual({ owner: 'facebook', repo: 'react' });
    expect(parseRepo('https://github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseRepo('nope')).toBeNull();
  });

  it('reads the last page from a Link header, else falls back', () => {
    const link = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=8>; rel="last"';
    expect(countFromLink(link, 1)).toBe(8);
    expect(countFromLink(null, 0)).toBe(0);
  });

  it('derives open issues, separates recent issues/PRs, and formats a digest', async () => {
    const now = new Date().toISOString();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/pulls?state=open&per_page=1')) {
        return {
          ok: true, status: 200,
          headers: { get: (h: string) => (h === 'link' ? '<x?page=8>; rel="last"' : null) },
          json: async () => [{}],
        } as unknown as Response;
      }
      if (url.includes('/pulls?state=all')) {
        return {
          ok: true, status: 200, headers: { get: () => null },
          json: async () => [
            { number: 9, title: 'merged pr', state: 'closed', merged_at: now, updated_at: now, html_url: 'u' },
            { number: 8, title: 'open pr', state: 'open', merged_at: null, updated_at: now, html_url: 'u' },
          ],
        } as unknown as Response;
      }
      if (url.includes('/issues?')) {
        return {
          ok: true, status: 200, headers: { get: () => null },
          json: async () => [
            { number: 5, title: 'a bug', state: 'open', updated_at: now, html_url: 'u' },
            { number: 8, title: 'a pr (skip)', state: 'open', updated_at: now, html_url: 'u', pull_request: {} },
            { number: 3, title: 'done', state: 'closed', updated_at: now, html_url: 'u' },
          ],
        } as unknown as Response;
      }
      return {
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          full_name: 'o/r', html_url: 'h', stargazers_count: 10, forks_count: 3,
          open_issues_count: 10, pushed_at: now,
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const status = await fetchRepoStatus({ owner: 'o', repo: 'r' }, { fetchImpl });
    expect(status.openPrs).toBe(8);
    expect(status.openIssues).toBe(2); // 10 - 8
    expect(status.recentIssues.map((i) => i.number)).toEqual([5, 3]); // PR filtered out
    expect(status.recentPrs.find((p) => p.number === 9)?.state).toBe('merged');
    const text = formatRepoStatus(status);
    expect(text).toContain('开放 Issue 2');
    expect(text).toContain('开放 PR 8');
    expect(text).toContain('最近开放 Issue');
    expect(text).toContain('最近 PR');
    expect(text).toContain('#9');
  });

  it('flags actionable (good first issue / help wanted) open issues', async () => {
    const now = new Date().toISOString();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/pulls?state=open&per_page=1')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] } as unknown as Response;
      }
      if (url.includes('/pulls?state=all')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] } as unknown as Response;
      }
      if (url.includes('/issues?')) {
        return {
          ok: true, status: 200, headers: { get: () => null },
          json: async () => [
            { number: 1, title: 'easy one', state: 'open', updated_at: now, html_url: 'u', labels: [{ name: 'good first issue' }] },
            { number: 2, title: 'hard', state: 'open', updated_at: now, html_url: 'u', labels: [{ name: 'bug' }] },
            { number: 3, title: 'help', state: 'open', updated_at: now, html_url: 'u', labels: [{ name: 'Help Wanted' }] },
          ],
        } as unknown as Response;
      }
      return {
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ full_name: 'o/r', html_url: 'h', stargazers_count: 1, forks_count: 0, open_issues_count: 3, pushed_at: now }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const status = await fetchRepoStatus({ owner: 'o', repo: 'r' }, { fetchImpl });
    expect(status.actionableIssues.map((i) => i.number)).toEqual([1, 3]);
  });

  it('builds a valid AdaptiveCard 1.5 with stat tiles and an OpenUrl action', () => {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const card = buildRepoStatusCard({
      fullName: 'o/r', htmlUrl: 'https://github.com/o/r', stars: 5, forks: 1,
      openIssues: 2, openPrs: 3, pushedAt: iso,
      recentIssues: [{ number: 1, title: 'i', state: 'open', updatedAt: iso, url: 'https://github.com/o/r/issues/1', labels: ['bug'] }],
      recentPrs: [{ number: 2, title: 'p', state: 'merged', updatedAt: iso, url: 'https://github.com/o/r/pull/2', labels: [] }],
      actionableIssues: [{ number: 3, title: 'easy', state: 'open', updatedAt: iso, url: 'https://github.com/o/r/issues/3', labels: ['good first issue'] }],
    }, now);
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    const actions = card.actions as Array<{ type: string; url: string }>;
    expect(actions[0]).toMatchObject({ type: 'Action.OpenUrl', url: 'https://github.com/o/r' });
    const cols = (card.body as Array<{ type: string; columns?: unknown[] }>).find((b) => b.type === 'ColumnSet');
    expect(cols?.columns).toHaveLength(3); // 3 stat tiles
    // every clickable row carries a valid absolute URL (invalid URLs get the card rejected)
    const urls = JSON.stringify(card).match(/"url":"[^"]+"/g) ?? [];
    expect(urls.every((u) => u.includes('https://'))).toBe(true);
  });

  it('reports rate-limit with reset minutes when remaining is 0', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600; // ~10 min out
    const fetchImpl = (async () => ({
      ok: false,
      status: 403,
      headers: {
        get: (h: string) =>
          h === 'x-ratelimit-remaining' ? '0' : h === 'x-ratelimit-reset' ? String(reset) : null,
      },
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await fetchRepoStatus({ owner: 'o', repo: 'r' }, { fetchImpl }).then(
      () => { throw new Error('should have thrown'); },
      (e) => {
        expect(e.status).toBe(403);
        expect(e.message).toContain('限流');
        expect(e.message).toMatch(/约 \d+ 分钟后恢复/);
      },
    );
  });
});
