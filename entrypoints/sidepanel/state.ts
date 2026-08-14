import {
  DEFAULT_GLOBAL_THEME,
  DEFAULT_KICK_STYLE,
  DEFAULT_THEME,
} from '@/utils/octoThemeCatalog';
import type {
  BuiltInCompanionId,
  ConvCompactLevel,
  DesktopPetPlacement,
  PlayerWatermarkId,
  StoredCompatReport,
  StoredDesktopPet,
} from '@/utils/octoShared';

export type ExportResultValue = { summary: string; fileName: string; content: string };

export type BooleanSettingKey =
  | 'masterEnabled'
  | 'beautifyEnabled'
  | 'ballCursor'
  | 'qqSelfLeft'
  | 'composerEnhancement'
  | 'convSortEnabled'
  | 'convRecentOnly'
  | 'convFoldEnabled'
  | 'linkPreviewEnabled'
  | 'desktopPetEnabled';

export interface AppState {
  masterEnabled: boolean;
  beautifyEnabled: boolean;
  themeId: string;
  globalThemeId: string;
  kickStyle: string;
  playerWatermark: PlayerWatermarkId;
  ballCursor: boolean;
  qqSelfLeft: boolean;
  desktopPet: StoredDesktopPet | null;
  desktopPetEnabled: boolean;
  builtInCompanion: BuiltInCompanionId | null;
  desktopPetPlacement: DesktopPetPlacement;
  composerEnhancement: boolean;
  convSortEnabled: boolean;
  convCompactLevel: ConvCompactLevel;
  convRecentOnly: boolean;
  convFoldEnabled: boolean;
  convFoldCount: number;
  linkPreviewEnabled: boolean;
  // UI
  loading: boolean;
  petBusy: boolean;
  petError: string;
  settingsError: string;
  compatReport: StoredCompatReport | null;
  exportBusy: boolean;
  exportResult: ExportResultValue | null;
  exportError: string;
  activeThemePicker: 'message' | 'global' | null;
  openFeature: string | null;
}

export type AppAction =
  | { type: 'TOGGLE'; key: BooleanSettingKey }
  | { type: 'SET'; key: string; value: unknown }
  | { type: 'SET_MULTI'; updates: Partial<AppState> }
  | { type: 'SET_ERROR'; errorKey: 'petError' | 'settingsError' | 'exportError'; message: string }
  | { type: 'SET_BUSY'; key: 'loading' | 'petBusy' | 'exportBusy'; value: boolean }
  | { type: 'SET_RESULT'; value: ExportResultValue | null }
  | { type: 'SET_COMPAT'; value: StoredCompatReport | null }
  | { type: 'INIT'; state: Partial<AppState> };

export const APP_INITIAL_STATE: AppState = {
  masterEnabled: true,
  beautifyEnabled: true,
  themeId: DEFAULT_THEME,
  globalThemeId: DEFAULT_GLOBAL_THEME,
  kickStyle: DEFAULT_KICK_STYLE,
  playerWatermark: 'none',
  ballCursor: true,
  qqSelfLeft: false,
  desktopPet: null,
  desktopPetEnabled: false,
  builtInCompanion: null,
  desktopPetPlacement: 'desktop',
  composerEnhancement: true,
  convSortEnabled: false,
  convCompactLevel: 'off',
  convRecentOnly: false,
  convFoldEnabled: false,
  convFoldCount: 0,
  linkPreviewEnabled: true,
  loading: true,
  petBusy: false,
  petError: '',
  settingsError: '',
  compatReport: null,
  exportBusy: false,
  exportResult: null,
  exportError: '',
  activeThemePicker: null,
  openFeature: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE':
      return { ...state, [action.key]: !(state[action.key] as boolean) };
    case 'SET':
      return { ...state, [action.key]: action.value };
    case 'SET_MULTI':
      return { ...state, ...action.updates };
    case 'SET_ERROR':
      return { ...state, [action.errorKey]: action.message };
    case 'SET_BUSY':
      return { ...state, [action.key]: action.value };
    case 'SET_RESULT':
      return { ...state, exportResult: action.value };
    case 'SET_COMPAT':
      return { ...state, compatReport: action.value };
    case 'INIT':
      return { ...state, ...action.state };
    default:
      return state;
  }
}
