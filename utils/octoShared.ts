// Shared constants between the side panel, the content script (ISOLATED) and the
// injected script (MAIN world).

/**
 * The Octo deployment this extension attaches to.
 *
 * Single source of truth: `wxt.config.ts` uses it for `host_permissions` /
 * `web_accessible_resources` and `octo.content.ts` uses it for the content
 * script's `matches`. Changing the deployment domain should only ever require
 * editing this one line.
 */
export const OCTO_MATCHES = ['https://im.deepminer.com.cn/*'] as const;

/** storage.local key holding the global master switch. Off => behaves like the
 *  extension is uninstalled (beautify + themes + kick + pets all torn down).
 *  Default ON (missing key => enabled). */
export const MASTER_STORAGE_KEY = 'octoMasterEnabled';

/**
 * storage.local key for the beautify + theme engine's own on/off switch.
 *
 * Separate from the master switch: the panel gives every feature its own toggle,
 * and message beautifying is a feature like any other. Missing means ON, so
 * existing users see no change.
 */
export const BEAUTIFY_STORAGE_KEY = 'octoBeautifyEnabled';

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

/** storage.local key holding the "replace cursor with a football" on/off state. Default ON. */
export const BALL_CURSOR_STORAGE_KEY = 'octoBallCursorEnabled';

/**
 * storage.local key for the QQ 2014 skin's "keep my own messages on the left"
 * option. Default OFF (own messages sit on the right, like real QQ). Turning it
 * on keeps octo-web's native all-left layout while still using the QQ bubbles.
 */
export const QQ_SELF_LEFT_STORAGE_KEY = 'octoQQSelfLeft';

/** storage.local keys for the single imported desktop pet and its state. */
export const DESKTOP_PET_STORAGE_KEY = 'octoDesktopPet';
export const DESKTOP_PET_ENABLED_STORAGE_KEY = 'octoDesktopPetEnabled';
export const DESKTOP_PET_POSITION_STORAGE_KEY = 'octoDesktopPetPosition';
export const DESKTOP_PET_PLACEMENT_STORAGE_KEY = 'octoDesktopPetPlacement';
export type DesktopPetPlacement = 'desktop' | 'composer';
export const BUILT_IN_COMPANION_STORAGE_KEY = 'octoBuiltInCompanion';
export type BuiltInCompanionId = 'ant' | 'snail' | 'wizard' | 'zombie';

/** Comfortable three-line composer layout. Missing means enabled. */
export const COMPOSER_ENHANCEMENT_STORAGE_KEY = 'octoComposerEnhancementEnabled';

/**
 * storage.local key for sorting the sidebar conversation list by attention
 * instead of by time.
 *
 * Default OFF, unlike most features here. This one visibly reorders the list the
 * user navigates by muscle memory, so it must never switch itself on during an
 * upgrade — it has to be a choice.
 */
export const CONV_SORT_STORAGE_KEY = 'octoConvSortEnabled';

/**
 * storage.local key for the conversation-list compaction level.
 *
 * Cumulative rather than independent switches, because the levels build on each
 * other: L2's title-row prefix only makes sense once L1 has removed the
 * subchannel glyph, L3 drops the preview line that L2 just re-laid out, and L4's
 * group headers replace L2's prefix. Modelling it as one ordered choice makes the
 * invalid combinations unrepresentable.
 *
 *   l1  减装饰      delete redundant decoration
 *   l2  收面包屑    breadcrumb becomes a title prefix, parent-notice rows merged
 *   l3  单行        drop the preview and the timestamp — one line per row
 *   l4  连续折叠    consecutive same-parent rows collapse under a header
 *
 * Ordered so that only the LAST rung conflicts with the attention sort. L3 is the
 * rung that actually answers "stop streaming message content at me", so it must
 * stay usable alongside the sort; only L4 needs DOM order.
 *
 * Default 'off' — it restructures rows the user reads by muscle memory.
 */
