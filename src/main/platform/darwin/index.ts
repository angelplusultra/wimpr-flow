import { app, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { UIOHOOK_KEYS } from '../../../shared/keycodes'
import type { PermissionStatus } from '../../../shared/types'
import { electronClipboard } from '../electron-clipboard'
import type { Platform } from '../types'
import { keyTap, uiohookKeyHook } from '../uiohook'
import { frontmostApp, runningApps } from './apps'

const KNOWN_HOSTS: Record<string, string> = {
  'com.mitchellh.ghostty': 'Ghostty',
  'com.apple.Terminal': 'Terminal',
  'com.googlecode.iterm2': 'iTerm',
  'com.microsoft.VSCode': 'Visual Studio Code',
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  'dev.warp.Warp-Stable': 'Warp',
  'net.kovidgoyal.kitty': 'kitty',
  'com.github.wez.wezterm': 'WezTerm'
}

/**
 * When run unpackaged from a terminal, macOS attributes permissions to the terminal app
 * (the "responsible process"), not Electron.app — so that's the app to grant.
 */
function devHostApp(): string | undefined {
  if (app.isPackaged) return undefined
  const bundleId = process.env.__CFBundleIdentifier
  return (bundleId && KNOWN_HOSTS[bundleId]) || process.env.TERM_PROGRAM || 'your terminal app'
}

const PANES: Record<string, string> = {
  microphone: 'Privacy_Microphone',
  accessibility: 'Privacy_Accessibility'
}

export function createDarwinPlatform(): Platform {
  return {
    createKeyHook: uiohookKeyHook,
    canHookKeys: () => systemPreferences.isTrustedAccessibilityClient(false),
    hotkeyBlockedLabel: '⚠ Grant Accessibility access to enable hotkeys…',
    clipboard: electronClipboard,
    sendPaste: () => keyTap(UIOHOOK_KEYS.V, [UIOHOOK_KEYS.Meta]),
    frontmostApp,
    runningApps,
    async permissions(): Promise<PermissionStatus> {
      return {
        checks: [
          {
            id: 'microphone',
            label: 'Microphone',
            description: 'To hear you while the hotkey is active.',
            ok: systemPreferences.getMediaAccessStatus('microphone') === 'granted',
            request: true,
            openSettings: true
          },
          {
            id: 'accessibility',
            label: 'Accessibility',
            description: 'To detect the hotkey and paste into other apps.',
            ok: systemPreferences.isTrustedAccessibilityClient(false),
            request: true,
            openSettings: true
          }
        ],
        grantTo: devHostApp()
      }
    },
    async requestPermission(id) {
      if (id === 'microphone') await systemPreferences.askForMediaAccess('microphone')
      // Shows the system prompt pointing to System Settings → Accessibility.
      else if (id === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true)
    },
    openPermissionSettings(id) {
      const pane = PANES[id]
      if (pane) void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
    },
    positionsOverlay: true,
    modelsDir: () => join(app.getPath('userData'), 'models'),
    setLaunchAtLogin: (openAtLogin) => app.setLoginItemSettings({ openAtLogin })
  }
}
