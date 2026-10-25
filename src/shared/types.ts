import { UIOHOOK_KEYS } from './keycodes'

export interface Hotkeys {
  /** Keys held down to record; recording stops when any is released. `null` disables. */
  hold: number[] | null
  /** Keys pressed once to start and again to stop. `null` disables. */
  toggle: number[] | null
}

/** An app the user dictates into. */
export interface AppInfo {
  /** macOS bundle id, Windows exe name (lower case) or Hyprland window class. */
  bundleId: string
  name: string
}

/** Extra cleanup instructions applied when dictating into a specific app. */
export interface AppRule extends AppInfo {
  instructions: string
  enabled: boolean
}

/** Someone you mention while dictating. */
export interface Person {
  id: string
  /** How you say it, e.g. "Sean". */
  name: string
  /** Other ways it gets heard or said, e.g. "Shawn". */
  aliases: string[]
  /** Mention to write per app (by bundle id), e.g. "@sean.kelly". Missing: "@" + name. */
  handles: Record<string, string>
}

/** An app where people are written as @mentions. */
export interface MentionApp extends AppInfo {
  enabled: boolean
}

export const DEFAULT_MENTION_APPS: MentionApp[] = [
  { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack', enabled: true },
  { bundleId: 'com.hnc.Discord', name: 'Discord', enabled: true },
  { bundleId: 'com.microsoft.teams2', name: 'Microsoft Teams', enabled: true }
]

/** Mention apps by platform; app ids differ between macOS, Windows and Linux. */
const MENTION_APPS_BY_PLATFORM: Record<string, MentionApp[]> = {
  darwin: DEFAULT_MENTION_APPS,
  win32: [
    { bundleId: 'slack.exe', name: 'Slack', enabled: true },
    { bundleId: 'discord.exe', name: 'Discord', enabled: true },
    { bundleId: 'ms-teams.exe', name: 'Microsoft Teams', enabled: true }
  ],
  linux: [
    { bundleId: 'Slack', name: 'Slack', enabled: true },
    { bundleId: 'discord', name: 'Discord', enabled: true },
    { bundleId: 'vesktop', name: 'Vesktop', enabled: true },
    { bundleId: 'teams-for-linux', name: 'Teams for Linux', enabled: true }
  ]
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
  /** Per-app cleanup instructions, matched by bundle id. */
  appRules: AppRule[]
  people: Person[]
  /** Apps where people are written as @mentions. */
  mentionApps: MentionApp[]
  /** In mention apps, also write names that aren't in `people` as @Name. */
  mentionOthers: boolean
  hotkeys: Hotkeys
  minDurationMs: number
  sounds: boolean
  restoreClipboard: boolean
  launchAtLogin: boolean
  onboarded: boolean
}

export const KEY_ALT_RIGHT: number = UIOHOOK_KEYS.AltRight
export const KEY_SPACE: number = UIOHOOK_KEYS.Space
export const KEY_ESCAPE: number = UIOHOOK_KEYS.Escape

export const DEFAULT_MODEL = 'parakeet-tdt-0.6b-v3'

export const DEFAULT_SETTINGS: Settings = {
  model: DEFAULT_MODEL,
  language: 'auto',
  vocabulary: '',
  cleanup: true,
  appRules: [],
  people: [],
  mentionApps: DEFAULT_MENTION_APPS,
  mentionOthers: true,
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

/** DEFAULT_SETTINGS with the mention apps for `platform`. */
export function defaultSettings(platform: string): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), mentionApps: structuredClone(MENTION_APPS_BY_PLATFORM[platform] ?? []) }
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

/** Something the app needs from the system: a permission, a tool, a group membership. */
export interface PlatformCheck {
  id: string
  label: string
  /** Why it's needed. */
  description: string
  ok: boolean
  /** Show a "Grant" button that asks the system for it. */
  request?: boolean
  /** Show an "Open Settings" button for the system settings page that controls it. */
  openSettings?: boolean
  /** A shell command that fixes it, shown with a copy button. */
  command?: string
  /** Extra guidance shown while it's failing, e.g. "then log out and back in". */
  hint?: string
}

export interface PermissionStatus {
  checks: PlatformCheck[]
  /** In dev on macOS, the terminal app macOS actually checks permissions for. */
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
  /** What the model runs on once loaded, e.g. "Metal", "Vulkan (NVIDIA GeForce RTX 4070)", "CPU". */
  device?: string
  /** Timing of the most recent dictation, for comparing models. */
  last?: { audioMs: number; transcribeMs: number }
}

export interface CleanupStatus {
  state: 'off' | 'idle' | 'downloading' | 'loading' | 'ready' | 'error'
  modelName: string
  sizeMb: number
  downloaded: boolean
  message?: string
  /** What the model runs on once loaded. */
  device?: string
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
    /** The app it was pasted into, and whether that app's rule / mentions were applied. */
    app?: string
    ruleApplied?: boolean
    mentions?: boolean
  }
}

/** What the settings window sees. */
export interface SettingsView {
  settings: Settings
  keyNames: Record<number, string>
  /** `process.platform` of the main process. */
  platform: string
  /** Extra setup for launching at login that the app can't do itself (Hyprland's exec-once). */
  launchAtLoginHint?: string
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
  appsRunning: 'apps:running',
  openExternal: 'open-external'
} as const
