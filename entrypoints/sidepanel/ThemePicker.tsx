import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { GlobalThemeDef, ThemeCategory, ThemeDef } from '@/utils/octoThemeCatalog';

export type ThemeChoice = ThemeDef | GlobalThemeDef;

type ThemeFilter = 'all' | ThemeCategory;

const THEME_FILTERS: Array<{ id: ThemeFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'classic', label: '经典' },
  { id: 'special', label: '特色' },
];

export function ThemeSwatch({ theme, compact = false }: { theme: ThemeChoice; compact?: boolean }) {
  const style = {
    '--swatch-a': theme.colors[0],
    '--swatch-b': theme.colors[1],
    '--swatch-c': theme.colors[2],
  } as CSSProperties;

  return (
    <span className={`theme-swatch${compact ? ' is-compact' : ''}`} style={style} aria-hidden="true">
      <span className="theme-swatch-icon">{theme.icon}</span>
    </span>
  );
}

export interface ThemePickerProps {
  open: boolean;
  title: string;
  description: string;
  themes: ThemeChoice[];
  selectedId: string;
  appliesImmediately: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ThemePicker({
  open,
  title,
  description,
  themes,
  selectedId,
  appliesImmediately,
  onSelect,
  onClose,
}: ThemePickerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ThemeFilter>('all');
  const searchInput = useRef<HTMLInputElement>(null);
  const pickerPanel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const showDiscoveryTools = themes.length > 8;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setFilter('all');
    const focusTimer = window.setTimeout(() => {
      if (searchInput.current) searchInput.current.focus();
      else pickerPanel.current?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = pickerPanel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  const availableFilters = useMemo(
    () => THEME_FILTERS.filter((item) => item.id === 'all' || themes.some((theme) => theme.category === item.id)),
    [themes],
  );

  const filteredThemes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return themes.filter((theme) => {
      if (filter !== 'all' && theme.category !== filter) return false;
      if (!normalizedQuery) return true;
      const searchable = [theme.label, theme.description, ...(theme.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [filter, query, themes]);

  useEffect(() => {
    if (!open || query || filter !== 'all') return;
    const timer = window.setTimeout(() => {
      pickerPanel.current
        ?.querySelector<HTMLElement>('.theme-option.is-selected')
        ?.scrollIntoView({ block: 'nearest' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filter, open, query, selectedId]);

  if (!open) return null;

  return (
    <div
      className="theme-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={pickerPanel}
        className={`theme-picker${showDiscoveryTools ? '' : ' is-compact'}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-picker-title"
        aria-describedby="theme-picker-description"
      >
        <header className="theme-picker-header">
          <div>
            <h2 id="theme-picker-title">{title}</h2>
            <p id="theme-picker-description">{description}</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭主题选择" onClick={onClose}>
            ×
          </button>
        </header>

        {showDiscoveryTools && <div className="theme-picker-tools">
          <label className="theme-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchInput}
              type="search"
              value={query}
              placeholder="搜索主题名称、颜色或风格"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query && (
              <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </label>
          <div className="theme-filters" role="group" aria-label="主题分类">
            {availableFilters.map((item) => {
              const count = item.id === 'all'
                ? themes.length
                : themes.filter((theme) => theme.category === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  className={filter === item.id ? 'is-active' : ''}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}<span>{count}</span>
                </button>
              );
            })}
          </div>
        </div>}

        {showDiscoveryTools && <div className="theme-picker-summary" aria-live="polite">
          {filteredThemes.length > 0
            ? `找到 ${filteredThemes.length} 个主题`
            : '没有匹配的主题'}
        </div>}

        <div className="theme-options">
          {filteredThemes.map((theme) => {
            const selected = theme.id === selectedId;
            return (
              <button
                key={theme.id}
                type="button"
                className={`theme-option${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onSelect(theme.id)}
              >
                <ThemeSwatch theme={theme} />
                <span className="theme-option-copy">
                  <strong>{theme.label}</strong>
                  <small>{theme.description}</small>
                </span>
                <span className="theme-option-state">{selected ? '已选' : ''}</span>
              </button>
            );
          })}
          {filteredThemes.length === 0 && (
            <div className="theme-empty">
              <span aria-hidden="true">◌</span>
              <strong>换个关键词试试</strong>
              <small>可以搜索"深色"、"QQ"或"足球"</small>
            </div>
          )}
        </div>

        <footer className="theme-picker-footer">
          <span><i />{appliesImmediately ? '点击主题后会立即应用' : '重新开启全部增强后应用'}</span>
          <button type="button" onClick={onClose}>完成</button>
        </footer>
      </div>
    </div>
  );
}
