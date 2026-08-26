/**
 * Regenerate design-demos/pixel-skin.html from the live stylesheet.
 *
 * The demo has to be openable straight from disk — no extension install, no
 * Octo login — so it cannot fetch the stylesheet at runtime (file:// blocks it).
 * The skin section is therefore inlined here, and this script is how it stays in
 * step with utils/octoBeautify.css.
 *
 *   node scripts/build-pixel-preview.mjs
 *
 * The bump script below is a copy of spawnPixelHit/onPixelHover from
 * octoBeautify.ts. Keep the geometry constants in sync when that changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const cssPath = new URL('../utils/octoBeautify.css', import.meta.url);
const css = readFileSync(cssPath, 'utf8');
const at = css.indexOf('像素乐园皮肤');
if (at < 0) throw new Error('octoBeautify.css 里找不到像素乐园皮肤段');
// 从皮肤段一直取到文件尾：全站配色和 Bot 卡都追加在它后面。
const skin = css.slice(css.lastIndexOf('/*', at));

const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>像素乐园皮肤 · 预览</title>
<!-- 由 scripts/build-pixel-preview.mjs 生成，勿手改。改完皮肤 CSS 重跑即可。 -->
<style>
  body {
    margin: 0; padding: 32px; background: #eef2fb;
    font: 15px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  h1 { font-size: 16px; color: #444; margin: 0 0 4px; }
  p.hint { color: #667; margin: 0 0 28px; font-size: 13px; }
  .wk-conversation-content { max-width: 620px; margin: 0 auto; }
  .wk-msg-row { display: flex; gap: 12px; padding: 0 16px; margin: 26px 0; position: relative; }
  .wk-msg-row--send { flex-direction: row-reverse; }
  .wk-msg-row-avatar { width: 36px; height: 36px; border-radius: 6px; flex: none; background: #ccd6ee; }
  .wk-msg-row-content { min-width: 0; }
  .wk-msg-row-header { font-size: 12px; color: #778; margin-bottom: 4px; }
  .wk-msg-row--send .wk-msg-row-header { text-align: right; }
  .wk-markdown {
    position: relative; display: inline-block; max-width: 420px;
    padding: 10px 14px; border-radius: 8px; background: #fff;
  }
  .ai-badge {
    display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 4px;
    background: #7c6bf0; color: #fff;
  }
  .wk-reply-block {
    display: block; font-size: 13px; opacity: .85;
    padding: 4px 8px; margin-bottom: 6px; border-left: 2px solid #bbb;
  }

  /* Bot 卡骨架 —— 皮肤只覆盖配色和 banner，布局本来由基础层提供，
     这里补出最小的一份，好让 ::before/::after 的覆盖能落到实处。 */
  .wk-bot-detail-modal { max-width: 400px; margin: 40px auto 0; }
  .wk-modal-shell { background: #fff; border-radius: 16px; overflow: hidden; }
  .wk-bot-detail-content { display: flex; flex-direction: column; }
  .wk-bot-detail-header {
    position: relative; height: 176px; overflow: hidden;
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 14px 18px;
  }
  .wk-bot-detail-header::before,
  .wk-bot-detail-header::after {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 176px;
  }
  .wk-bot-detail-header > * { position: relative; z-index: 1; }
  .wk-bot-detail-header-avatar {
    width: 64px; height: 64px; background: #cfe0ff; align-self: flex-start;
    margin-bottom: 8px;
  }
  .wk-bot-detail-name { font-size: 20px; font-weight: 700; }
  .wk-bot-detail-id { font-size: 12px; }
  .wk-bot-detail-section { margin: 14px 18px 0; padding: 10px 12px; font-size: 13px; }
  .wk-bot-detail-label {
    display: inline-block; font-size: 11px; padding: 2px 8px; margin-bottom: 6px;
  }
  .wk-bot-detail-primary-action {
    margin: 16px 18px 20px; padding: 10px; font: inherit; font-weight: 700;
    cursor: pointer;
  }
</style>
<style>
${skin}
</style>
<body data-octo-skin="pixel">
  <h1>像素乐园皮肤 · 预览</h1>
  <p class="hint">悬停任意气泡：角色从气泡底沿跳起、顶开顶沿的宝箱、爆出 3 枚代币。场景高度跟着气泡走，单行和多行都试试。</p>

  <div class="wk-conversation-content">
    <div class="wk-msg-row">
      <div class="wk-msg-row-avatar"></div>
      <div class="wk-msg-row-content">
        <div class="wk-msg-row-header">同事</div>
        <div class="wk-markdown">单行消息（最矮的情况）。</div>
      </div>
    </div>

    <div class="wk-msg-row">
      <div class="wk-msg-row-avatar"></div>
      <div class="wk-msg-row-content">
        <div class="wk-msg-row-header">同事</div>
        <div class="wk-markdown">
          <span class="wk-reply-block">被引用的那条消息 —— 左边立着一根像素管道</span>
          引用块长这样。
        </div>
      </div>
    </div>

    <div class="wk-msg-row wk-msg-row--send">
      <div class="wk-msg-row-avatar"></div>
      <div class="wk-msg-row-content">
        <div class="wk-msg-row-header">我</div>
        <div class="wk-markdown">自己发的消息是浅蓝气泡。</div>
      </div>
    </div>

    <div class="wk-msg-row">
      <div class="wk-msg-row-avatar"></div>
      <div class="wk-msg-row-content">
        <div class="wk-msg-row-header">助手 <span class="ai-badge">AI</span></div>
        <div class="wk-markdown">AI 的消息是浅金气泡。这一条特意写长一些，好让气泡撑到多行，用来验证撞箱场景的高度确实跟着气泡走 —— 宝箱应该始终贴在气泡顶沿附近，角色始终站在底沿，而不是固定悬在某个高度上。</div>
      </div>
    </div>
  </div>

  <div class="wk-bot-detail-modal">
    <div class="wk-modal-shell" data-octo-rarity="SSR">
      <div class="wk-bot-detail-content" data-octo-rarity="SSR">
        <div class="wk-bot-detail-header">
          <div class="wk-bot-detail-header-avatar"></div>
          <div class="wk-bot-detail-name">值班机器人</div>
          <div class="wk-bot-detail-id">@oncall-bot</div>
        </div>
        <div class="wk-bot-detail-section">
          <span class="wk-bot-detail-label">简介</span>
          把值班信息推到群里，支持 /oncall 查询当前值班人。
        </div>
        <button class="wk-bot-detail-primary-action">发消息</button>
      </div>
    </div>
  </div>

<script>
// 与 utils/octoBeautify.ts 的 spawnPixelHit / onPixelHover 同逻辑
const SPRITE = 48, W = SPRITE + 8, RISE_MIN = 28, RISE_MAX = 96, PEARL_TOP = 4, LAND_MAX = 10, MS = 1550, COOLDOWN = 1700, HOVER_DELAY = 350, SCROLL_QUIET = 300;
const PEARL_MIN = 1, PEARL_MAX = 10, PEARL_INSET = 44, REACH_MAX = 420;
const cooling = new WeakSet();
function spawn(bubble) {
  const r = bubble.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const height = Math.min(Math.round(r.height) + SPRITE, SPRITE * 2 + RISE_MAX);
  let left = r.right + 8, flipped = false;
  if (left + W > window.innerWidth - 6) { left = r.left - 8 - W; flipped = true; }
  if (left < 6) return;
  const top = Math.max(6, Math.min(Math.round(r.bottom) - height, window.innerHeight - height - 6));
  const fx = document.createElement('div');
  fx.className = 'octo-pixel-hit';
  fx.setAttribute('aria-hidden', 'true');
  fx.style.left = Math.round(left) + 'px';
  fx.style.top = Math.round(top) + 'px';
  fx.style.height = height + 'px';
  fx.style.setProperty('--oph-rise', Math.max(RISE_MIN, height - SPRITE * 2) + 'px');
  const span = Math.min(Math.round(r.width) + 8, REACH_MAX);
  const reach = Math.max(48, span - PEARL_INSET);

  const crate = document.createElement('div');
  crate.className = 'oph-chest';
  fx.appendChild(crate);

  const pearlCount = PEARL_MIN + Math.floor(Math.random() * (PEARL_MAX - PEARL_MIN + 1));
  for (let i = 0; i < pearlCount; i++) {
    const at = pearlCount <= 1 ? 0.5 : i / (pearlCount - 1);
    const pearl = document.createElement('div');
    pearl.className = 'oph-pearl oph-pearl-' + (at < 0.34 ? 'c' : at < 0.67 ? 'a' : 'b');
    const dist = PEARL_INSET + reach * ((i + Math.random()) / pearlCount);
    pearl.style.setProperty('--oph-x', Math.round(flipped ? dist : -dist) + 'px');
    pearl.style.setProperty('--oph-y', Math.round(Math.random() * LAND_MAX) + 'px');
    pearl.style.animationDuration = (1.02 + Math.random() * 0.26).toFixed(2) + 's';
    pearl.style.animationDelay = Math.round(Math.random() * 90) + 'ms';
    fx.appendChild(pearl);
  }

  const hero = document.createElement('div');
  hero.className = 'oph-hero';
  fx.appendChild(hero);

  document.body.appendChild(fx);
  sceneLive = true;
  setTimeout(() => { fx.remove(); sceneLive = false; }, MS);
}
let hoverTimer, hoverTarget = null, sceneLive = false, scrolledAt = 0;
// 场景是 fixed 定位、按 spawn 时的坐标钉住的，列表一滚就和消息脱节了
let scrollFlagTimer;
document.addEventListener('scroll', () => {
  scrolledAt = Date.now();
  clearTimeout(hoverTimer);
  hoverTarget = null;
  document.body.setAttribute('data-octo-px-scrolling', '');
  clearTimeout(scrollFlagTimer);
  scrollFlagTimer = setTimeout(() => document.body.removeAttribute('data-octo-px-scrolling'), SCROLL_QUIET);
  if (!sceneLive) return;
  sceneLive = false;
  document.querySelectorAll('.octo-pixel-hit').forEach((el) => el.remove());
}, true);
document.addEventListener('pointerover', (e) => {
  const bubble = e.target instanceof Element ? e.target.closest('.wk-markdown, .wk-fold-msg-text') : null;
  if (bubble === hoverTarget) return;
  hoverTarget = bubble;
  clearTimeout(hoverTimer);
  if (!bubble || cooling.has(bubble)) return;
  hoverTimer = setTimeout(() => {
    if (hoverTarget !== bubble) return;
    if (Date.now() - scrolledAt < SCROLL_QUIET) return;
    if (document.querySelector('.octo-pixel-hit')) return;
    cooling.add(bubble);
    setTimeout(() => cooling.delete(bubble), COOLDOWN);
    spawn(bubble);
  }, HOVER_DELAY);
}, true);
</script>
</body>
</html>
`;

writeFileSync(new URL('../design-demos/pixel-skin.html', import.meta.url), html);
console.log(`design-demos/pixel-skin.html regenerated (skin CSS ${skin.length} B)`);
