import type {
  AppInfo,
  CleanupStatus,
  EngineStatus,
  ModelInfo,
  ModelProgress,
  OverlayState,
  PermissionStatus,
  RecordingResult,
  SettingsPatch,
  SettingsView,
  StartRecording
} from '../shared/types'

type Unsubscribe = () => void
/** A PlatformCheck id. */
type PermissionKind = string

export interface AppApi {
  overlay: {
    onStart(cb: (msg: StartRecording) => void): Unsubscribe
    onStop(cb: (sessionId: number) => void): Unsubscribe
    onCancel(cb: (sessionId: number) => void): Unsubscribe
    onState(cb: (state: OverlayState) => void): Unsubscribe
    sendResult(result: RecordingResult): void
    sendError(sessionId: number, message: string): void
  }
  settings: {
    get(): Promise<SettingsView>
    set(patch: SettingsPatch): Promise<SettingsView>
    onChange(cb: (view: SettingsView) => void): Unsubscribe
    getPermissions(): Promise<PermissionStatus>
    requestPermission(kind: PermissionKind): Promise<PermissionStatus>
    openPermissionSettings(kind: PermissionKind): Promise<void>
    /** Resolves with the captured combo, or null if cancelled/unavailable. */
    recordHotkey(): Promise<number[] | null>
    listModels(): Promise<ModelInfo[]>
    downloadModel(id: string): Promise<ModelInfo[]>
    /** The selected model can't be deleted. */
    deleteModel(id: string): Promise<ModelInfo[]>
    onModelProgress(cb: (p: ModelProgress) => void): Unsubscribe
    getEngineStatus(): Promise<EngineStatus>
    onEngineStatus(cb: (s: EngineStatus) => void): Unsubscribe
    getCleanupStatus(): Promise<CleanupStatus>
    onCleanupStatus(cb: (s: CleanupStatus) => void): Unsubscribe
    /** Only while cleanup is turned off. */
    deleteCleanupModel(): Promise<CleanupStatus>
    /** Regular apps that are running, for picking one to add a rule for. */
    runningApps(): Promise<AppInfo[]>
    openExternal(url: string): Promise<void>
  }
}

declare global {
  interface Window {
    wimpr: AppApi
  }
}
