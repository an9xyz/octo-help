import {
  BALL_CURSOR_STORAGE_KEY,
  GLOBAL_THEME_STORAGE_KEY,
  KICK_STYLE_STORAGE_KEY,
  MASTER_STORAGE_KEY,
  MESSI_WATERMARK_STORAGE_KEY,
  MESSAGE_SOURCE,
  MESSAGE_TYPE,
  PLAYER_WATERMARK_STORAGE_KEY,
  STORAGE_KEY,
  THEME_STORAGE_KEY,
  type BallCursorMessage,
  type GlobalThemeMessage,
  type KickStyleMessage,
  type MasterMessage,
  type PlayerWatermarkId,
  type PlayerWatermarkMessage,
  type ThemeMessage,
  type ToggleMessage,
} from '@/utils/octoRecall';
import { DEFAULT_GLOBAL_THEME, DEFAULT_KICK_STYLE, DEFAULT_THEME } from '@/utils/octoBeautify';

/**
 * ISOLATED-world content script.
 *
 * Bridges extension storage <-> the MAIN-world script (octo-main-world.ts),
 * which is the only place that can read the page's React fiber memory and
 * drive the beautify/theme engine. The content script cannot see page JS, so
 * all restore + beautify logic lives in the injected script; here we inject it
 * and relay storage-backed settings and extension asset URLs over postMessage.
 */
