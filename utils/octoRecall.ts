// Shared constants between popup, content script (ISOLATED) and injected script (MAIN world).

/** storage.local key holding the "show recalled messages" on/off state. Default OFF. */
export const STORAGE_KEY = 'octoRecallEnabled';

/** storage.local key holding the selected message theme/skin id. Default cyber-light. */
export const THEME_STORAGE_KEY = 'octoThemeId';

/** storage.local key holding the selected whole-site color theme id. */
export const GLOBAL_THEME_STORAGE_KEY = 'octoGlobalThemeId';

/** storage.local key holding the selected soccer-kick style id (worldcup skin). */
export const KICK_STYLE_STORAGE_KEY = 'octoKickStyle';

/** Legacy boolean key kept so existing Messi selections migrate cleanly. */
export const MESSI_WATERMARK_STORAGE_KEY = 'octoMessiWatermarkEnabled';

/** storage.local key holding the single selected player watermark. */
export const PLAYER_WATERMARK_STORAGE_KEY = 'octoPlayerWatermark';
export type PlayerWatermarkId = 'none' | 'messi' | 'mbappe';

/** window.postMessage envelope source, so we ignore unrelated messages. */
export const MESSAGE_SOURCE = 'octo-recall';

/** Message types sent from content script -> injected main-world script. */
export const MESSAGE_TYPE = {
  toggle: 'toggle',
  theme: 'theme',
  globalTheme: 'globalTheme',
  kickStyle: 'kickStyle',
  playerWatermark: 'playerWatermark',
} as const;

export interface ToggleMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.toggle;
  enabled: boolean;
}

export interface ThemeMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.theme;
  themeId: string;
}

export interface GlobalThemeMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.globalTheme;
  themeId: string;
}

export interface KickStyleMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.kickStyle;
  styleId: string;
}

export interface PlayerWatermarkMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.playerWatermark;
  playerId: PlayerWatermarkId;
  /** Legacy complete player+ball image, retained for compatibility. */
  imageUrl: string;
  /** Player cutout with the stationary ball removed. */
  playerImageUrl: string;
  /** Detached ball used by the full-screen kick canvas. */
  ballImageUrl: string;
}

export type OctoMessage =
  | ToggleMessage
  | ThemeMessage
  | GlobalThemeMessage
  | KickStyleMessage
  | PlayerWatermarkMessage;
