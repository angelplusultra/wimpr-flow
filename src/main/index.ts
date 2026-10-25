import { app, clipboard, ipcMain, Menu, Notification, shell, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import {
  IPC,
  type AppState,
  type CleanupStatus,
  type EngineStatus,
  type RecordingResult,
  type SettingsPatch,
  type SettingsView
} from '../shared/types'
import { Cleaner } from './cleaner'
import { CleanupEngine } from './cleanup'
import { Controller } from './controller'
import { frontmostApp, runningApps } from './focused-app'
import { migrateLegacyData } from './migrate'
import { Engine } from './engine'
import { HotkeyService, keyNames, tapPaste } from './hotkey'
import { CLEANUP_MODEL, findModel, ModelManager } from './models'
import { pasteText } from './paste'
import { getPermissions, openPermissionSettings, requestPermission } from './permissions'
import { SettingsStore } from './settings'
import { Transcriber } from './transcriber'
import { trayIcon } from './tray-icon'
import { createOverlayWindow, openSettingsWindow, settingsWindow, showOverlay } from './windows'

// Run against a different settings/models folder, e.g. to try a fresh install (`pnpm dev:fresh`).
// Must be set before the single-instance lock, which is per folder.
if (process.env.FWF_USER_DATA) app.setPath('userData', process.env.FWF_USER_DATA)
else {
  // Carry settings and models over from when the app was called open-wispr.
  try {
    migrateLegacyData(join(app.getPath('appData'), 'open-wispr'), app.getPath('userData'))
  } catch (err) {
    console.error('[migrate] failed:', err)
  }
}

if (!app.requestSingleInstanceLock()) app.quit()

app.dock?.hide()

let tray: Tray | null = null
let overlay: BrowserWindow
let store: SettingsStore
let hotkeys: HotkeyService
let controller: Controller
let models: ModelManager
let transcriber: Transcriber
let cleaner: Cleaner
const engine = new Engine()
const cleanupEngine = new CleanupEngine()

const STATE_LABEL: Record<AppState, string> = {
  idle: 'Ready',
  recording: 'Recording…',
  transcribing: 'Transcribing…',
  error: 'Error'
}

function settingsView(): SettingsView {
  return { settings: store.get(), keyNames: keyNames() }
}

function sendToSettings(channel: string, payload: unknown): void {
  settingsWindow()?.webContents.send(channel, payload)
}

function engineLabel(status: EngineStatus): string {
  const name = findModel(status.modelId)?.name ?? status.modelId
  switch (status.state) {
    case 'downloading':
      return `Downloading ${name}… ${status.message ?? ''}`.trim()
    case 'loading':
      return `Loading ${name}…`
    case 'error':
      return `${name}: ${status.message ?? 'error'}`
    case 'ready': {
      const last = status.last
      return last
        ? `${name} — last: ${(last.audioMs / 1000).toFixed(1)}s audio in ${(last.transcribeMs / 1000).toFixed(2)}s`
        : `${name} — ready`
    }
    default:
      return name
  }
}

const CLEANUP_OUTCOME: Record<NonNullable<CleanupStatus['last']>['outcome'], string> = {
  applied: '',
  unchanged: ' (no changes)',
  rejected: ' (output strayed, pasted raw)',
  timeout: ' (too slow, pasted raw)',
  error: ' (failed, pasted raw)'
}

function cleanupLabel(status: CleanupStatus): string | null {
  switch (status.state) {
    case 'downloading':
      return `Downloading ${status.modelName} for cleanup… ${status.message ?? ''}`.trim()
    case 'loading':
      return `Loading ${status.modelName} for cleanup…`
    case 'error':
      return `Cleanup: ${status.message ?? 'error'}`
    case 'ready':
      return status.last
        ? `Cleanup — last: ${(status.last.ms / 1000).toFixed(2)}s${CLEANUP_OUTCOME[status.last.outcome]}`
        : 'Cleanup — ready'
    default:
      return null
  }
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const settings = store.get()
  const state = controller.current
  const last = controller.lastTranscript
  const preview = last.length > 40 ? `${last.slice(0, 40)}…` : last
  const downloaded = models.list().filter((m) => m.downloaded)
  const cleanup = cleanupLabel(cleaner.status)

  tray.setImage(trayIcon(state === 'recording' || state === 'transcribing'))
  tray.setToolTip(`Fuck Wispr Flow — ${STATE_LABEL[state]}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Fuck Wispr Flow — ${STATE_LABEL[state]}`, enabled: false },
      { label: engineLabel(transcriber.status), enabled: false },
      ...(cleanup ? [{ label: cleanup, enabled: false }] : []),
      ...(hotkeys.isStarted
        ? []
        : [{ label: '⚠ Grant Accessibility access to enable hotkeys…', click: () => openSettingsWindow() }]),
      { type: 'separator' },
      {
        label: last ? `Paste last: “${preview}”` : 'Paste last transcript',
        enabled: !!last,
        click: () => void pasteNow(last)
      },
      { label: 'Copy last transcript', enabled: !!last, click: () => void clipboard.writeText(last) },
      { type: 'separator' },
      {
        label: 'Model',
        submenu: [
          ...downloaded.map(
            (m): Electron.MenuItemConstructorOptions => ({
              label: m.name,
              type: 'radio',
              checked: settings.model === m.id,
              click: () => store.update({ model: m.id })
            })
          ),
          ...(downloaded.length ? [{ type: 'separator' as const }] : []),
          { label: 'Download more models…', click: () => openSettingsWindow() }
        ]
      },
      { label: 'Settings…', accelerator: 'Command+,', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: 'Quit Fuck Wispr Flow', accelerator: 'Command+Q', click: () => app.quit() }
    ])
  )
}

