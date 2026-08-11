import { defineConfig } from 'wxt';
import { CHROME_EXTENSION_PUBLIC_KEY, FIREFOX_EXTENSION_ID } from './utils/extensionIdentity';
import { OCTO_MATCHES } from './utils/octoShared';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Auto-imports are off on purpose. Every module here already imports
  // explicitly, so scanning utils/ only produced "Duplicated imports" warnings
  // for the deliberate name pairs (octoFullscreenKickLazy vs
  // octoFullscreenKickPixi, octoBeautify vs octoThemeCatalog) — and it resolved
  // those globals to the *pixi* implementation, so a single forgotten import in
  // main-world code would have silently pulled ~540 KB of WebGL engine into the
  // always-injected bundle, right past the eslint no-restricted-imports guard.
  // WXT APIs are imported from '#imports' instead.
  imports: false,
  dev: {
    server: {
      port: 17321,
      strictPort: true,
    },
  },
  // Keep development startup headless; load the generated extension manually
  // when interactive testing is explicitly needed.
  webExt: {
    disabled: true,
  },
  manifest: ({ browser }) => ({
    name: 'Octo 聊天增强',
    description: '给 Octo 网页版换套好看的皮肤，顺手把常用操作变快：消息美化与全站换肤、舒适输入框（含快捷 @ 群成员）、GitHub 快捷跳转和桌面宠物。',
    minimum_chrome_version: '114',
    // Pin the extension ID. With no key, Chromium derives the ID from the
    // install *path*, so every user — and every re-extract of the release ZIP
    // into a new folder — got a different ID, and with it a different, empty
    // storage area. Firefox ignores `key` and needs its own declaration; both
    // constants live in utils/extensionIdentity.ts. See README「固定的扩展 ID」.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: FIREFOX_EXTENSION_ID, strict_min_version: '115.0' },
          },
        }
      : { key: CHROME_EXTENSION_PUBLIC_KEY }),
    action: {
      default_title: '打开 Octo 聊天增强设置',
    },
    commands: {
      'activate-octo': {
        suggested_key: {
          default: 'Alt+O',
          mac: 'Alt+O',
        },
        description: '切换到 Octo 标签页并聚焦输入框',
      },
      'quick-mention-1': {
        suggested_key: {
          default: 'Ctrl+Shift+1',
          mac: 'Ctrl+Shift+1',
        },
        description: '快捷 @ 第1人',
      },
      'quick-mention-2': {
        suggested_key: {
          default: 'Ctrl+Shift+2',
          mac: 'Ctrl+Shift+2',
        },
        description: '快捷 @ 第2人',
      },
      'quick-mention-3': {
        suggested_key: {
          default: 'Ctrl+Shift+3',
          mac: 'Ctrl+Shift+3',
        },
        description: '快捷 @ 第3人',
      },
      'quick-mention-4': {
        description: '快捷 @ 第4人',
      },
      'quick-mention-5': {
        description: '快捷 @ 第5人',
      },
    },
    omnibox: {
      keyword: 'octo',
    },
    permissions: ['storage', 'unlimitedStorage', 'tabs'],
    host_permissions: [...OCTO_MATCHES],
    web_accessible_resources: [
      {
        // MAIN-world scripts plus assets referenced from the page context.
        // octo-kick-world.js carries pixi.js and is injected on demand only
        // (see utils/octoFullscreenKickLazy.ts), keeping it out of every load.
        resources: [
          'octo-main-world.js',
          'octo-kick-world.js',
          'player-animation/*.webp',
        ],
        matches: [...OCTO_MATCHES],
      },
    ],
  }),
});