export const CONV_COMPACT_STORAGE_KEY = 'octoConvCompactLevel';
export type ConvCompactLevel = 'off' | 'l1' | 'l2' | 'l3' | 'l4';

/**
 * storage.local key for "only show conversations from the last week".
 *
 * Orthogonal to the compaction level: one is about how much each row shows, this
 * is about which rows exist at all. Default OFF — hiding rows without being asked
 * is the one change a user is guaranteed to notice and mistrust.
 */
export const CONV_RECENT_ONLY_STORAGE_KEY = 'octoConvRecentOnly';

/** Enable manual conversation folding in the Octo sidebar. Default OFF. */
export const CONV_FOLD_ENABLED_STORAGE_KEY = 'octoConvFoldEnabled';

/**
 * Folded conversation keys, isolated by the page account + Space scope.
 *
 * A conversation key is `${channelType}:${channelId}`. The outer key is built
 * in the MAIN world from the current page session, because the extension side
 * panel cannot read Octo's page storage safely.
 */
export const CONV_FOLDED_STORAGE_KEY = 'octoConvFoldedByScope';
export type StoredConvFoldMap = Record<string, string[]>;

/**
 * storage.local key holding the last Octo DOM compatibility report.
 *
 * Octo is a moving target: when a redesign renames the classes we hook into, the
 * affected feature silently stops working. The MAIN world checks the
 * load-bearing selectors after boot and stores the verdict here so the Side
 * Panel can say which capability broke instead of leaving the user guessing.
 */
export const COMPAT_REPORT_STORAGE_KEY = 'octoCompatReport';

/** Default true: link previews are on. */
export const LINK_PREVIEW_STORAGE_KEY = 'octoLinkPreviewEnabled';

/** storage.local key for triggering a message export from the MAIN world. */
export const EXPORT_REQUEST_KEY = 'octoExportRequest';
/** storage.local key where the export result is stored for the side panel. */
export const EXPORT_RESULT_KEY = 'octoExportResult';

/** storage.local keys for the Bot API test panel: user-supplied bot token and
 *  gateway base URL. The token is an account-level bearer credential persisted
 *  in extension storage by explicit user action (see docs/spec-clip-to-doc.md §10). */
export const BOT_TOKEN_STORAGE_KEY = 'octoBotToken';
export const BOT_BASE_URL_STORAGE_KEY = 'octoBotBaseUrl';

/** Default channel for 「发送到 Octo」 right-click share: {channelId, channelType, label}. */
export const BOT_SHARE_TARGET_STORAGE_KEY = 'octoBotShareTarget';
/** Target doc for 「剪存到 Octo 文档」: {docId, title}. */
export const BOT_CLIP_DOC_STORAGE_KEY = 'octoBotClipDoc';
/** Saved quick-send message templates: string[]. */
export const BOT_TEMPLATES_STORAGE_KEY = 'octoBotTemplates';
/** Pending scheduled sends: {id, at, channelId, channelType, label, text}[]. */
export const BOT_SCHEDULED_STORAGE_KEY = 'octoBotScheduled';

export interface BotShareTarget {
  channelId: string;
  channelType: number;
  label: string;
}
export interface BotClipDoc {
  docId: string;
  title: string;
}
export interface BotScheduledSend {
  id: string;
  at: number;
  channelId: string;
  channelType: number;
  label: string;
  text: string;
}

export type ExportFormat = 'markdown';

export interface DesktopPetAnimationManifest {
  row: number;
  /** A frame count starting at column 0, or an explicit list of column indexes. */
  frames: number | number[];
  fps?: number;
  frameDurationMs?: number;
  /** Optional per-frame timings for Codex-compatible and other variable-speed loops. */
  frameDurationsMs?: number[];
  loop?: boolean;
}

export interface DesktopPetStateAnimations {
  idle?: string;
  hover?: string;
  drag?: string;
  dragLeft?: string;
  dragRight?: string;
}

