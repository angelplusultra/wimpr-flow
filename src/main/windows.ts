import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { platform } from './platform'
import {
  OVERLAY_HEIGHT,
  OVERLAY_MARGIN_BOTTOM,
  OVERLAY_TITLE,
  OVERLAY_WIDTH,
  SETTINGS_HEIGHT,
  SETTINGS_TITLE,
  SETTINGS_WIDTH
} from './window-specs'

function loadPage(win: BrowserWindow, page: 'overlay' | 'settings'): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/${page}/index.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
}

const preload = (): string => join(__dirname, '../preload/index.js')

/** Packaged builds get the icon from the bundle or installer; in dev it's the source PNG. */
function appIconPath(): string | undefined {
  return app.isPackaged ? undefined : join(__dirname, '../../build/icon.png')
}

/**
 * The overlay doubles as the recorder: it's always loaded (hidden) so the mic can start
 * instantly, and it's a non-activating panel so it never takes focus from the field
 * the user is dictating into.
 */
export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    // Hyprland's window rules find the overlay by this title.
    title: OVERLAY_TITLE,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    alwaysOnTop: true,
    webPreferences: {
      preload: preload(),
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true)
  win.on('page-title-updated', (e) => e.preventDefault())
  platform.prepareWindow?.(win, 'overlay')
  loadPage(win, 'overlay')
  return win
}

export function showOverlay(win: BrowserWindow): void {
  if (platform.positionsOverlay) {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    win.setBounds({
      x: Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2),
      y: Math.round(workArea.y + workArea.height - OVERLAY_HEIGHT - OVERLAY_MARGIN_BOTTOM),
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT
    })
  }
  if (win.isVisible()) return
  win.showInactive()
  platform.overlayShown?.()
}

/** Title bar per platform: inset traffic lights on macOS, overlay buttons on Windows, the system frame on Linux. */
function titleBar(): Electron.BrowserWindowConstructorOptions {
  switch (process.platform) {
    case 'darwin':
      return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 } }
    case 'win32':
      return { titleBarStyle: 'hidden', titleBarOverlay: { color: '#08090a', symbolColor: '#f7f8f8', height: 40 } }
    default:
      return {}
  }
}

let settingsWin: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    app.focus({ steal: true })
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    minWidth: 760,
    minHeight: 520,
    title: SETTINGS_TITLE,
    ...titleBar(),
    icon: process.platform === 'darwin' ? undefined : appIconPath(),
    backgroundColor: '#08090a',
    show: false,
    webPreferences: {
      preload: preload(),
      sandbox: true,
      contextIsolation: true
    }
  })
  settingsWin.on('page-title-updated', (e) => e.preventDefault())
  // Electron's default File/Edit/View menu has no place here, and Alt (the default hotkey) would toggle it.
  if (process.platform !== 'darwin') settingsWin.removeMenu()
  platform.prepareWindow?.(settingsWin, 'settings')
  loadPage(settingsWin, 'settings')
  settingsWin.once('ready-to-show', () => {
    app.dock?.show()
    // Packaged builds get the icon from the bundle; in dev the dock would show Electron's.
    const icon = appIconPath()
    if (icon) app.dock?.setIcon(icon)
    settingsWin?.show()
    app.focus({ steal: true })
  })
  settingsWin.on('closed', () => {
    settingsWin = null
    app.dock?.hide()
  })
  return settingsWin
}

export function settingsWindow(): BrowserWindow | null {
  return settingsWin && !settingsWin.isDestroyed() ? settingsWin : null
}