export default defineContentScript({
  matches: ['https://im.deepminer.com.cn/*'],
  runAt: 'document_idle',
  async main() {
    // Inject the MAIN-world script (runs in the page's JS context).
    await injectScript('/octo-main-world.js', { keepInDom: true });

    function postToggle(enabled: boolean) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.toggle, enabled } satisfies ToggleMessage,
        '*',
      );
    }

    function postMaster(enabled: boolean) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.master, enabled } satisfies MasterMessage,
        '*',
      );
    }

    function postTheme(themeId: string) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.theme, themeId } satisfies ThemeMessage,
        '*',
      );
    }

    function postGlobalTheme(themeId: string) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.globalTheme, themeId } satisfies GlobalThemeMessage,
        '*',
      );
    }

    function postKickStyle(styleId: string) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.kickStyle, styleId } satisfies KickStyleMessage,
        '*',
      );
    }

    function postBallCursor(enabled: boolean) {
      window.postMessage(
        { source: MESSAGE_SOURCE, type: MESSAGE_TYPE.ballCursor, enabled } satisfies BallCursorMessage,
        '*',
      );
    }

    function postPlayerWatermark(playerId: PlayerWatermarkId) {
      const imageUrl =
        playerId === 'none' ? '' : browser.runtime.getURL(`/${playerId}-watermark.png`);
      const playerImageUrl =
        playerId === 'none'
          ? ''
          : browser.runtime.getURL(`/player-animation/${playerId}-player.png`);
      const ballImageUrl =
        playerId === 'none'
          ? ''
          : browser.runtime.getURL(`/player-animation/${playerId}-ball.png`);
      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          type: MESSAGE_TYPE.playerWatermark,
          playerId,
          imageUrl,
          playerImageUrl,
          ballImageUrl,
        } satisfies PlayerWatermarkMessage,
        '*',
      );
    }

    // Push current state once the injected script is listening. It registers
    // its window 'message' listener synchronously on evaluation, but post twice
    // (now + next tick) to avoid a first-frame race.
    const stored = await browser.storage.local.get([
      MASTER_STORAGE_KEY,
      STORAGE_KEY,
      THEME_STORAGE_KEY,
      GLOBAL_THEME_STORAGE_KEY,
      KICK_STYLE_STORAGE_KEY,
      PLAYER_WATERMARK_STORAGE_KEY,
      MESSI_WATERMARK_STORAGE_KEY,
      BALL_CURSOR_STORAGE_KEY,
    ]);
    // Master defaults ON (missing key => enabled) so existing users are
    // unaffected until they explicitly turn everything off.
    let currentMaster = stored[MASTER_STORAGE_KEY] !== false;
    let currentEnabled = stored[STORAGE_KEY] === true;
    let currentTheme =
      typeof stored[THEME_STORAGE_KEY] === 'string'
        ? (stored[THEME_STORAGE_KEY] as string)
        : DEFAULT_THEME;
    let currentGlobalTheme =
      typeof stored[GLOBAL_THEME_STORAGE_KEY] === 'string'
        ? (stored[GLOBAL_THEME_STORAGE_KEY] as string)
        : DEFAULT_GLOBAL_THEME;
    let currentKick =
      typeof stored[KICK_STYLE_STORAGE_KEY] === 'string'
        ? (stored[KICK_STYLE_STORAGE_KEY] as string)
        : DEFAULT_KICK_STYLE;
    const storedPlayer = stored[PLAYER_WATERMARK_STORAGE_KEY];
    let currentPlayerWatermark: PlayerWatermarkId =
      storedPlayer === 'messi' || storedPlayer === 'mbappe' || storedPlayer === 'none'
        ? storedPlayer
        : stored[MESSI_WATERMARK_STORAGE_KEY] === true
          ? 'messi'
          : 'none';
    // Default ON so existing users keep the football cursor.
    let currentBallCursor = stored[BALL_CURSOR_STORAGE_KEY] !== false;

    // Post everything except the master flag. The main-world applies these only
    // while the master switch is on; it ignores them while suspended.
    const pushSettings = () => {
      postKickStyle(currentKick);
      postGlobalTheme(currentGlobalTheme);
      postTheme(currentTheme);
      postPlayerWatermark(currentPlayerWatermark);
      postBallCursor(currentBallCursor);
      postToggle(currentEnabled);
    };

    const pushAll = () => {
      // Master first so the main-world can (re)boot the engine before settings
      // arrive; when off, it tears everything down and drops the rest.
      postMaster(currentMaster);
      pushSettings();
    };
    pushAll();
    setTimeout(pushAll, 0);

    // Relay later changes from the popup.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (MASTER_STORAGE_KEY in changes) {
        currentMaster = changes[MASTER_STORAGE_KEY].newValue !== false;
        postMaster(currentMaster);
        // On re-enable, replay every setting so the freshly re-booted engine
        // gets the current theme / kick / watermark back.
        if (currentMaster) pushSettings();
      }
      if (STORAGE_KEY in changes) {
        currentEnabled = changes[STORAGE_KEY].newValue === true;
        postToggle(currentEnabled);
      }
      if (THEME_STORAGE_KEY in changes) {
        const next = changes[THEME_STORAGE_KEY].newValue;
        currentTheme = typeof next === 'string' ? next : DEFAULT_THEME;
        postTheme(currentTheme);
      }
      if (GLOBAL_THEME_STORAGE_KEY in changes) {
        const next = changes[GLOBAL_THEME_STORAGE_KEY].newValue;
        currentGlobalTheme = typeof next === 'string' ? next : DEFAULT_GLOBAL_THEME;
        postGlobalTheme(currentGlobalTheme);
      }
      if (KICK_STYLE_STORAGE_KEY in changes) {
        const next = changes[KICK_STYLE_STORAGE_KEY].newValue;
        currentKick = typeof next === 'string' ? next : DEFAULT_KICK_STYLE;
        postKickStyle(currentKick);
      }
      if (PLAYER_WATERMARK_STORAGE_KEY in changes) {
        const next = changes[PLAYER_WATERMARK_STORAGE_KEY].newValue;
        currentPlayerWatermark = next === 'messi' || next === 'mbappe' ? next : 'none';
        postPlayerWatermark(currentPlayerWatermark);
      }
      if (BALL_CURSOR_STORAGE_KEY in changes) {
        currentBallCursor = changes[BALL_CURSOR_STORAGE_KEY].newValue !== false;
        postBallCursor(currentBallCursor);
      }
    });
  },
});