export interface DesktopPetManifest {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  /** Codex v1/v2 atlas contract. Omitted Codex v1 packages are detected by dimensions. */
  spriteVersionNumber?: 1 | 2;
  columns?: number;
  rows?: number;
  frameDurationMs?: number;
  animations?: Record<string, DesktopPetAnimationManifest>;
  stateAnimations?: DesktopPetStateAnimations;
}

export interface StoredDesktopPet {
  manifest: DesktopPetManifest;
  spritesheetDataUrl: string;
  importedAt: number;
}

export interface DesktopPetPosition {
  x: number;
  y: number;
}

/** window.postMessage envelope source, so we ignore unrelated messages. */
export const MESSAGE_SOURCE = 'octo-enhancer';

/** postMessage types shared by the content script and the injected MAIN-world script. */
export const MESSAGE_TYPE = {
  master: 'master',
  beautify: 'beautify',
  theme: 'theme',
  globalTheme: 'globalTheme',
  kickStyle: 'kickStyle',
  playerWatermark: 'playerWatermark',
  ballCursor: 'ballCursor',
  qqSelfLeft: 'qqSelfLeft',
  composerEnhancement: 'composerEnhancement',
  convSort: 'convSort',
  convCompact: 'convCompact',
  convRecentOnly: 'convRecentOnly',
  convFoldEnabled: 'convFoldEnabled',
  convFoldState: 'convFoldState',
  convFoldChange: 'convFoldChange',
  desktopPet: 'desktopPet',
  desktopPetPosition: 'desktopPetPosition',
  requestKickScript: 'requestKickScript',
  compatReport: 'compatReport',
  exportRequest: 'exportRequest',
  exportResult: 'exportResult',
  linkPreview: 'linkPreview',
} as const;

export interface MasterMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.master;
  enabled: boolean;
}


/** Beautify + theme engine on/off, independent of the master switch. */
export interface BeautifyMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.beautify;
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
  /** Player cutout with the stationary ball removed. */
  playerImageUrl: string;
  /** Detached ball used by the full-screen kick canvas. */
  ballImageUrl: string;
}

export interface BallCursorMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.ballCursor;
  enabled: boolean;
}

/** QQ 2014 skin: keep own messages left-aligned instead of flipping them right. */
export interface QQSelfLeftMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.qqSelfLeft;
  enabled: boolean;
}

/** Complete storage-backed pet state sent from the isolated content script. */
export interface DesktopPetMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.desktopPet;
  enabled: boolean;
  pet: StoredDesktopPet | null;
  position: DesktopPetPosition | null;
  placement: DesktopPetPlacement;
  builtInCompanion: BuiltInCompanionId | null;
}

export interface ComposerEnhancementMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.composerEnhancement;
  enabled: boolean;
}

/** Sort the sidebar conversation list by attention rather than recency. */
export interface ConvSortMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convSort;
  enabled: boolean;
}

/** Conversation-list compaction level (see CONV_COMPACT_STORAGE_KEY). */
export interface ConvCompactMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convCompact;
  level: ConvCompactLevel;
}

/** Hide conversations older than a week (see CONV_RECENT_ONLY_STORAGE_KEY). */
export interface ConvRecentOnlyMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convRecentOnly;
  enabled: boolean;
}

/** Toggle the manual conversation-folding controls and rendering. */
export interface ConvFoldEnabledMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convFoldEnabled;
  enabled: boolean;
}

/** Complete storage-backed fold map sent from the content script. */
export interface ConvFoldStateMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convFoldState;
  foldedByScope: StoredConvFoldMap;
}

/** MAIN world -> content script: add or remove one folded conversation key. */
export interface ConvFoldChangeMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.convFoldChange;
  scope: string;
  conversationKey: string;
  folded: boolean;
}

