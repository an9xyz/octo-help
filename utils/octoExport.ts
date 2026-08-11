/**
 * MAIN-world conversation export logic.
 *
 * Runs in the page's JS context and reads message data from the DOM.
 * The side panel requests an export via postMessage; this module reads the
 * rendered message DOM, formats it, and sends the result back.
 *
 * Only handles Markdown export for now. Screenshot/image export to follow.
 */

import { OCTO_SELECTORS } from './octoSelectors';

export interface ExportedMessage {
  sender: string;
  time: string;
  text: string;
}

/** Sender names that indicate a message from the current user. */
const SELF_LABELS = new Set(['我', 'You', '']);

/**
 * Find the visible message container. Returns null if Octo's conversation
 * panel isn't mounted yet.
 */
function findMessageContainer(): HTMLElement | null {
  return document.querySelector(OCTO_SELECTORS.messageArea);
}

/**
 * Read all visible message rows from the DOM.
 *
 * Each `.wk-message-item` contains one or more `.wk-msg-row` elements
 * (a "continue" row shares the same sender block). We extract sender name,
 * timestamp, and text content from each row.
 */
function readMessages(): ExportedMessage[] {
  const items = document.querySelectorAll(OCTO_SELECTORS.messageItem);
  const messages: ExportedMessage[] = [];

  for (const item of items) {
    const rows = item.querySelectorAll(OCTO_SELECTORS.messageRow);
    for (const row of rows) {
      const senderEl = row.querySelector(OCTO_SELECTORS.messageRowSender);
      const sender = senderEl?.textContent?.trim() ?? '';

      // Timestamp: try data attribute first, then fall back to visible time
      const timeEl = row.querySelector(OCTO_SELECTORS.messageRowTime);
      const time =
        timeEl?.getAttribute('data-time') ??
        timeEl?.textContent?.trim() ??
        '';

      // Message body text (handle both markdown and plain)
      const bodyEl = row.querySelector(OCTO_SELECTORS.anyMessageBody);
      const text = bodyEl?.textContent?.trim() ?? '';

      if (text) {
        messages.push({ sender, time, text });
      }
    }
  }

  return messages;
}

/**
 * Format messages as Markdown.
 *
 * Exported for unit testing. The function is pure: given the same messages it
 * always produces the same string, so most export bugs can be caught without
 * building DOM fixtures.
 */
export function formatAsMarkdown(messages: ExportedMessage[]): string {
  if (messages.length === 0) return '*暂无消息*';

  const lines: string[] = [];
  let lastSender = '';

  for (const msg of messages) {
    const isSelf = SELF_LABELS.has(msg.sender);
    const displayName = isSelf ? '我' : msg.sender || '未知用户';

    // Only repeat the sender line when it changes
    if (displayName !== lastSender) {
      lines.push('');
      lines.push(`**${displayName}**${msg.time ? ` *(${msg.time})*` : ''}`);
      lines.push('');
      lastSender = displayName;
    }

    // Indent quoted lines
    const formattedText = msg.text
      .split('\n')
      .map((line) => (line.trim().startsWith('>') ? line : `> ${line}`))
      .join('\n');
    lines.push(formattedText);
    lines.push('');
  }

  return lines.join('\n').trim();
}

export interface ExportResult {
  content: string;
  fileName: string;
  messageCount: number;
  summary: string;
}

/**
 * Generate a file name from the current time and channel info.
 */
function generateFileName(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  // Try to include channel/group name
  const selectedRow = document.querySelector(OCTO_SELECTORS.conversationListSelected);
  let channelName = '';
  if (selectedRow) {
    const nameEl = selectedRow.querySelector(OCTO_SELECTORS.conversationListName);
    channelName = nameEl?.textContent?.trim() ?? '';
  }

  const parts = ['Octo', channelName, dateStr, timeStr].filter(Boolean);
  return parts.join('-');
}

/**
 * Export the current conversation as Markdown.
 */
export async function exportAsMarkdown(): Promise<ExportResult> {
  const container = findMessageContainer();
  if (!container) {
    throw new Error('没有找到会话内容，请先打开一个会话');
  }

  // Wait a moment for lazy-rendered messages to appear
  await new Promise((resolve) => setTimeout(resolve, 200));

  const messages = readMessages();
  if (messages.length === 0) {
    throw new Error('当前会话没有可导出的消息');
  }

  const content = formatAsMarkdown(messages);
  const fileName = generateFileName();
  const messageCount = messages.length;

  return {
    content,
    fileName,
    messageCount,
    summary: `导出了 ${messageCount} 条消息`,
  };
}
