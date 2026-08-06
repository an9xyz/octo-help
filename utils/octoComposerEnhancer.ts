import { setMentionQuickBar, teardownMentionQuickBar } from './octoMentionBar';

const STYLE_ID = 'octo-composer-enhancement-style';
const ENABLED_ATTRIBUTE = 'data-octo-composer-enhanced';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-card {
      padding: 10px 14px;
      border-radius: 10px;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }

    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-card:focus-within {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--wk-color-theme, #6f63e8) 12%, transparent);
    }

    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-row {
      flex-direction: column;
      align-items: stretch;
    }

    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-inputbox {
      width: 100%;
      margin-right: 0;
      align-items: flex-start;
    }

    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-editor .ProseMirror {
      min-height: 60px;
      max-height: 180px;
      padding: 2px 0;
      overscroll-behavior: contain;
    }

    body[${ENABLED_ATTRIBUTE}='true']
      .wk-messageinput-box:not(.wk-messageinput-box--expanded)
      .wk-messageinput-actionbox {
      align-self: flex-end;
      min-height: 24px;
      margin-top: 6px;
      margin-left: auto;
    }

    @media (max-width: 720px) {
      body[${ENABLED_ATTRIBUTE}='true']
        .wk-messageinput-box:not(.wk-messageinput-box--expanded)
        .wk-messageinput-editor .ProseMirror {
        min-height: 44px;
        max-height: 132px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body[${ENABLED_ATTRIBUTE}='true']
        .wk-messageinput-box:not(.wk-messageinput-box--expanded)
        .wk-messageinput-card {
        transition: none;
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

export function setComposerEnhancement(enabled: boolean): void {
  if (!enabled) {
    teardownComposerEnhancement();
    return;
  }
  ensureStyle();
  document.body?.setAttribute(ENABLED_ATTRIBUTE, 'true');
  // The quick-@ strip lives in the roomier composer this feature creates, so it
  // rides the same switch instead of adding a second one for what the user
  // experiences as one input box.
  setMentionQuickBar(true);
}

export function teardownComposerEnhancement(): void {
  document.body?.removeAttribute(ENABLED_ATTRIBUTE);
  document.getElementById(STYLE_ID)?.remove();
  teardownMentionQuickBar();
}
