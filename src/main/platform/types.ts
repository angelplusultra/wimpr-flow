import type { BrowserWindow } from 'electron'
import type { AppInfo, PermissionStatus } from '../../shared/types'

/** A global keyboard hook. Keycodes are uiohook codes on every platform. */
export interface KeyHook {
  /** Throws if the hook can't run (e.g. no permission). */
  start(): void
  stop(): void
  onKey(cb: (keycode: number, down: boolean) => void): void
}

export interface ClipboardOps {
  /** Copies what's on the clipboard; the returned function puts it back. */
  snapshot(): Promise<(() => Promise<void>) | null>
  writeText(text: string): Promise<void>
  readText(): Promise<string>
}

/** Everything that differs between macOS, Windows and Linux. */
export interface Platform {
  createKeyHook(): Promise<KeyHook>
  /** Whether the key hook can start right now (permission granted, devices readable). */
  canHookKeys(): boolean
  /** Tray menu item shown while the hook can't start. */
  hotkeyBlockedLabel: string
  clipboard: ClipboardOps
  /** Press the paste shortcut in `target`, the app that had focus when recording started. */
  sendPaste(target: AppInfo | null): Promise<void>
  /** Called when a recording starts from the keyboard, while `keys` are still held. */
  onHotkeyStart?(keys: number[]): void
  frontmostApp(): Promise<AppInfo | null>
  runningApps(): Promise<AppInfo[]>
  permissions(): Promise<PermissionStatus>
  requestPermission(id: string): Promise<void>
  openPermissionSettings(id: string): void
  /** False where the compositor places the overlay (Wayland). */
  positionsOverlay: boolean
  /** Called once with each window after it's created, before it's shown. */
  prepareWindow?(win: BrowserWindow, kind: 'overlay' | 'settings'): void
  /** Called after the overlay is shown, e.g. to check the compositor floated it. */
  overlayShown?(): void
  modelsDir(): string
  setLaunchAtLogin(enabled: boolean): void
  /** Extra setup for launching at login that the app can't do itself. */
  launchAtLoginHint?(): string | undefined
  dispose?(): void
}
