import { describe, expect, it } from 'vitest';
import { extractGitHubLinks, normalizeGitHubUrl } from './octoGithubLink';

describe('extractGitHubLinks', () => {
  it('cuts a glued suffix after a pull request number', () => {
    expect(
      extractGitHubLinks(
        'https://github.com/Mininglamp-OSS/octo-web/pull/1258merge this pr',
      ),
    ).toEqual([
      {
        url: 'https://github.com/Mininglamp-OSS/octo-web/pull/1258',
        kind: 'pull',
        label: 'PR #1258',
      },
    ]);
  });

  it.each([
    ['https://github.com/org/repo/issues/42fixed', 'issue', 'Issue #42', '/org/repo/issues/42'],
    ['https://github.com/org/repo/discussions/7thanks', 'discussion', 'Discussion #7', '/org/repo/discussions/7'],
    ['https://github.com/org/repo/actions/runs/123done', 'action', 'Action run #123', '/org/repo/actions/runs/123'],
    ['https://github.com/org/repo/commit/abcdef1done', 'commit', 'Commit abcdef1', '/org/repo/commit/abcdef1'],
  ])('recognizes structured URL %s', (raw, kind, label, pathname) => {
    const result = normalizeGitHubUrl(raw);
    expect(result?.kind).toBe(kind);
    expect(result?.label).toBe(label);
    expect(new URL(result!.url).pathname).toBe(pathname);
  });

  it('keeps supported PR subpages, query strings and fragments', () => {
    expect(normalizeGitHubUrl('https://github.com/org/repo/pull/1258/files?foo=1#diff-a')?.url)
      .toBe('https://github.com/org/repo/pull/1258/files?foo=1#diff-a');
  });

  it('does not mistake a glued word for a supported PR subpage', () => {
    expect(normalizeGitHubUrl('https://github.com/org/repo/pull/1258/filesmerged')?.url)
      .toBe('https://github.com/org/repo/pull/1258');
  });

  it('recognizes repository, file, release and compare links', () => {
    expect(normalizeGitHubUrl('github.com/org/repo')?.kind).toBe('repository');
    expect(normalizeGitHubUrl('https://github.com/org/repo/blob/main/a.ts')?.kind).toBe('file');
    expect(normalizeGitHubUrl('https://github.com/org/repo/releases/tag/v1.0.0')?.kind).toBe('release');
    expect(normalizeGitHubUrl('https://github.com/org/repo/compare/main...next')?.kind).toBe('compare');
  });

  it('trims common Chinese and Markdown punctuation', () => {
    expect(extractGitHubLinks('看这里（https://github.com/org/repo/issues/9）。')[0]?.url)
      .toBe('https://github.com/org/repo/issues/9');
  });

  it('finds multiple links once and rejects look-alike hosts', () => {
    const text = [
      'https://github.com/org/repo/pull/1',
      'https://github.com/org/repo/pull/1',
      'https://github.com/org/repo/issues/2',
      'https://github.com.evil.test/org/repo/pull/3',
    ].join(' ');
    expect(extractGitHubLinks(text).map((link) => link.label)).toEqual(['PR #1', 'Issue #2']);
  });
});