async function pasteNow(text: string): Promise<void> {
  await pasteText(text, store.get().restoreClipboard, {
    waitForKeysReleased: () => hotkeys.waitForRelease(),
    sendPasteShortcut: tapPaste
  })
}

/** uiohook needs Accessibility; start it as soon as the user grants it. */
function startHotkeysWhenTrusted(): void {
  const tryStart = (): boolean => {
    if (!getPermissions().accessibility) return false
    try {
      hotkeys.start()
      console.log('[hotkey] global keyboard hook started')
      rebuildTrayMenu()
      return true
    } catch (err) {
      console.error('[hotkey] failed to start:', err)
      return false
    }
  }
  if (tryStart()) return
  console.log('[hotkey] waiting for Accessibility permission')
  const timer = setInterval(() => {
    if (tryStart()) clearInterval(timer)
  }, 2000)
}

function registerIpc(): void {
  ipcMain.on(IPC.recorderResult, (_e, result: RecordingResult) => void controller.handleRecording(result))
  ipcMain.on(IPC.recorderError, (_e, sessionId: number, message: string) =>
    controller.handleRecorderError(sessionId, message)
  )

  ipcMain.handle(IPC.settingsGet, () => settingsView())
  ipcMain.handle(IPC.settingsSet, (_e, patch: SettingsPatch) => {
    store.update(patch)
    return settingsView()
  })
  ipcMain.handle(IPC.permissionsGet, () => getPermissions())
  ipcMain.handle(IPC.permissionsRequest, (_e, kind: 'microphone' | 'accessibility') => requestPermission(kind))
  ipcMain.handle(IPC.permissionsOpen, (_e, kind: 'microphone' | 'accessibility') => openPermissionSettings(kind))
  ipcMain.handle(IPC.hotkeyRecord, () => (hotkeys.isStarted ? hotkeys.recordCombo() : null))
  ipcMain.handle(IPC.modelsList, () => models.list().map((m) => ({ ...m, progress: models.progress(m.id) })))
  ipcMain.handle(IPC.modelsDownload, async (_e, id: string) => {
    await transcriber.download(id).catch(() => {}) // failures are reported via progress events
    rebuildTrayMenu()
    return models.list()
  })
  ipcMain.handle(IPC.modelsDelete, (_e, id: string) => {
    if (store.get().model !== id) models.delete(id)
    rebuildTrayMenu()
    return models.list()
  })
  ipcMain.handle(IPC.engineStatus, () => transcriber.status)
  ipcMain.handle(IPC.cleanupStatus, () => cleaner.status)
  ipcMain.handle(IPC.appsRunning, () => runningApps())
  ipcMain.handle(IPC.cleanupDelete, () => {
    cleaner.deleteModel()
    return cleaner.status
  })
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  store = new SettingsStore()
  const modelsDir = join(app.getPath('userData'), 'models')
  models = new ModelManager(modelsDir)
  overlay = createOverlayWindow()

  transcriber = new Transcriber({
    engine,
    models,
    getSettings: () => store.get(),
    onStatus: (status) => {
      sendToSettings(IPC.engineStatusChanged, status)
      rebuildTrayMenu()
    },
    onDownloadProgress: (p) => sendToSettings(IPC.modelsProgress, p)
  })

  cleaner = new Cleaner({
    engine: cleanupEngine,
    models: new ModelManager(modelsDir, [CLEANUP_MODEL]),
    getSettings: () => store.get(),
    onStatus: (status) => {
      sendToSettings(IPC.cleanupStatusChanged, status)
      rebuildTrayMenu()
    }
  })

  controller = new Controller({
    getSettings: () => store.get(),
    startRecorder: (msg) => overlay.webContents.send(IPC.recorderStart, msg),
    stopRecorder: (id) => overlay.webContents.send(IPC.recorderStop, id),
    cancelRecorder: (id) => overlay.webContents.send(IPC.recorderCancel, id),
    showOverlay: () => showOverlay(overlay),
    hideOverlay: () => overlay.hide(),
    setOverlayState: (s) => overlay.webContents.send(IPC.overlayState, s),
    transcribe: (pcm, audioMs) => transcriber.transcribe(pcm, audioMs),
    cleanup: (text, app) => cleaner.clean(text, app),
    focusedApp: frontmostApp,
    paste: pasteNow,
    notifyError: (message) => new Notification({ title: 'Fuck Wispr Flow', body: message, silent: true }).show(),
    onStateChange: () => rebuildTrayMenu(),
    resetHotkeys: () => hotkeys.reset()
  })

  hotkeys = new HotkeyService(store.get().hotkeys, (action) => {
    switch (action) {
      case 'start-hold':
      case 'start-toggle':
        controller.start()
        break
      case 'stop':
        controller.stop()
        break
      case 'cancel':
        controller.cancel()
        break
      case 'latch':
        break // keeps recording; just no longer stops on release
    }
  })

  store.onChange((settings, previous) => {
    hotkeys.setBindings(settings.hotkeys)
    if (settings.launchAtLogin !== previous.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    if (settings.model !== previous.model) void transcriber.prepare()
    if (settings.cleanup !== previous.cleanup) void cleaner.prepare()
    rebuildTrayMenu()
    sendToSettings(IPC.settingsChanged, settingsView())
  })

  registerIpc()

  tray = new Tray(trayIcon(false))
  rebuildTrayMenu()
  startHotkeysWhenTrusted()
  // First launch downloads the default models; later launches just load them. Speech first,
  // so dictation works (unformatted) while the bigger cleanup model is still downloading.
  void transcriber.prepare().then(() => cleaner.prepare())

  const { microphone, accessibility } = getPermissions()
  if (!store.get().onboarded || microphone !== 'granted' || !accessibility) openSettingsWindow()
})

app.on('second-instance', () => openSettingsWindow())

// Tray app: closing the settings window must not quit.
app.on('window-all-closed', () => {})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  engine.stop()
  hotkeys?.stop()
  // Let the cleanup worker free its model first; killing it mid-run crashes llama.cpp.
  event.preventDefault()
  void cleanupEngine.stop().finally(() => app.quit())
})
