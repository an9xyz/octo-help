import { useEffect, useState } from 'react';
import {
  BALL_CURSOR_STORAGE_KEY,
  GLOBAL_THEME_STORAGE_KEY,
  KICK_STYLE_STORAGE_KEY,
  MESSI_WATERMARK_STORAGE_KEY,
  PLAYER_WATERMARK_STORAGE_KEY,
  STORAGE_KEY,
  THEME_STORAGE_KEY,
  type PlayerWatermarkId,
} from '@/utils/octoRecall';
import {
  GLOBAL_THEMES,
  THEMES,
  DEFAULT_GLOBAL_THEME,
  DEFAULT_THEME,
  KICK_STYLES,
  DEFAULT_KICK_STYLE,
} from '@/utils/octoBeautify';
import './App.css';

const PLAYER_WATERMARKS: Array<{ id: PlayerWatermarkId; label: string; icon: string }> = [
  { id: 'none', label: '不显示', icon: '▫️' },
  { id: 'messi', label: '梅西', icon: '🇦🇷' },
  { id: 'mbappe', label: '姆巴佩', icon: '🇫🇷' },
];

function App() {
  const [enabled, setEnabled] = useState(false);
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  const [globalThemeId, setGlobalThemeId] = useState(DEFAULT_GLOBAL_THEME);
  const [kickStyle, setKick] = useState(DEFAULT_KICK_STYLE);
  const [playerWatermark, setPlayerWatermark] = useState<PlayerWatermarkId>('none');
  const [ballCursor, setBallCursor] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    browser.storage.local
      .get([
        STORAGE_KEY,
        THEME_STORAGE_KEY,
        GLOBAL_THEME_STORAGE_KEY,
        KICK_STYLE_STORAGE_KEY,
        PLAYER_WATERMARK_STORAGE_KEY,
        MESSI_WATERMARK_STORAGE_KEY,
        BALL_CURSOR_STORAGE_KEY,
      ])
      .then((res) => {
        if (!mounted) return;
        setEnabled(res[STORAGE_KEY] === true);
        if (typeof res[THEME_STORAGE_KEY] === 'string') setThemeId(res[THEME_STORAGE_KEY] as string);
        if (typeof res[GLOBAL_THEME_STORAGE_KEY] === 'string') {
          setGlobalThemeId(res[GLOBAL_THEME_STORAGE_KEY] as string);
        }
        if (typeof res[KICK_STYLE_STORAGE_KEY] === 'string') setKick(res[KICK_STYLE_STORAGE_KEY] as string);
        const storedPlayer = res[PLAYER_WATERMARK_STORAGE_KEY];
        if (storedPlayer === 'none' || storedPlayer === 'messi' || storedPlayer === 'mbappe') {
          setPlayerWatermark(storedPlayer);
        } else if (res[MESSI_WATERMARK_STORAGE_KEY] === true) {
          setPlayerWatermark('messi');
        }
        // Default ON (missing key => enabled).
        setBallCursor(res[BALL_CURSOR_STORAGE_KEY] !== false);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleRecall = async () => {
    const next = !enabled;
    setEnabled(next);
    await browser.storage.local.set({ [STORAGE_KEY]: next });
  };

  const chooseTheme = async (id: string) => {
    setThemeId(id);
    await browser.storage.local.set({ [THEME_STORAGE_KEY]: id });
  };

  const chooseGlobalTheme = async (id: string) => {
    setGlobalThemeId(id);
    await browser.storage.local.set({ [GLOBAL_THEME_STORAGE_KEY]: id });
  };

  const chooseKick = async (id: string) => {
    setKick(id);
    await browser.storage.local.set({ [KICK_STYLE_STORAGE_KEY]: id });
  };

  const choosePlayerWatermark = async (id: PlayerWatermarkId) => {
    setPlayerWatermark(id);
    await browser.storage.local.set({ [PLAYER_WATERMARK_STORAGE_KEY]: id });
  };

  const toggleBallCursor = async () => {
    const next = !ballCursor;
    setBallCursor(next);
    await browser.storage.local.set({ [BALL_CURSOR_STORAGE_KEY]: next });
  };

  return (
    <main className="panel">
      <h1 className="title">Octo 聊天增强</h1>

      <div className="grid">
      <section className="group">
        <div className="group-title">消息主题（美化换肤）</div>
        <div className="theme-list" aria-busy={loading}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-item${themeId === t.id ? ' is-active' : ''}`}
              aria-pressed={themeId === t.id}
              onClick={() => chooseTheme(t.id)}
            >
              <span className="theme-ico">{t.icon}</span>
              <span className="theme-label">{t.label}</span>
              <span className="theme-check">{themeId === t.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <div className="group-title">全站配色（导航 / 会话 / 输入区）</div>
        <div className="theme-list" aria-busy={loading}>
          {GLOBAL_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-item${globalThemeId === t.id ? ' is-active' : ''}`}
              aria-pressed={globalThemeId === t.id}
              onClick={() => chooseGlobalTheme(t.id)}
            >
              <span className="theme-ico">{t.icon}</span>
              <span className="theme-label">{t.label}</span>
              <span className="theme-check">{globalThemeId === t.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <div className="group-title">
          足球射门特效
          {themeId !== 'worldcup' && <span className="group-note">（气泡动画需世界杯主题）</span>}
        </div>
        <div className="theme-list">
          {KICK_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`theme-item${kickStyle === s.id ? ' is-active' : ''}`}
              aria-pressed={kickStyle === s.id}
              onClick={() => chooseKick(s.id)}
            >
              <span className="theme-ico">{s.icon}</span>
              <span className="theme-label">{s.label}</span>
              <span className="theme-check">{kickStyle === s.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <div className="group-title">球星射手（右下角 / 全屏射门）</div>
        <div className="player-selector" role="radiogroup" aria-label="球星水印" aria-busy={loading}>
          {PLAYER_WATERMARKS.map((player) => (
            <button
              key={player.id}
              type="button"
              role="radio"
              className={`player-option${playerWatermark === player.id ? ' is-active' : ''}`}
              aria-checked={playerWatermark === player.id}
              disabled={loading}
              onClick={() => choosePlayerWatermark(player.id)}
            >
              <span aria-hidden="true">{player.icon}</span>
              <span>{player.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group span-2">
        <label className="row">
          <div className="row-copy">
            <span className="row-title">鼠标变足球</span>
            <span className="row-desc">
              开启后把鼠标指针替换为足球（需先选择球星）；关闭则保留系统光标，点击仍可射门。
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ballCursor}
            className={`switch${ballCursor ? ' switch-on' : ''}`}
            disabled={loading}
            onClick={toggleBallCursor}
          >
            <span className="switch-knob" />
          </button>
        </label>

        <label className="row">
          <div className="row-copy">
            <span className="row-title">显示已撤回的消息</span>
            <span className="row-desc">
              开启后，把“撤回了一条消息”还原为原文，并标注「已撤回」。
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className={`switch${enabled ? ' switch-on' : ''}`}
            disabled={loading}
            onClick={toggleRecall}
          >
            <span className="switch-knob" />
          </button>
        </label>
      </section>
      </div>

      <p className="footnote">
        仅在 im.deepminer.com.cn 生效。所有处理在本地完成，插件不发送任何数据。
      </p>
    </main>
  );
}

export default App;
