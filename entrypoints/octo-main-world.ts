import { defineUnlistedScript } from '#imports';
import {
  MESSAGE_SOURCE,
  MESSAGE_TYPE,
  type CompatReportMessage,
  type OctoMessage,
} from '@/utils/octoShared';
import { DEFAULT_THEME } from '@/utils/octoThemeCatalog';
import {
  initBeautify,
  setBallCursor,
  setGlobalTheme,
  setKickStyle,
  setPlayerWatermark,
  setQQSelfLeft,
  setTheme,
  teardownBeautify,
} from '@/utils/octoBeautify';
import {
  setComposerEnhancement,
  teardownComposerEnhancement,
} from '@/utils/octoComposerEnhancer';
import { setConvSort, teardownConvSort } from '@/utils/octoConvSort';
import {
  setConvCompact,
  setConvRecentOnly,
  setConvSortActive,
  teardownConvCompact,
} from '@/utils/octoConvCompact';
import { applyDesktopPetState, teardownDesktopPet } from '@/utils/octoPetRenderer';
import { startOctoPetSpeech } from '@/utils/octoPetSpeech';
import { startOctoGithubLinks } from '@/utils/octoGithubLink';
import { handleQuickMention } from '@/utils/octoMentionBar';
import {
  startFeatures,
  stopAllFeatures,
  type PageFeature,
} from '@/utils/octoPageFeatures';
import {
  checkOctoCompat,
  documentCompatProbe,
  type OctoCompatReport,
} from '@/utils/octoSelectors';

/**
 * MAIN-world script — the parts of the extension that need the page's own JS
 * context rather than an isolated one:
 *
 *  - Beautify + theme (skin), ported from an9xyz/octo-script (utils/octoBeautify.ts).
 *  - Quick-@ member strip, which needs the composer's Tiptap editor instance.
 *  - Input-box pet, new-message bubbles, GitHub shortcuts.
 *  - Octo DOM compatibility self-check.
 *
 * Driven by the side panel via postMessage. We only READ page state — no prototype
 * patching, no React state mutation — and every node we add is removable, so the
 * master switch can put the page back exactly as Octo rendered it.
 */
