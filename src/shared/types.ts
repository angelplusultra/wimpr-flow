export interface Hotkeys {
  /** Keys held down to record; recording stops when any is released. `null` disables. */
  hold: number[] | null
  /** Keys pressed once to start and again to stop. `null` disables. */
  toggle: number[] | null
}

export interface Settings {
  /** Catalog id of the model to transcribe with. */
  model: string
  /** `auto` or an ISO-639-1 code. */
  language: string
  /** Names, jargon, etc. Passed as hints to models that support them. */
  vocabulary: string
  /** Run transcripts through a local LLM to fix punctuation, filler words and formatting. */
  cleanup: boolean
  hotkeys: Hotkeys
  minDurationMs: number
  sounds: boolean
  restoreClipboard: boolean
  launchAtLogin: boolean
  onboarded: boolean
}

// uiohook keycodes, duplicated here because the renderer can't load the native module.
export const KEY_ALT_RIGHT = 3640
export const KEY_SPACE = 57
export const KEY_ESCAPE = 1

export const DEFAULT_MODEL = 'parakeet-tdt-0.6b-v3'

export const DEFAULT_SETTINGS: Settings = {
  model: DEFAULT_MODEL,
  language: 'auto',
  vocabulary: '',
  cleanup: true,
  hotkeys: {
    hold: [KEY_ALT_RIGHT],
    toggle: [KEY_ALT_RIGHT, KEY_SPACE]
  },
  minDurationMs: 300,
  sounds: true,
  restoreClipboard: true,
  launchAtLogin: false,
  onboarded: false
}

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends unknown[] | null
    ? Settings[K]
    : Settings[K] extends object
      ? Partial<Settings[K]>
      : Settings[K]
}

export type AppState = 'idle' | 'recording' | 'transcribing' | 'error'

export interface OverlayState {
  state: AppState
  message?: string
}

export interface RecordingResult {
  sessionId: number
  /** 16 kHz mono float PCM. */
  pcm: Float32Array
  durationMs: number
  /** Highest per-chunk RMS level seen, 0..1. */
  peak: number
}

export interface StartRecording {
  sessionId: number
  sounds: boolean
}

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  accessibility: boolean
  /** In dev, the terminal app macOS actually checks permissions for. */
  grantTo?: string
}

export interface ModelInfo {
  id: string
  name: string
  maker: string
  /** One-line summary shown in the picker. */
  blurb: string
  sizeMb: number
  downloaded: boolean
  recommended?: boolean
  /** Set while a download is in flight. */
  progress?: ModelProgress
}

export interface ModelProgress {
  id: string
  received: number
  total: number
  done?: boolean
  error?: string
}

/** What the loaded model can do, as reported by the engine. */
export interface ModelCapabilities {
  languages: string[]
  languageDetect: boolean
  vocabulary: boolean
  contextPrompt: boolean
}

export interface EngineStatus {
  state: 'idle' | 'downloading' | 'loading' | 'ready' | 'error'
  modelId: string
  message?: string
  capabilities?: ModelCapabilities
  /** Timing of the most recent dictation, for comparing models. */
  last?: { audioMs: number; transcribeMs: number }
}

export interface CleanupStatus {
  state: 'off' | 'idle' | 'downloading' | 'loading' | 'ready' | 'error'
  modelName: string
  sizeMb: number
  downloaded: boolean
  message?: string
  /**
   * The most recent dictation. `applied`: the cleaned text was pasted. Otherwise the raw
   * transcript was: `rejected` means the output strayed too far from what was said.
   */
  last?: {
    ms: number
    outcome: 'applied' | 'unchanged' | 'rejected' | 'timeout' | 'error'
    /** What the speech model heard. */
    raw: string
    /** What was pasted. */
    text: string
  }
}

/** What the settings window sees. */
export interface SettingsView {
  settings: Settings
  keyNames: Record<number, string>
}

export const IPC = {
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderCancel: 'recorder:cancel',
  recorderResult: 'recorder:result',
  recorderError: 'recorder:error',
  overlayState: 'overlay:state',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  permissionsGet: 'permissions:get',
  permissionsRequest: 'permissions:request',
  permissionsOpen: 'permissions:open',
  hotkeyRecord: 'hotkey:record',
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsDelete: 'models:delete',
  modelsProgress: 'models:progress',
  engineStatus: 'engine:status',
  engineStatusChanged: 'engine:status-changed',
  cleanupStatus: 'cleanup:status',
  cleanupStatusChanged: 'cleanup:status-changed',
  cleanupDelete: 'cleanup:delete',
  openExternal: 'open-external'
} as const
