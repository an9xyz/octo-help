import { browser } from '#imports';
import {
  BOT_BASE_URL_STORAGE_KEY,
  BOT_CLIP_DOC_STORAGE_KEY,
  BOT_SHARE_TARGET_STORAGE_KEY,
  BOT_TOKEN_STORAGE_KEY,
  GH_REPO_STORAGE_KEY,
  GH_TARGET_STORAGE_KEY,
  GH_TOKEN_STORAGE_KEY,
  type BotClipDoc,
  type BotShareTarget,
} from './octoShared';
import {
  OCTO_BOT_API_DEFAULT_BASE,
  appendDocBlocks,
  buildClipBlocks,
  getCardEnabled,
  sendBotCard,
  sendBotMessage,
} from './octoBotApi';
import { buildRepoStatusCard, fetchRepoStatus, formatRepoStatus, parseRepo } from './octoGithub';

/**
 * Storage-backed orchestration for the bot features, shared by the background
 * (context menus, alarms) and the side panel. Each function reads the token +
 * base URL and the feature's target from storage.local, then calls the API.
 *
 * A missing token/target throws a user-facing message so callers can surface it
 * (notification / panel error) instead of silently failing.
 */

export class BotNotConfiguredError extends Error {}

export interface ShareMeta {
  url?: string;
  title?: string;
  snippet?: string;
}

function isHttp(u?: string): u is string {
  return !!u && /^https?:\/\//i.test(u);
}

/** A compact share card: title, optional snippet, the link, and an open button. */
function buildShareCard(m: ShareMeta): Record<string, unknown> {
  const body: Array<Record<string, unknown>> = [
    { type: 'TextBlock', text: (m.title || m.url || '').slice(0, 120), weight: 'Bolder', size: 'Medium', wrap: true },
  ];
  if (m.snippet && m.snippet.trim()) {
    body.push({ type: 'TextBlock', text: m.snippet.slice(0, 500), wrap: true, isSubtle: true, spacing: 'Small' });
  }
  if (isHttp(m.url)) {
    body.push({ type: 'TextBlock', text: m.url, size: 'Small', color: 'Accent', wrap: true, spacing: 'Small' });
  }
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body,
    actions: isHttp(m.url) ? [{ type: 'Action.OpenUrl', title: '🔗 打开链接', url: m.url }] : [],
  };
}

async function readConfig(): Promise<{ token: string; baseUrl: string }> {
  const res = await browser.storage.local.get([BOT_TOKEN_STORAGE_KEY, BOT_BASE_URL_STORAGE_KEY]);
  const token = typeof res[BOT_TOKEN_STORAGE_KEY] === 'string' ? res[BOT_TOKEN_STORAGE_KEY] : '';
  const baseUrl =
    (typeof res[BOT_BASE_URL_STORAGE_KEY] === 'string' && res[BOT_BASE_URL_STORAGE_KEY]) ||
    OCTO_BOT_API_DEFAULT_BASE;
  if (!token) throw new BotNotConfiguredError('未配置 Bot Token，请先在扩展的 Bot 面板填写');
  return { token, baseUrl };
}

/** Send text (or a card, when a link is present) to the configured default share
 *  target. Returns the target label. */
export async function shareToOcto(input: string | ShareMeta): Promise<string> {
  const { token, baseUrl } = await readConfig();
  const res = await browser.storage.local.get(BOT_SHARE_TARGET_STORAGE_KEY);
  const target = res[BOT_SHARE_TARGET_STORAGE_KEY] as BotShareTarget | undefined;
  if (!target?.channelId) throw new BotNotConfiguredError('未设置默认分享目标，请先在 Bot 面板选群并「设为默认分享目标」');
  const meta: ShareMeta = typeof input === 'string' ? { snippet: input } : input;
  const text = [meta.title, meta.snippet, meta.url].filter(Boolean).join('\n') || meta.snippet || meta.url || '';
  if (isHttp(meta.url) && (await getCardEnabled(baseUrl, token))) {
    try {
      await sendBotCard(baseUrl, token, target.channelId, target.channelType, buildShareCard(meta), text);
      return target.label;
    } catch {
      // fall through to plain text
    }
  }
  await sendBotMessage(baseUrl, token, target.channelId, target.channelType, text);
  return target.label;
}

/** Append a clip (text + source) to the configured clip doc. Returns the doc title. */
export async function clipToOcto(text: string, url: string, title: string): Promise<string> {
  const { token, baseUrl } = await readConfig();
  const res = await browser.storage.local.get(BOT_CLIP_DOC_STORAGE_KEY);
  const doc = res[BOT_CLIP_DOC_STORAGE_KEY] as BotClipDoc | undefined;
  if (!doc?.docId) throw new BotNotConfiguredError('未设置剪存文档，请先在 Bot 面板「新建剪存文档」');
  await appendDocBlocks(baseUrl, token, doc.docId, buildClipBlocks(text, url, title));
  return doc.title;
}

/**
 * Fetch the configured GitHub repo's status, format a digest, and post it to the
 * default share target. Returns the digest text. Used by the "立即汇总" button and
 * the periodic alarm.
 */
export async function githubDigestToOcto(): Promise<string> {
  const store = await browser.storage.local.get([GH_REPO_STORAGE_KEY, GH_TOKEN_STORAGE_KEY, GH_TARGET_STORAGE_KEY]);
  const ref = parseRepo(typeof store[GH_REPO_STORAGE_KEY] === 'string' ? store[GH_REPO_STORAGE_KEY] : '');
  if (!ref) throw new BotNotConfiguredError('未设置 GitHub 仓库（owner/repo）');
  const ghToken = typeof store[GH_TOKEN_STORAGE_KEY] === 'string' ? store[GH_TOKEN_STORAGE_KEY] : undefined;
  const status = await fetchRepoStatus(ref, { token: ghToken || undefined });
  const text = formatRepoStatus(status);

  // Resolve the target: the digest's own channel, else the default share target.
  const { token, baseUrl } = await readConfig();
  const ghTarget = store[GH_TARGET_STORAGE_KEY] as BotShareTarget | undefined;
  let target = ghTarget?.channelId ? ghTarget : undefined;
  if (!target) {
    const dflt = (await browser.storage.local.get(BOT_SHARE_TARGET_STORAGE_KEY))[BOT_SHARE_TARGET_STORAGE_KEY] as
      | BotShareTarget
      | undefined;
    if (!dflt?.channelId) throw new BotNotConfiguredError('未设置汇总目标，请在 Bot 面板选群并设为汇总目标');
    target = dflt;
  }

  // Prefer an Adaptive Card; fall back to plain text if cards are disabled or rejected.
  if (await getCardEnabled(baseUrl, token)) {
    try {
      await sendBotCard(baseUrl, token, target.channelId, target.channelType, buildRepoStatusCard(status), text);
      return text;
    } catch {
      // fall through to text
    }
  }
  await sendBotMessage(baseUrl, token, target.channelId, target.channelType, text);
  return text;
}