export default defineUnlistedScript(() => {
  // Stay dormant until the content script sends the persisted master state.
  // This avoids briefly applying defaults for users who disabled all features.
  let stopPetSpeech: (() => void) | undefined;
  let stopGithubLinks: (() => void) | undefined;

  // ---- master switch (global "uninstall") --------------------------------

  // Start suspended; the content script always pushes the persisted master value
  // first, so a user who disabled everything never sees a flash of defaults.
  let masterEnabled = false;
  // Beautify has its own switch in the panel, remembered even while suspended so
  // a master re-enable does not resurrect an engine the user turned off.
  let beautifyEnabled = true;
  let lastThemeId = DEFAULT_THEME;

  // ---- Octo DOM compatibility self-check ---------------------------------

  let compatTimers: number[] = [];
  let lastReportedCompat = '';

  /**
   * Check the load-bearing selectors and report anything that no longer matches.
   *
   * Retried on a short schedule rather than checked once: Octo mounts its shell
   * and the conversation asynchronously, so an immediate check would be
   * inconclusive. An inconclusive result is never reported — only a definite
   * "the shell is here but this selector is gone" is worth telling the user.
   */
  function scheduleCompatCheck(): void {
    clearCompatTimers();
    for (const delay of [1_500, 5_000, 15_000]) {
      compatTimers.push(
        window.setTimeout(() => {
          if (!masterEnabled) return;
          let report: OctoCompatReport;
          try {
            report = checkOctoCompat(documentCompatProbe());
          } catch {
            return;
          }
          if (!report.conclusive) return;

          // Only post on change, so a healthy page does not write storage on
          // every retry.
          const fingerprint = report.brokenKeys.join(',');
          if (fingerprint === lastReportedCompat) return;
          lastReportedCompat = fingerprint;

          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: MESSAGE_TYPE.compatReport,
              report: {
                brokenFeatures: report.brokenFeatures,
                brokenKeys: report.brokenKeys,
                checkedAt: Date.now(),
              },
            } satisfies CompatReportMessage,
            '*',
          );
        }, delay),
      );
    }
  }

  function clearCompatTimers(): void {
    for (const id of compatTimers) window.clearTimeout(id);
    compatTimers = [];
  }

  /**
   * Page-side features the master switch controls.
   *
   * ORDER IS TEARDOWN ORDER and matches what `applyMaster` used to do inline,
   * line for line. Adding a feature here is the only place it needs to be
   * registered; `stop` being mandatory is what makes "master off looks like the
   * extension is uninstalled" structurally true instead of a convention.
   */
  const PAGE_FEATURES: PageFeature[] = [
    {
      id: 'beautify',
      // Gated on its own toggle, unlike the rest: the master switch only restarts
      // the engine if the user had it on.
      start: () => {
        if (beautifyEnabled) initBeautify(lastThemeId);
      },
      stop: teardownBeautify,
    },
    {
      // Started by its setting message, not by the master switch.
      id: 'composerEnhancement',
      stop: teardownComposerEnhancement,
    },
    {
      // Started by its setting message, not by the master switch.
      id: 'conversationSort',
      stop: teardownConvSort,
    },
    {
      // Started by its setting message, not by the master switch.
      id: 'conversationCompact',
      stop: teardownConvCompact,
    },
    {
      // Started by its setting message, not by the master switch.
      id: 'desktopPet',
      stop: teardownDesktopPet,
    },
    {
      id: 'petSpeech',
      start: () => {
        stopPetSpeech ??= startOctoPetSpeech();
      },
      stop: () => {
        stopPetSpeech?.();
        stopPetSpeech = undefined;
      },
    },
    {
      id: 'githubLinks',
      start: () => {
        stopGithubLinks ??= startOctoGithubLinks();
      },
      stop: () => {
        stopGithubLinks?.();
        stopGithubLinks = undefined;
      },
    },
    {
      id: 'compatCheck',
      start: scheduleCompatCheck,
      stop: () => {
        clearCompatTimers();
        lastReportedCompat = '';
      },
    },
  ];

  /** Settings that only make sense with the beautify engine running. */
  const BEAUTIFY_DRIVEN_TYPES = new Set<string>([
    MESSAGE_TYPE.theme,
    MESSAGE_TYPE.globalTheme,
    MESSAGE_TYPE.kickStyle,
    MESSAGE_TYPE.playerWatermark,
    MESSAGE_TYPE.ballCursor,
    MESSAGE_TYPE.qqSelfLeft,
  ]);

  /**
   * Startup order. NOT the reverse of teardown order: the beautify engine goes first
   * because the other features' markup is styled by it, and the compat check goes
   * last so it probes a fully mounted extension.
   */
  const FEATURE_START_ORDER = [
    'beautify',
    'composerEnhancement',
    'conversationSort',
    'conversationCompact',
    'petSpeech',
    'githubLinks',
    'compatCheck',
  ] as const;

  /**
   * Turn the whole extension on/off. Off is meant to look exactly like the extension
   * is uninstalled: every engine is torn down and every node we added is removed. On
   * re-enable we re-boot the beautify engine (the content script re-pushes
   * theme/kick/watermark right after).
   */
  function applyMaster(next: boolean): void {
    if (next === masterEnabled) return;
    masterEnabled = next;
    if (next) startFeatures(PAGE_FEATURES, FEATURE_START_ORDER);
    else stopAllFeatures(PAGE_FEATURES);
  }

  // ---- messaging from the content script ----------------------------------

  /**
   * Setting message -> page effect.
   *
   * A table rather than an if-else chain so adding a setting is one entry in one
   * place. The control flow around it (master handled first, theme remembered
   * even while suspended, everything else dropped while suspended) stays
   * explicit below, because it is sequencing rather than dispatch.
   */
  /** Beautify on/off. Off tears the engine down; on re-boots it with the last theme. */
  function applyBeautify(next: boolean): void {
    if (next === beautifyEnabled) return;
    beautifyEnabled = next;
    if (!masterEnabled) return;
    if (next) initBeautify(lastThemeId);
    else teardownBeautify();
  }

  const SETTING_HANDLERS: {
    [K in Exclude<OctoMessage['type'], typeof MESSAGE_TYPE.master>]?: (
      message: Extract<OctoMessage, { type: K }>,
    ) => void;
  } = {
    [MESSAGE_TYPE.beautify]: (m) => applyBeautify(!!m.enabled),
    [MESSAGE_TYPE.theme]: (m) => setTheme(m.themeId),
    [MESSAGE_TYPE.globalTheme]: (m) => setGlobalTheme(m.themeId),
    [MESSAGE_TYPE.kickStyle]: (m) => setKickStyle(m.styleId),
    [MESSAGE_TYPE.playerWatermark]: (m) =>
      setPlayerWatermark(m.playerId, m.playerImageUrl, m.ballImageUrl),
    [MESSAGE_TYPE.ballCursor]: (m) => setBallCursor(!!m.enabled),
    [MESSAGE_TYPE.qqSelfLeft]: (m) => setQQSelfLeft(!!m.enabled),
    [MESSAGE_TYPE.composerEnhancement]: (m) => setComposerEnhancement(!!m.enabled),
    [MESSAGE_TYPE.convSort]: (m) => {
      setConvSort(!!m.enabled);
      // Compaction's L3 groups by "same parent as the previous row", which only
      // means anything in DOM order — and the sort reorders visually with CSS
      // `order`. Telling it lets L3 step down to L2 instead of mis-grouping.
      setConvSortActive(!!m.enabled);
    },
    [MESSAGE_TYPE.convCompact]: (m) => setConvCompact(m.level),
    [MESSAGE_TYPE.convRecentOnly]: (m) => setConvRecentOnly(!!m.enabled),
    [MESSAGE_TYPE.desktopPet]: (m) => applyDesktopPetState(m),
  };

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as OctoMessage | undefined;
    if (!data || data.source !== MESSAGE_SOURCE) return;
    if (data.type === MESSAGE_TYPE.master) {
      applyMaster(!!data.enabled);
      return;
    }
    // Remember the theme even while suspended so a later master-on can re-boot
    // with the right theme before the content script replays the settings.
    if (data.type === MESSAGE_TYPE.theme) lastThemeId = data.themeId;
    // While master is off the extension is suspended: drop all other settings
    // so we never re-inject styles/attributes onto the torn-down page.
    if (!masterEnabled) return;
    // Same for the beautify family while its own switch is off: these all drive
    // the torn-down engine, and applying them would re-inject its styles. The
    // content script replays them when the switch comes back on.
    if (!beautifyEnabled && BEAUTIFY_DRIVEN_TYPES.has(data.type)) return;

    // Quick mention from keyboard shortcut
    const rawData = event.data as Record<string, unknown>;
    if (rawData.type === 'quickMention' && typeof rawData.index === 'number') {
      handleQuickMention(rawData.index as number);
      return;
    }

    const handler = SETTING_HANDLERS[data.type] as ((message: OctoMessage) => void) | undefined;
    handler?.(data);
  });
});
