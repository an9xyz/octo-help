import { browser } from '#imports';
import {
  BOT_BASE_URL_STORAGE_KEY,
  BOT_CLIP_DOC_STORAGE_KEY,
  BOT_SHARE_TARGET_STORAGE_KEY,
  BOT_TOKEN_STORAGE_KEY,
  GH_REPO_STORAGE_KEY,
  GH_TOKEN_STORAGE_KEY,
  type BotClipDoc,
  type BotShareTarget,
} from './octoShared';
import {
  OCTO_BOT_API_DEFAULT_BASE,
  appendDocBlocks,
  buildClipBlocks,
  sendBotMessage,
} from './octoBotApi';
import { fetchRepoStatus, formatRepoStatus, parseRepo } from './octoGithub';

/**
 * Storage-backed orchestration for the bot features, shared by the background
 * (context menus, alarms) and the side panel. Each function reads the token +
 * base URL and the feature's target from storage.local, then calls the API.
 *
 * A missing token/target throws a user-facing message so callers can surface it
 * (notification / panel error) instead of silently failing.
 */

export class BotNotConfiguredError extends Error {}

async function readConfig(): Promise<{ token: string; baseUrl: string }> {
  const res = await browser.storage.local.get([BOT_TOKEN_STORAGE_KEY, BOT_BASE_URL_STORAGE_KEY]);
  const token = typeof res[BOT_TOKEN_STORAGE_KEY] === 'string' ? res[BOT_TOKEN_STORAGE_KEY] : '';
  const baseUrl =
    (typeof res[BOT_BASE_URL_STORAGE_KEY] === 'string' && res[BOT_BASE_URL_STORAGE_KEY]) ||
    OCTO_BOT_API_DEFAULT_BASE;
  if (!token) throw new BotNotConfiguredError('未配置 Bot Token，请先在扩展的 Bot 面板填写');
  return { token, baseUrl };
}

/** Send text to the configured default share target. Returns the target label. */
export async function shareToOcto(text: string): Promise<string> {
  const { token, baseUrl } = await readConfig();
  const res = await browser.storage.local.get(BOT_SHARE_TARGET_STORAGE_KEY);
  const target = res[BOT_SHARE_TARGET_STORAGE_KEY] as BotShareTarget | undefined;
  if (!target?.channelId) throw new BotNotConfiguredError('未设置默认分享目标，请先在 Bot 面板选群并「设为默认分享目标」');
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

/** Send a message to an explicit channel (used by the scheduled-send alarm). */
export async function sendScheduledText(
  channelId: string,
  channelType: number,
  text: string,
): Promise<void> {
  const { token, baseUrl } = await readConfig();
  await sendBotMessage(baseUrl, token, channelId, channelType, text);
}

/**
 * Fetch the configured GitHub repo's status, format a digest, and post it to the
 * default share target. Returns the digest text. Used by the "立即汇总" button and
 * the periodic alarm.
 */
export async function githubDigestToOcto(): Promise<string> {
  const store = await browser.storage.local.get([GH_REPO_STORAGE_KEY, GH_TOKEN_STORAGE_KEY]);
  const ref = parseRepo(typeof store[GH_REPO_STORAGE_KEY] === 'string' ? store[GH_REPO_STORAGE_KEY] : '');
  if (!ref) throw new BotNotConfiguredError('未设置 GitHub 仓库（owner/repo）');
  const ghToken = typeof store[GH_TOKEN_STORAGE_KEY] === 'string' ? store[GH_TOKEN_STORAGE_KEY] : undefined;
  const text = formatRepoStatus(await fetchRepoStatus(ref, { token: ghToken || undefined }));
  await shareToOcto(text);
  return text;
}
