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

  it('derives open issues = open_issues_count - openPrs and formats a digest', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/pulls?state=open&per_page=1')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (h: string) => (h === 'link' ? '<x?page=8>; rel="last"' : null) },
          json: async () => [{}],
        } as unknown as Response;
      }
      if (url.includes('/issues?')) {
        return {
          ok: true, status: 200, headers: { get: () => null },
          json: async () => [
            { number: 5, title: 'a bug', state: 'open', updated_at: new Date().toISOString(), html_url: 'u', pull_request: undefined },
            { number: 6, title: 'a pr', state: 'open', updated_at: new Date().toISOString(), html_url: 'u', pull_request: {} },
          ],
        } as unknown as Response;
      }
      return {
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          full_name: 'o/r', html_url: 'h', stargazers_count: 10, forks_count: 3,
          open_issues_count: 10, pushed_at: new Date().toISOString(),
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const status = await fetchRepoStatus({ owner: 'o', repo: 'r' }, { fetchImpl });
    expect(status.openPrs).toBe(8);
    expect(status.openIssues).toBe(2); // 10 - 8
    const text = formatRepoStatus(status);
    expect(text).toContain('o/r');
    expect(text).toContain('开放 Issue：2');
    expect(text).toContain('开放 PR：8');
    expect(text).toContain('PR #6');
  });
});
