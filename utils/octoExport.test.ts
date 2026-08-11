import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAsMarkdown, formatAsMarkdown, type ExportedMessage } from './octoExport';
import { OCTO_SELECTORS } from './octoSelectors';

// ─── Test: formatAsMarkdown (pure function, no DOM) ───────────────────────

describe('formatAsMarkdown', () => {
  it('returns a placeholder for an empty array', () => {
    expect(formatAsMarkdown([])).toBe('*暂无消息*');
  });

  it('formats a single message', () => {
    const msgs: ExportedMessage[] = [
      { sender: '张三', time: '10:30', text: '你好' },
    ];
    const result = formatAsMarkdown(msgs);
    expect(result).toContain('**张三** *(10:30)*');
    expect(result).toContain('> 你好');
  });

  it('formats multiple messages from the same sender without repeating the header', () => {
    const msgs: ExportedMessage[] = [
      { sender: '张三', time: '10:30', text: '第一条' },
      { sender: '张三', time: '10:31', text: '第二条' },
    ];
    const result = formatAsMarkdown(msgs);
    expect(result.match(/\*\*张三\*\*/g)).toHaveLength(1);
    expect(result).toContain('> 第一条');
    expect(result).toContain('> 第二条');
  });

  it('adds a new header when the sender changes', () => {
    const msgs: ExportedMessage[] = [
      { sender: '张三', time: '10:30', text: '第一条' },
      { sender: '李四', time: '10:31', text: '第二条' },
    ];
    const result = formatAsMarkdown(msgs);
    expect(result).toContain('**张三**');
    expect(result).toContain('**李四**');
  });

  it.each([
    { sender: '我', expected: '我' },
    { sender: 'You', expected: '我' },
    { sender: '', expected: '我' },
  ])('maps sender "$sender" to display name "$expected"', ({ sender, expected }) => {
    const result = formatAsMarkdown([{ sender, time: '', text: 'hi' }]);
    expect(result).toContain(`**${expected}**`);
  });

  // NOTE: whitespace-only strings are truthy in JS ('  ' || fallback === '  '),
  // so the source's `sender || '未知用户'` does NOT fall through for whitespace.
  it('keeps whitespace-only sender as-is (known limitation)', () => {
    const result = formatAsMarkdown([{ sender: '  ', time: '', text: 'hi' }]);
    expect(result).toContain('**  **');
    expect(result).not.toContain('**未知用户**');
  });

  it('indents every line with "> "', () => {
    const msgs: ExportedMessage[] = [
      { sender: 'A', time: '', text: 'line1\nline2\nline3' },
    ];
    const result = formatAsMarkdown(msgs);
    const indented = result.split('\n').filter((l) => l.startsWith('> '));
    expect(indented).toHaveLength(3);
    expect(indented[0]).toBe('> line1');
    expect(indented[1]).toBe('> line2');
    expect(indented[2]).toBe('> line3');
  });

  it('does NOT double-indent lines that already start with ">"', () => {
    const msgs: ExportedMessage[] = [
      { sender: 'A', time: '', text: '> quoted line\nnormal line' },
    ];
    const result = formatAsMarkdown(msgs);
    // Source keeps the original line when it starts with '>', so no doubling
    expect(result).toContain('> quoted line');
    expect(result).not.toContain('> > quoted line');
    expect(result).toContain('> normal line');
  });

  it('omits time segment when the field is empty', () => {
    const result = formatAsMarkdown([{ sender: 'A', time: '', text: 'hi' }]);
    expect(result).toContain('**A**');
    expect(result).not.toContain('(*)');
  });

  it('produces correct output for a mixed multi-party conversation', () => {
    const msgs: ExportedMessage[] = [
      { sender: '我', time: '09:00', text: '早上好' },
      { sender: '助手', time: '09:01', text: '你好！有什么可以帮你的？' },
      { sender: '我', time: '09:05', text: '帮我写一篇文章' },
      { sender: '助手', time: '09:06', text: '当然可以\n请告诉我主题是什么？' },
    ];
    const result = formatAsMarkdown(msgs);
    expect(result).toContain('**我** *(09:00)*');
    expect(result).toContain('**助手** *(09:01)*');
    expect(result).toContain('**我** *(09:05)*');
    expect(result).toContain('> 早上好');
    expect(result).toContain('> 当然可以');
    expect(result).toContain('> 请告诉我主题是什么？');
    expect(result.match(/\*\*我\*\*/g)).toHaveLength(2);
  });
});

// ─── Test: exportAsMarkdown (DOM-dependent) ───────────────────────────────

/**
 * Build a mock document stub that simulates Octo's conversation DOM structure.
 *
 * Each fixture message becomes one `.wk-message-item > .wk-msg-row`. Messages
 * with the same sender are grouped into the same `.wk-message-item` (mirroring
 * Octo's "continue" row pattern).
 */
