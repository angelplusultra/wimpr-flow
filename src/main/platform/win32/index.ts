import { app, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { UIOHOOK_KEYS } from '../../../shared/keycodes'
import type { AppInfo } from '../../../shared/types'
import { electronClipboard } from '../electron-clipboard'
import type { KeyHook, Platform } from '../types'
import { keyTap, uiohookKeyHook } from '../uiohook'
import { appInfo, describe } from './apps'

type User32 = typeof import('./user32')
let user32: Promise<User32> | null = null
const win32 = (): Promise<User32> => (user32 ??= import('./user32'))

const ALT_KEYS: number[] = [UIOHOOK_KEYS.Alt, UIOHOOK_KEYS.AltRight]

/** uiohook, minus keycode 0: unmapped keys, including the menu-mask key we inject ourselves. */
async function keyHook(): Promise<KeyHook> {
  const hook = await uiohookKeyHook()
  return { ...hook, onKey: (cb) => hook.onKey((keycode, down) => keycode !== 0 && cb(keycode, down)) }
}

async function frontmostApp(): Promise<AppInfo | null> {
  try {
    const path = (await win32()).foregroundExe()
    if (!path) return null
    await describe([path])
    return appInfo(path)
  } catch (err) {
    console.error('[apps] foreground window lookup failed:', err)
    return null
  }
}

async function runningApps(): Promise<AppInfo[]> {
  try {
    const paths = (await win32()).windowedExes()
    await describe(paths)
    const apps = new Map(paths.map((p) => [appInfo(p).bundleId, appInfo(p)]))
    apps.delete('wimpr flow.exe')
    return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error('[apps] window list failed:', err)
    return []
  }
}

export function createWin32Platform(): Platform {
  void win32().catch((err) => console.error('[win32] failed to load user32 bindings:', err))
  return {
    createKeyHook: keyHook,
    // Windows' low-level keyboard hook needs no permission.
    canHookKeys: () => true,
    hotkeyBlockedLabel: '⚠ The keyboard hook failed to start',
    clipboard: electronClipboard,
    sendPaste: () => keyTap(UIOHOOK_KEYS.V, [UIOHOOK_KEYS.Ctrl]),
    onHotkeyStart(keys) {
      if (keys.some((k) => ALT_KEYS.includes(k))) void win32().then((w) => w.maskAltMenu())
    },
    frontmostApp,
    runningApps,
    async permissions() {
      return {
        checks: [
          {
            id: 'microphone',
            label: 'Microphone',
            description: 'To hear you while the hotkey is active.',
            ok: systemPreferences.getMediaAccessStatus('microphone') !== 'denied',
            openSettings: true,
            hint: 'Turn on "Let desktop apps access your microphone".'
          }
        ]
      }
    },
    // Windows has no prompt for desktop apps; access is a switch in Settings.
    requestPermission: async () => {},
    openPermissionSettings(id) {
      if (id === 'microphone') void shell.openExternal('ms-settings:privacy-microphone')
    },
    positionsOverlay: true,
    // Local, not roaming, app data: models are several GB.
    modelsDir: () => join(process.env.LOCALAPPDATA ?? app.getPath('appData'), app.getName(), 'models'),
    setLaunchAtLogin: (openAtLogin) => app.setLoginItemSettings({ openAtLogin })
  }
}
