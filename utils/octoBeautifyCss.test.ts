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

describe('global theme modal palette', () => {
  it('keeps the 3D bot card outside the generic modal panel background', () => {
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal),`);
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal) .semi-modal-content,`);
    expect(beautifyCss).toContain(`${GLOBAL_THEME_SCOPE} .wk-modal:not(.wk-bot-detail-modal) .wk-modal-shell,`);
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
    for (const name of ['stand', 'jump', 'chest', 'chest-open', 'pearl', 'bubble', 'seabed', 'kelp']) {
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
    for (const kf of ['oph-chest-face', 'oph-chest-bump', 'oph-hero-pose', 'oph-hero-jump', 'oph-pearl-a', 'oph-pearl-b', 'oph-pearl-c']) {
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

  it('reads each pearl landing off the pearl itself, not the scene', () => {
    // The pearl count is rolled per hit, so the landing vars cannot live on the
    // container — a fixed --oph-x1..xN set would cap how many pearls can fly.
    expect(beautifyCss).not.toMatch(/--oph-x\d/);
    expect(beautifyCss).toContain('var(--oph-x, -60px)');
    expect(beautifyCss).toContain('var(--oph-y, 40px)');
  });

  it('builds the bot card banner by stacking sprites, at integer scales only', () => {
    const banner = beautifyCss.slice(
      beautifyCss.indexOf(`${SKIN} .wk-bot-detail-header::before`),
    ).slice(0, 700);
    for (const sprite of ['stand', 'chest', 'seabed']) {
      expect(banner).toContain(`var(--octo-px-${sprite})`);
    }
    // 24px 与 16px 的源精灵只能按整数倍放；1.83 倍那种会把一个源像素
    // 切成宽窄不一的块，边缘立刻发脏。
    for (const [, size] of banner.matchAll(/\/ (\d+)px \d+px/g)) {
      expect([32, 48, 64, 72, 96]).toContain(Number(size));
    }
  });

  it('drifts the banner bubbles, and stops them under reduced motion', () => {
    // 气泡竖向平铺，一个循环走满一个 tile 高度，首尾才接得上；两层位移量不同
    // 才会错开成远近两层。改动画就要一起改这两个数。
    expect(beautifyCss).toContain('@keyframes octo-px-bubble-rise {');
    expect(beautifyCss).toContain('to { background-position: left 14% top -72px, left 68% top -48px; }');
    const reduced = beautifyCss.slice(beautifyCss.indexOf('@media (prefers-reduced-motion'));
    expect(reduced).toContain('.wk-bot-detail-header::after');
  });

  it('leaves the animated background-position free of !important', () => {
    // `background: … !important` 的简写会连 background-position 一起设成
    // !important，而 !important 压过 keyframes —— 动画照跑，位置却钉死。
    // 这条规则和它在基础层的对应规则都必须拆成 background-image 写。
    // 同一个选择器出现两次（另一处在 reduced-motion 查询里，只有 animation: none），
    // 要的是带背景声明的那条。
    const rule = cssBlocks(/body\[data-octo-skin="pixel"\] \.wk-bot-detail-header::after/g)
      .find((block) => block.includes('background-image'));
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/(^|[^-])background:/);
    expect(rule).toMatch(/background-position:[^;!]*;/);

    const [base] = cssBlocks(/(?<!\] )\.wk-bot-detail-header::after/g);
    expect(base).not.toMatch(/(^|[^-])background:/);
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
