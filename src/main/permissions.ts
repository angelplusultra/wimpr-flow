import { app, shell, systemPreferences } from 'electron'
import type { PermissionStatus } from '../shared/types'

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

export function getPermissions(): PermissionStatus {
  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    grantTo: devHostApp()
  }
}

export async function requestPermission(kind: 'microphone' | 'accessibility'): Promise<PermissionStatus> {
  if (kind === 'microphone') {
    await systemPreferences.askForMediaAccess('microphone')
  } else {
    // Shows the system prompt pointing to System Settings → Accessibility.
    systemPreferences.isTrustedAccessibilityClient(true)
  }
  return getPermissions()
}

export function openPermissionSettings(kind: 'microphone' | 'accessibility'): void {
  const pane = kind === 'microphone' ? 'Privacy_Microphone' : 'Privacy_Accessibility'
  void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
}
