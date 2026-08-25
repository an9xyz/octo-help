import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const beautifyCss = readFileSync(new URL('./octoBeautify.css', import.meta.url), 'utf8');

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