function stubSelectors(
  messages: Array<{ sender: string; time: string; text: string }>,
  channelName?: string,
): void {
  // ── Build message items as plain objects with a querySelectorAll method ──
  // Each "item" holds an array of "rows". Rows are also plain objects with
  // a querySelector method. All closures capture by value (const) to avoid
  // the classic JavaScript closure-over-loop-variable gotcha.

  const items: Array<{
    querySelectorAll: (sel: string) => ReadonlyArray<{
      querySelector: (sel: string) => { readonly textContent: string; readonly getAttribute: (a: string) => string | null } | null;
    }>;
  }> = [];

  let groupRows: Array<{
    querySelector: (sel: string) => { readonly textContent: string; readonly getAttribute: (a: string) => string | null } | null;
  }> = [];
  let groupSender = '';

  for (const msg of messages) {
    // When sender changes, seal the current group and start a new one
    if (msg.sender !== groupSender && groupRows.length > 0) {
      const sealed = groupRows;
      items.push({ querySelectorAll: () => sealed });
      groupRows = [];
    }
    groupSender = msg.sender;

    const row = {
      querySelector: (sel: string) => {
        if (sel === OCTO_SELECTORS.messageRowSender) {
          return { textContent: msg.sender, getAttribute: () => null };
        }
        if (sel === OCTO_SELECTORS.messageRowTime) {
          return {
            textContent: msg.time,
            getAttribute: (a: string) => (a === 'data-time' ? msg.time : null),
          };
        }
        if (sel === OCTO_SELECTORS.anyMessageBody) {
          return { textContent: msg.text, getAttribute: () => null };
        }
        return null;
      },
    };
    groupRows.push(row);
  }

  // Flush the last group
  if (groupRows.length > 0) {
    const sealed = groupRows;
    items.push({ querySelectorAll: () => sealed });
  }

  // ── Build the conversation container mock ──
  const wkConversationMessages = {
    querySelectorAll: (sel: string) => (sel === OCTO_SELECTORS.messageItem ? items : []),
  };

  // ── Build channel name mock ──
  const wkConversationlistSelected = channelName
    ? {
        querySelector: (sel: string) => {
          return sel === '.wk-conversationlist-item-name, [class*="name"]'
            ? { textContent: channelName }
            : null;
        },
      }
    : null;

  // ── Stub document.querySelector / querySelectorAll ──
  const querySelector = vi.fn((selector: string) => {
    if (
      selector === OCTO_SELECTORS.messageArea ||
      selector === OCTO_SELECTORS.conversationMessages
    ) {
      return wkConversationMessages;
    }
    if (selector === '.wk-conversation-content') {
      return null;
    }
    if (selector === OCTO_SELECTORS.conversationListSelected) {
      return wkConversationlistSelected;
    }
    return null;
  });

  vi.stubGlobal('document', {
    querySelector,
    querySelectorAll: (sel: string) => {
      if (sel === OCTO_SELECTORS.messageItem) return items;
      return [];
    },
  } as unknown as typeof document);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exportAsMarkdown', () => {
  it('throws when no message container is found', async () => {
    vi.stubGlobal('document', {
      querySelector: vi.fn().mockReturnValue(null),
      querySelectorAll: vi.fn().mockReturnValue([]),
    } as unknown as typeof document);

    await expect(exportAsMarkdown()).rejects.toThrow('没有找到会话内容');
  });

  it('exports a simple two-message conversation', async () => {
    stubSelectors([
      { sender: '我', time: '10:00', text: '你好' },
      { sender: '助手', time: '10:01', text: '你好！有什么可以帮你的？' },
    ]);

    const result = await exportAsMarkdown();

    expect(result.messageCount).toBe(2);
    expect(result.summary).toBe('导出了 2 条消息');
    expect(result.fileName).toMatch(/^Octo-/);
    expect(result.content).toContain('**我**');
    expect(result.content).toContain('**助手**');
    expect(result.content).toContain('> 你好');
    expect(result.content).toContain('> 你好！有什么可以帮你的？');
  });

  it('includes the channel name in the file name', async () => {
    stubSelectors([{ sender: 'A', time: '', text: 'hi' }], '产品讨论');

    const result = await exportAsMarkdown();
    expect(result.fileName).toContain('产品讨论');
  });

  it('throws when there are no visible messages', async () => {
    stubSelectors([]);

    await expect(exportAsMarkdown()).rejects.toThrow('没有可导出的消息');
  });

  it('handles messages with an empty time field', async () => {
    stubSelectors([{ sender: 'bot', time: '', text: '纯文本消息' }]);

    const result = await exportAsMarkdown();
    expect(result.messageCount).toBe(1);
    expect(result.content).toContain('**bot**');
    expect(result.content).toContain('> 纯文本消息');
    expect(result.content).not.toContain('(*)');
  });
});
