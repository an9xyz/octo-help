import { describe, it, expect } from 'vitest';
import { parseRepo, countFromLink, fetchRepoStatus, formatRepoStatus } from './octoGithub';

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
    expect(text).toContain('最近 Issue');
    expect(text).toContain('最近 PR');
    expect(text).toContain('#9');
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
