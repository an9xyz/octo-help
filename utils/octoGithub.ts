/**
 * Minimal GitHub read client for periodic repo status digests. No AI: it fetches
 * counts + recently-updated issues/PRs and formats a plain-text summary.
 *
 * Public repos need NO token: api.github.com returns `access-control-allow-origin: *`
 * so the browser can call it directly, at 60 req/h per IP unauthenticated. A token
 * is optional — required only for private repos, and raises the limit to 5000/h.
 *
 * Open-PR count comes from the `Link` header of a 1-item pulls page (avoids the
 * stricter search API); open issues = repo.open_issues_count - openPRs, because
 * GitHub's open_issues_count includes PRs.
 */

export const GITHUB_API_BASE = 'https://api.github.com';

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoStatus {
  fullName: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  openIssues: number;
  openPrs: number;
  pushedAt: string;
  recent: Array<{ number: number; title: string; isPr: boolean; state: string; updatedAt: string; url: string }>;
}

export class GithubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GithubError';
  }
}

/** Accept "owner/repo" or any github.com URL containing it. */
export function parseRepo(input: string): RepoRef | null {
  const s = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
  const m = /^([\w.-]+)\/([\w.-]+)/.exec(s);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/** Parse the last-page number from a GitHub `Link` header, else fall back to a count. */
export function countFromLink(link: string | null, fallback: number): number {
  if (link) {
    const m = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
    if (m) return parseInt(m[1], 10);
  }
  return fallback;
}

interface GithubOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function ghFetch(path: string, options: GithubOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const res = await fetchImpl(`${GITHUB_API_BASE}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const rateLimited = (res.status === 403 || res.status === 429) && remaining === '0';
      let msg: string;
      if (rateLimited) {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : 0;
        const back = mins ? `，约 ${mins} 分钟后恢复` : '';
        msg = `GitHub 限流（匿名 60 次/小时，多人共享 IP 更快耗尽）${back}；填 token 可提额到 5000/小时`;
      } else {
        msg =
          res.status === 404
            ? '仓库不存在或无权访问（私有仓库需填 token）'
            : res.status === 403
              ? 'GitHub 拒绝访问（可能需要 token）'
              : `GitHub HTTP ${res.status}`;
      }
      throw new GithubError(msg, res.status);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a repo's issue/PR status snapshot. */
export async function fetchRepoStatus(ref: RepoRef, options: GithubOptions = {}): Promise<RepoStatus> {
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const meta = (await (await ghFetch(base, options)).json()) as {
    full_name: string; html_url: string; stargazers_count: number; forks_count: number;
    open_issues_count: number; pushed_at: string;
  };
  const prsRes = await ghFetch(`${base}/pulls?state=open&per_page=1`, options);
  const prsItems = (await prsRes.json()) as unknown[];
  const openPrs = countFromLink(prsRes.headers.get('link'), prsItems.length);
  const recentRaw = (await (
    await ghFetch(`${base}/issues?state=all&sort=updated&direction=desc&per_page=8`, options)
  ).json()) as Array<{
    number: number; title: string; state: string; updated_at: string; html_url: string; pull_request?: unknown;
  }>;
  return {
    fullName: meta.full_name,
    htmlUrl: meta.html_url,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    openIssues: Math.max(0, meta.open_issues_count - openPrs),
    openPrs,
    pushedAt: meta.pushed_at,
    recent: recentRaw.map((r) => ({
      number: r.number,
      title: r.title,
      isPr: !!r.pull_request,
      state: r.state,
      updatedAt: r.updated_at,
      url: r.html_url,
    })),
  };
}

/** Short "3小时前" style relative time. */
function ago(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(0, min)}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

/** Format a plain-text digest for an Octo message or on-screen preview. */
export function formatRepoStatus(s: RepoStatus, now = Date.now()): string {
  const lines = [
    `📊 ${s.fullName} 状态`,
    `★ ${s.stars} · Fork ${s.forks} · 最近推送 ${ago(s.pushedAt, now)}`,
    `开放 Issue：${s.openIssues}  |  开放 PR：${s.openPrs}`,
  ];
  if (s.recent.length) {
    lines.push('最近更新：');
    for (const r of s.recent.slice(0, 6)) {
      lines.push(`• ${r.isPr ? 'PR' : 'Issue'} #${r.number} ${r.title}（${r.state}·${ago(r.updatedAt, now)}）`);
    }
  }
  return lines.join('\n');
}
