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

export interface RepoItem {
  number: number;
  title: string;
  state: string;
  updatedAt: string;
  url: string;
  labels: string[];
  comments?: number;
}

export interface RepoStatus {
  fullName: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  openIssues: number;
  openPrs: number;
  pushedAt: string;
  recentIssues: RepoItem[];
  recentPrs: RepoItem[];
  /** Open issues labelled good-first-issue / help-wanted — “which issues can be worked on”. */
  actionableIssues: RepoItem[];
}

/** Labels that mark an issue as open for contribution. */
const ACTIONABLE_LABELS = [
  'good first issue', 'good-first-issue', 'help wanted', 'help-wanted',
  'up-for-grabs', 'up for grabs', 'e-easy', 'easy',
];
function isActionable(labels: string[]): boolean {
  return labels.some((l) => ACTIONABLE_LABELS.includes(l.toLowerCase().trim()));
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

/** Fetch a repo's issue/PR status: counts, recent PRs, recent OPEN issues, and
 *  the open issues that are labelled for contribution (“which can be worked on”). */
export async function fetchRepoStatus(ref: RepoRef, options: GithubOptions = {}): Promise<RepoStatus> {
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const meta = (await (await ghFetch(base, options)).json()) as {
    full_name: string; html_url: string; stargazers_count: number; forks_count: number;
    open_issues_count: number; pushed_at: string;
  };
  // Open-PR count from the pulls Link header (avoids the stricter search API).
  const prCountRes = await ghFetch(`${base}/pulls?state=open&per_page=1`, options);
  const prCountItems = (await prCountRes.json()) as unknown[];
  const openPrs = countFromLink(prCountRes.headers.get('link'), prCountItems.length);

  // Recent 10 PRs (any state; merged shows as 'merged').
  const prsRaw = (await (
    await ghFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=10`, options)
  ).json()) as Array<{ number: number; title: string; state: string; merged_at: string | null; updated_at: string; html_url: string; labels?: Array<{ name: string }> }>;

  // Open issues (the issues endpoint includes PRs, so drop them). Used for both
  // the recent-open list and the actionable (labelled) subset.
  const issuesRaw = (await (
    await ghFetch(`${base}/issues?state=open&sort=updated&direction=desc&per_page=40`, options)
  ).json()) as Array<{
    number: number; title: string; state: string; updated_at: string; html_url: string;
    pull_request?: unknown; comments?: number; labels?: Array<{ name: string }>;
  }>;
  const openIssueItems: RepoItem[] = issuesRaw
    .filter((r) => !r.pull_request)
    .map((r) => ({
      number: r.number,
      title: r.title,
      state: r.state,
      updatedAt: r.updated_at,
      url: r.html_url,
      comments: r.comments,
      labels: (r.labels ?? []).map((l) => l.name),
    }));

  return {
    fullName: meta.full_name,
    htmlUrl: meta.html_url,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    openIssues: Math.max(0, meta.open_issues_count - openPrs),
    openPrs,
    pushedAt: meta.pushed_at,
    recentPrs: prsRaw.map((r) => ({
      number: r.number,
      title: r.title,
      state: r.merged_at ? 'merged' : r.state,
      updatedAt: r.updated_at,
      url: r.html_url,
      labels: (r.labels ?? []).map((l) => l.name),
    })),
    recentIssues: openIssueItems.slice(0, 10),
    actionableIssues: openIssueItems.filter((it) => isActionable(it.labels)).slice(0, 8),
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

/** Short state marker for readability in a plain-text digest. */
function mark(state: string): string {
  if (state === 'open') return '🟢';
  if (state === 'merged') return '🟣';
  return '⚪'; // closed
}

function clip(t: string, n = 44): string {
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function titleLine(item: RepoItem, now: number): string {
  return `${mark(item.state)} #${item.number} ${clip(item.title)}（${ago(item.updatedAt, now)}）`;
}

/** Format a plain-text digest (also the card's fallback text). */
export function formatRepoStatus(s: RepoStatus, now = Date.now()): string {
  const lines = [
    `📊 ${s.fullName}`,
    `★ ${s.stars} · Fork ${s.forks} · 推送 ${ago(s.pushedAt, now)}`,
    `🟢 开放 Issue ${s.openIssues} · 🔀 开放 PR ${s.openPrs} · 🙋 可认领 ${s.actionableIssues.length}`,
  ];
  if (s.actionableIssues.length) {
    lines.push('', '🙋 可以改的 Issue');
    for (const it of s.actionableIssues) {
      const tags = it.labels.length ? ` [${it.labels.slice(0, 3).join(', ')}]` : '';
      lines.push(`• #${it.number} ${clip(it.title)}${tags}`);
    }
  }
  if (s.recentIssues.length) {
    lines.push('', `📋 最近开放 Issue（${s.recentIssues.length}）`);
    for (const it of s.recentIssues) lines.push(titleLine(it, now));
  }
  if (s.recentPrs.length) {
    lines.push('', `🔀 最近 PR（${s.recentPrs.length}）`);
    for (const it of s.recentPrs) lines.push(titleLine(it, now));
  }
  return lines.join('\n');
}

// ─── Adaptive Card (octo/v1 display) ───────────────────────────────────
// Elements verified enabled: TextBlock, FactSet, Container, ColumnSet,
// ActionSet/Action.OpenUrl. Container.selectAction(OpenUrl) makes a whole row
// open its issue/PR on click. Kept under limits (200 nodes / depth 16 / 512KB).

type ACNode = Record<string, unknown>;

/** A stat tile: big number over a small label; neutral bg, only the number tinted. */
function statTile(value: number, label: string, numColor: string): ACNode {
  return {
    type: 'Column',
    width: 'stretch',
    items: [
      {
        type: 'Container',
        style: 'emphasis',
        spacing: 'None',
        items: [
          { type: 'TextBlock', text: String(value), size: 'Large', weight: 'Bolder', color: numColor, horizontalAlignment: 'Center', spacing: 'None' },
          { type: 'TextBlock', text: label, size: 'Small', isSubtle: true, horizontalAlignment: 'Center', spacing: 'None', wrap: true },
        ],
      },
    ],
  };
}

/** One clickable list row (node-light: 1 container + 2 text blocks, no columns/
 *  runs, so 20+ rows stay under the ~200-node card limit). A leading state dot,
 *  a bold number, the title, and a trailing ↗ signal the whole row is tappable. */
function itemRow(it: RepoItem, now: number, showLabels: boolean): ACNode {
  const dot = it.state === 'open' ? '🟢' : it.state === 'merged' ? '🟣' : '⚪';
  const meta: string[] = [];
  if (showLabels && it.labels.length) meta.push(it.labels.slice(0, 3).join(' · '));
  meta.push(ago(it.updatedAt, now));
  if (typeof it.comments === 'number' && it.comments > 0) meta.push(`💬 ${it.comments}`);
  return {
    type: 'Container',
    spacing: 'Small',
    separator: true,
    selectAction: { type: 'Action.OpenUrl', title: `#${it.number}`, url: it.url },
    items: [
      { type: 'TextBlock', wrap: true, spacing: 'None', text: `${dot} #${it.number}  ${clip(it.title, 52)}  ↗` },
      { type: 'TextBlock', text: meta.join('  ·  '), size: 'Small', isSubtle: true, spacing: 'None', wrap: true },
    ],
  };
}

function sectionHeader(text: string): ACNode {
  return { type: 'TextBlock', text, weight: 'Bolder', size: 'Medium', spacing: 'Medium', wrap: true };
}

/** Build a polished Adaptive Cards 1.5 display card for the digest. */
export function buildRepoStatusCard(s: RepoStatus, now = Date.now()): Record<string, unknown> {
  const body: ACNode[] = [
    {
      type: 'TextBlock',
      text: `📊 ${s.fullName}`,
      weight: 'Bolder',
      size: 'Large',
      wrap: true,
      spacing: 'None',
    },
    {
      type: 'TextBlock',
      text: `★ ${s.stars} · Fork ${s.forks} · 推送 ${ago(s.pushedAt, now)}`,
      isSubtle: true,
      size: 'Small',
      spacing: 'None',
      wrap: true,
    },
    {
      type: 'ColumnSet',
      spacing: 'Medium',
      columns: [
        statTile(s.openIssues, '开放 Issue', 'Default'),
        statTile(s.openPrs, '开放 PR', 'Accent'),
        statTile(s.actionableIssues.length, '可认领', 'Good'),
      ],
    },
    { type: 'TextBlock', text: '👆 点任意条目直接打开对应 Issue / PR', size: 'Small', isSubtle: true, spacing: 'Small', wrap: true },
  ];

  if (s.actionableIssues.length) {
    body.push(sectionHeader('🙋 可以改的 Issue'));
    body.push({
      type: 'Container',
      style: 'emphasis',
      spacing: 'Small',
      items: s.actionableIssues.map((it) => itemRow(it, now, true)),
    });
  }

  if (s.recentIssues.length) {
    body.push(sectionHeader(`📋 最近开放 Issue（${s.recentIssues.length}）`));
    for (const it of s.recentIssues) body.push(itemRow(it, now, true));
  }

  if (s.recentPrs.length) {
    body.push(sectionHeader(`🔀 最近 PR（${s.recentPrs.length}）`));
    for (const it of s.recentPrs) body.push(itemRow(it, now, false));
  }

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body,
    actions: [{ type: 'Action.OpenUrl', title: '🔗 打开仓库', url: s.htmlUrl }],
  };
}
