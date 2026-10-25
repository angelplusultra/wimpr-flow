import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

const OVERLAY_WIDTH = 200
const OVERLAY_HEIGHT = 48
const OVERLAY_MARGIN_BOTTOM = 80

function loadPage(win: BrowserWindow, page: 'overlay' | 'settings'): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/${page}/index.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
}

const preload = (): string => join(__dirname, '../preload/index.js')

/**
 * The overlay doubles as the recorder: it's always loaded (hidden) so the mic can start
 * instantly, and it's a non-activating panel so it never takes focus from the field
 * the user is dictating into.
 */
export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
    type: 'panel',
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
  loadPage(win, 'overlay')
  return win
}

export function showOverlay(win: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - OVERLAY_HEIGHT - OVERLAY_MARGIN_BOTTOM),
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT
  })
  if (!win.isVisible()) win.showInactive()
}

let settingsWin: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    app.focus({ steal: true })
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    title: 'Fuck Wispr Flow',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#08090a',
    show: false,
    webPreferences: {
      preload: preload(),
      sandbox: true,
      contextIsolation: true
    }
  })
  loadPage(settingsWin, 'settings')
  settingsWin.once('ready-to-show', () => {
    app.dock?.show()
    // Packaged builds get the icon from the bundle; in dev the dock would show Electron's.
    if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
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