/** Drag result sent from the MAIN world back to the content script for storage. */
export interface DesktopPetPositionMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.desktopPetPosition;
  position: DesktopPetPosition;
}

/**
 * MAIN world -> content script: pull in the pixi.js kick effect on demand.
 *
 * The effect lives in its own unlisted entrypoint (`octo-kick-world.js`) so the
 * ~700 KB WebGL engine is never part of the always-injected main-world bundle.
 * Only the content script can call `injectScript`, hence the round trip.
 */
export interface RequestKickScriptMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.requestKickScript;
}

/** Page global the on-demand kick script registers itself under. */
export const KICK_GLOBAL_KEY = '__octoFullscreenKick';

/** Event the kick script dispatches on `window` once its API is registered. */
export const KICK_READY_EVENT = 'octo:kick-ready';

/** Shape registered on `window[KICK_GLOBAL_KEY]` by the kick script. */
export interface KickScriptApi {
  setFullscreenKickStyle(styleId: string): void;
  setFullscreenKickBallCursor(enabled: boolean): void;
  setFullscreenKickPlayer(playerId: PlayerWatermarkId, ballImageUrl: string): void;
}

/** Persisted form of a compatibility report (see COMPAT_REPORT_STORAGE_KEY). */
export interface StoredCompatReport {
  /** Features whose selector no longer matches anything in Octo's DOM. */
  brokenFeatures: string[];
  /** Selector keys behind those features, for logs and bug reports. */
  brokenKeys: string[];
  /** Epoch ms of the check, so the panel can ignore stale reports. */
  checkedAt: number;
}

/** MAIN world -> content script: persist the latest compatibility verdict. */
export interface CompatReportMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.compatReport;
  report: StoredCompatReport;
}

// ─── Export request/result ───────────────────────────────────────────────

/** Side panel -> MAIN world: request to export the current conversation. */
export interface ExportRequestMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.exportRequest;
  format: ExportFormat;
  /** Unique id per request so the panel can match responses. */
  requestId: string;
}

/** MAIN world -> side panel: export result. */
export interface ExportResultMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.exportResult;
  format: ExportFormat;
  requestId: string;
  /** The exported content (markdown text, or later a data URL for images). */
  content: string;
  /** Suggested file name (without extension). */
  fileName: string;
  /** Number of messages exported. */
  messageCount: number;
  /** Human-readable summary, e.g. "导出了 23 条消息" */
  summary: string;
}

// ─── Link preview ────────────────────────────────────────────────────────

export interface LinkPreviewMessage {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE.linkPreview;
  enabled: boolean;
}

/**
 * Direction split of the postMessage protocol.
 *
 * `PageInboundMessage` is what the content script posts INTO the page to drive
 * features. The MAIN world must handle every one of them: its handler table is
 * typed as a required Record over this union (minus the special-cased `master`),
 * so adding an inbound type without a handler fails to compile.
 *
 * `PageOutboundMessage` is what the MAIN world posts back to the content script
 * (compat reports, fold-change requests, pet positions, lazy kick-script
 * injection, export results). The content script's incoming listener is typed
 * over this union.
 */
export type PageInboundMessage =
  | MasterMessage
  | BeautifyMessage
  | ThemeMessage
  | GlobalThemeMessage
  | KickStyleMessage
  | PlayerWatermarkMessage
  | BallCursorMessage
  | QQSelfLeftMessage
  | ComposerEnhancementMessage
  | ConvSortMessage
  | ConvCompactMessage
  | ConvRecentOnlyMessage
  | ConvFoldEnabledMessage
  | ConvFoldStateMessage
  | DesktopPetMessage
  | LinkPreviewMessage
  | ExportRequestMessage;

export type PageOutboundMessage =
  | DesktopPetPositionMessage
  | RequestKickScriptMessage
  | CompatReportMessage
  | ConvFoldChangeMessage
  | ExportResultMessage;

export type OctoMessage = PageInboundMessage | PageOutboundMessage;
