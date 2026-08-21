import { browser, defineBackground } from '#imports';
import { MESSAGE_SOURCE, MESSAGE_TYPE, OCTO_MATCHES } from '@/utils/octoShared';
import { clipToOcto, githubDigestToOcto } from '@/utils/octoBotActions';
import { metadataFetchTarget } from '@/utils/octoLinkMetadata';

const OCTO_URL_PREFIX = OCTO_MATCHES[0].replace('/*', '');
const MAX_METADATA_HTML_BYTES = 256 * 1024;

async function readMetadataHtml(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html') || !response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let html = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_METADATA_HTML_BYTES) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } catch {
    return null;
  }
}

/**
 * Find an Octo tab in any window, activate it, then send a message to focus the composer.
 * If no Octo tab exists, open one.
 */
async function activateOctoTab(query?: string): Promise<void> {
  const tabs = await browser.tabs.query({ url: OCTO_MATCHES as unknown as string[] });
  let targetTab = tabs[0];

  if (targetTab) {
    // Tab exists — activate it
    await browser.tabs.update(targetTab.id, { active: true });
    await browser.windows.update(targetTab.windowId, { focused: true });
  } else {
    // No Octo tab — open one
    targetTab = await browser.tabs.create({ url: OCTO_URL_PREFIX, active: true });
  }

  // Send focus message to the content script (wait a moment for tab to be ready)
  if (targetTab.id) {
    setTimeout(async () => {
      try {
        await browser.tabs.sendMessage(targetTab.id!, { type: 'octo:focus-input' });
      } catch {
        // Content script might not be loaded yet — that's fine
      }
    }, query ? 500 : 300);
  }
}

export default defineBackground(() => {
  // ─── Bot: right-click clip + periodic GitHub digest ──────────
  function notify(title: string, message: string): void {
    try {
      void browser.notifications?.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/48.png'),
        title,
        message: message.slice(0, 200),
      });
    } catch {
      // notifications permission may be absent in some builds — non-fatal.
    }
  }

  function setupBotMenus(): void {
    if (!browser.contextMenus) return;
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({ id: 'octo-clip-selection', title: '剪存到 Octo 文档', contexts: ['selection'] });
    });
  }
  setupBotMenus();
  browser.runtime.onInstalled.addListener(setupBotMenus);

  browser.contextMenus?.onClicked.addListener(async (info, tab) => {
    const id = String(info.menuItemId);
    try {
      if (id === 'octo-clip-selection') {
        const docTitle = await clipToOcto(
          info.selectionText || '',
          info.pageUrl || tab?.url || '',
          tab?.title || '',
        );
        notify('已剪存到文档', docTitle);
      }
    } catch (err) {
      notify('操作失败', err instanceof Error ? err.message : String(err));
    }
  });

  // Periodic GitHub digest: the side panel sets the interval alarm; we fire it.
  browser.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'octo-gh-digest') return;
    console.log('[octo] gh-digest alarm fired', new Date().toISOString());
    try {
      const text = await githubDigestToOcto();
      console.log('[octo] gh-digest sent ok', text.slice(0, 80));
    } catch (err) {
      console.error('[octo] gh-digest failed', err);
      notify('GitHub 汇总失败', err instanceof Error ? err.message : String(err));
    }
  });

  // ─── Cross-origin fetch for link previews ────────────────────────────
  // Only the content-script relay may request it, and the target policy is
  // shared with that relay so a forged MAIN-world message cannot turn this into
  // a local-network or signed-URL fetch primitive.
  browser.runtime.onMessage.addListener((message) => {
    const msg = message as Record<string, unknown>;
    if (msg?.source === MESSAGE_SOURCE && msg?.type === MESSAGE_TYPE.linkPreviewFetch) {
      const url = typeof msg.url === 'string' ? metadataFetchTarget(msg.url) : null;
      const requestId = msg.requestId as string;
      if (!url || typeof requestId !== 'string' || requestId.length < 4 || requestId.length > 100) {
        return Promise.resolve({ source: MESSAGE_SOURCE, type: MESSAGE_TYPE.linkPreviewFetchResult, requestId, html: null });
      }

      return fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(4000),
      })
        .then(async (response) => {
          if (!response.ok)
            return { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.linkPreviewFetchResult, requestId, html: null };
          const html = await readMetadataHtml(response);
          return { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.linkPreviewFetchResult, requestId, html };
        })
        .catch(() => ({ source: MESSAGE_SOURCE, type: MESSAGE_TYPE.linkPreviewFetchResult, requestId, html: null }));
    }
  });

  // ─── Clicking the extension action opens the side panel ──────────────────
  if (browser.sidePanel?.setPanelBehavior) {
    void browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.warn('Unable to enable side panel action click', error));
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  browser.commands.onCommand.addListener((command) => {
    if (command === 'activate-octo') {
      void activateOctoTab();
      return;
    }
    // Quick mention: Ctrl+Shift+1~5
    const mentionMatch = /^quick-mention-(\d)$/.exec(command);
    if (mentionMatch) {
      const index = parseInt(mentionMatch[1], 10) - 1;
      // Send to the active Octo tab's content script
      browser.tabs.query({ url: OCTO_MATCHES as unknown as string[], active: true }).then((tabs) => {
        const tab = tabs[0];
        if (!tab?.id) return;
        browser.tabs.sendMessage(tab.id, { type: 'octo:quick-mention', index }).catch(() => {
          // Tab not ready yet
        });
      });
    }
  });

  // ─── Omnibox: type "octo" in address bar ────────────────────────────────
  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    if (!text.trim()) {
      suggest([
        {
          content: 'open',
          description: '打开 Octo 工作台',
        },
      ]);
      return;
    }

    suggest([
      {
        content: `search:${text}`,
        description: `🔍 搜索「${text}」`,
        deletable: false,
      },
      {
        content: 'open',
        description: '↗ 打开 Octo 工作台',
        deletable: false,
      },
    ]);
  });

  browser.omnibox.onInputEntered.addListener((text) => {
    if (text.startsWith('search:')) {
      const query = text.slice('search:'.length).trim();
      void activateOctoTab(query);
    } else {
      void activateOctoTab();
    }
  });
});
