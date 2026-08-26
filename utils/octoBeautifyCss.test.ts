import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const beautifyCss = readFileSync(new URL('./octoBeautify.css', import.meta.url), 'utf8');

/** Pull whole `{...}` blocks whose selector matches, brace-counted so nested
 *  keyframe bodies come out intact. */
function cssBlocks(selector: RegExp): string[] {
  const out: string[] = [];
  for (const match of beautifyCss.matchAll(selector)) {
    const open = beautifyCss.indexOf('{', match.index);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < beautifyCss.length; i++) {
      if (beautifyCss[i] === '{') depth++;
      else if (beautifyCss[i] === '}' && --depth === 0) {
        out.push(beautifyCss.slice(match.index, i + 1));
        break;
      }
    }
  }
  return out;
}

const GLOBAL_THEME_SCOPE = 'body[data-octo-global-theme]:not([data-octo-global-theme="none"])';
const QQ_SELF_MESSAGE_SELECTOR = 'body[data-octo-skin="qq2014"]:not([data-octo-qq-self-left]) .wk-msg-row--send:not(:has(.ai-badge))';

describe('global theme modal palette', () => {
  it('keeps the 3D bot card outside the generic modal panel background', () => {
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal),`);
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal) .semi-modal-content,`);
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal) .wk-modal-shell,`);
  });
});

describe('QQ 2014 sent attachment alignment', () => {
  it('keeps every direct message surface, including image and file cards, on the sent bubble edge', () => {
    expect(beautifyCss).toContain(
      `${QQ_SELF_MESSAGE_SELECTOR} .wk-msg-row-content > :not(.wk-msg-row-header) {`,
    );
  });

  it('keeps both reply-card DOM variants on the sent bubble edge', () => {
    expect(beautifyCss).toContain(
      `${QQ_SELF_MESSAGE_SELECTOR} .wk-msg-row-content .wk-reply-block,\n            ${QQ_SELF_MESSAGE_SELECTOR} .wk-msg-row-content .wk-message-text-reply {`,
    );
  });

  it('keeps reply cards within the QQ bubble width when their preview contains a long URL', () => {
    expect(beautifyCss).toContain(
      `${QQ_SELF_MESSAGE_SELECTOR} .wk-msg-row-content .wk-message-text-reply {\n                width: -moz-fit-content !important;\n                width: fit-content !important;\n                max-width: var(--q14-bubble-max) !important;`,
    );
  });
});

describe('message bubble sizing', () => {
  it('neutralizes octo-web nested fit-content hit areas', () => {
    expect(beautifyCss).toMatch(
      /\.wk-msg-row-body-hitarea\s*\{[^}]*width:\s*auto\s*!important;[^}]*max-width:\s*100%\s*!important;/s,
    );
  });
});

describe('pixel skin', () => {
  const SKIN = 'body[data-octo-skin="pixel"]';

  it('inlines every sprite the skin references', () => {
    for (const name of ['stand', 'jump', 'crate', 'crate-used', 'coin']) {
      expect(beautifyCss).toContain(`--octo-px-${name}: url("data:image/png;base64,`);
    }
  });

  it('keeps the generated sprite block inside its markers', () => {
    // Hand-written rules live outside them; build-pixel-sprites.mjs rewrites
    // only what is between. Losing a marker makes the script fail loudly.
    expect(beautifyCss).toContain('/* PIXEL-SPRITES:BEGIN');
    expect(beautifyCss).toContain('/* PIXEL-SPRITES:END */');
  });

  it('gives AI, self and other bubbles three distinct fills', () => {
    expect(beautifyCss).toContain(`${SKIN} .wk-msg-row:has(.ai-badge) .wk-markdown,`);
    expect(beautifyCss).toContain(`${SKIN} .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown {`);
    expect(beautifyCss).toContain(
      `${SKIN} .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown {`,
    );
  });

  it('scales sprites with nearest-neighbour so they never blur', () => {
    expect(beautifyCss).toContain('.octo-pixel-hit > * {\n                position: absolute;\n                image-rendering: pixelated;');
  });

  it('drives the bump scene entirely from keyframes', () => {
    for (const kf of ['oph-crate-face', 'oph-crate-bump', 'oph-hero-pose', 'oph-hero-jump', 'oph-coin-a', 'oph-coin-b', 'oph-coin-c']) {
      expect(beautifyCss).toContain(`@keyframes ${kf} {`);
    }
  });

  it('never puts !important on an animated transform', () => {
    // `!important` on transform/opacity would override the keyframes themselves,
    // silently freezing the scene on its first frame.
    //
    // Scanned by structure, not by position. This used to take everything
    // between `.octo-pixel-hit {` and the reduced-motion query, which meant any
    // rule later added in that stretch got swept in — the scroll-time hover
    // suppression legitimately needs `transform: none !important` to beat the
    // base layer, and tripped this.
    const blocks = [
      ...cssBlocks(/\.octo-pixel-hit[^{,]*(?=\s*\{)/g),
      ...cssBlocks(/@keyframes oph-[\w-]+/g),
    ];
    expect(blocks.length).toBeGreaterThan(8);
    for (const block of blocks) {
      expect(block).not.toMatch(/transform:[^;]*!important/);
      expect(block).not.toMatch(/opacity:[^;]*!important/);
    }
  });

  it('reads each coin landing off the coin itself, not the scene', () => {
    // The coin count is rolled per hit, so the landing vars cannot live on the
    // container — a fixed --oph-x1..xN set would cap how many coins can fly.
    expect(beautifyCss).not.toMatch(/--oph-x\d/);
    expect(beautifyCss).toContain('var(--oph-x, -60px)');
    expect(beautifyCss).toContain('var(--oph-y, 40px)');
  });

  it('builds the bot card banner by stacking sprites, at integer scales only', () => {
    const banner = beautifyCss.slice(
      beautifyCss.indexOf(`${SKIN} .wk-bot-detail-header::before`),
    ).slice(0, 700);
    for (const sprite of ['stand', 'crate', 'cloud', 'ground']) {
      expect(banner).toContain(`var(--octo-px-${sprite})`);
    }
    // 24px 与 16px 的源精灵只能按整数倍放；1.83 倍那种会把一个源像素
    // 切成宽窄不一的块，边缘立刻发脏。
    for (const [, size] of banner.matchAll(/\/ (\d+)px \d+px/g)) {
      expect([32, 48, 64, 96]).toContain(Number(size));
    }
  });

  it('ships a whole-site palette that only sets --octo-global-* vars', () => {
    expect(beautifyCss).toContain('body[data-octo-global-theme="pixel"] {');
    expect(beautifyCss).toContain('--octo-global-accent: #0070ec;');
    // 硬投影：任何 blur 半径都会把它拉出 8-bit
    expect(beautifyCss).toContain('--octo-global-shadow: 3px 3px 0 rgba(16, 16, 24, 0.16);');
  });

  it('hides the whole scene under reduced motion', () => {
    expect(beautifyCss).toContain('.octo-pixel-hit { display: none !important; }');
  });
});
