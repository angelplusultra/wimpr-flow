import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { UIOHOOK_KEYS } from '../../../shared/keycodes'
import type { AppInfo, PlatformCheck } from '../../../shared/types'
import {
  OVERLAY_HEIGHT,
  OVERLAY_MARGIN_BOTTOM,
  OVERLAY_TITLE,
  OVERLAY_WIDTH,
  SETTINGS_HEIGHT,
  SETTINGS_TITLE,
  SETTINGS_WIDTH
} from '../../window-specs'
import { electronClipboard } from '../electron-clipboard'
import type { Platform } from '../types'
import { keyTap } from '../uiohook'
import { desktopNames } from './desktop-entries'
import { checkPlacement, hyprctl, HyprlandRules, isHyprland } from './hyprctl'
import { classToApp, overlayRule, parseActiveClass, parseClientClasses, settingsRule } from './hyprland'
import { evdevKeyHook, inputGroupPendingRelogin, keyboardAccess } from './input'
import { autostartEntry, installCommand } from './paste'
import { onPath, waylandClipboard, wtypePaste } from './wayland'

const OWN_TITLES = [OVERLAY_TITLE, SETTINGS_TITLE]

function osRelease(): string {
  try {
    return readFileSync('/etc/os-release', 'utf8')
  } catch {
    return ''
  }
}

/** What to run at login: the AppImage itself, the installed launcher, or this dev build. */
function launchCommand(): string {
  if (process.env.APPIMAGE) return process.env.APPIMAGE
  return app.isPackaged ? 'wimpr-flow' : process.execPath
}

const autostartFile = (): string =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'wimpr-flow.desktop')

export function createLinuxPlatform(): Platform {
  const wayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY
  const hyprland = isHyprland()
  const rules = hyprland
    ? new HyprlandRules([
        overlayRule(OVERLAY_TITLE, OVERLAY_WIDTH, OVERLAY_HEIGHT, OVERLAY_MARGIN_BOTTOM),
        settingsRule(SETTINGS_TITLE, SETTINGS_WIDTH, SETTINGS_HEIGHT)
      ])
    : null
  /** Whether Hyprland actually floated and pinned the overlay; null until it's been shown. */
  let overlayFloating: boolean | null = null

  // Before any window maps: rules only apply to windows opened after them.
  const rulesApplied = rules?.apply().then((syntax) => console.log(`[hyprland] window rules: ${syntax ?? 'failed'}`))
  rules?.watchReloads()

  async function activeClass(): Promise<string | null> {
    if (!hyprland) return null
    try {
      return parseActiveClass(await hyprctl(['-j', 'activewindow']))
    } catch {
      return null
    }
  }

  const pasteTools = ['wl-copy', 'wl-paste', 'wtype']

  return {
    createKeyHook: async () => evdevKeyHook(),
    canHookKeys: () => keyboardAccess().readable > 0,
    hotkeyBlockedLabel: '⚠ Allow keyboard access to enable hotkeys…',
    clipboard: wayland ? waylandClipboard : electronClipboard,
    async sendPaste(target) {
      if (wayland) await wtypePaste(target?.bundleId ?? null)
      else await keyTap(UIOHOOK_KEYS.V, [UIOHOOK_KEYS.Ctrl])
    },
    async frontmostApp(): Promise<AppInfo | null> {
      const cls = await activeClass()
      return cls ? classToApp(cls, await desktopNames()) : null
    },
    async runningApps(): Promise<AppInfo[]> {
      if (!hyprland) return []
      try {
        const classes = parseClientClasses(await hyprctl(['-j', 'clients'], 2000), OWN_TITLES)
        const names = await desktopNames()
        return classes.map((c) => classToApp(c, names)).sort((a, b) => a.name.localeCompare(b.name))
      } catch {
        return []
      }
    },
    async permissions() {
      const checks: PlatformCheck[] = []
      const { keyboards, readable } = keyboardAccess()
      const relogin = inputGroupPendingRelogin()
      checks.push({
        id: 'keyboard',
        label: 'Keyboard access',
        description: 'To detect the hotkey anywhere on the desktop, by reading the keyboard from /dev/input.',
        ok: readable > 0,
        command: relogin ? undefined : 'sudo usermod -aG input $USER',
        hint:
          keyboards === 0
            ? 'No keyboard found under /dev/input.'
            : relogin
              ? "You're in the input group, but this session started before that. Log out and back in."
              : 'Then log out and back in. Any app you run can read the keyboard once you are in this group.'
      })
      if (wayland) {
        const missing = pasteTools.filter((t) => !onPath(t))
        checks.push({
          id: 'paste-tools',
          label: 'Paste tools',
          description: 'wl-clipboard and wtype, to put text on the clipboard and press paste in other apps.',
          ok: missing.length === 0,
          command: installCommand(osRelease(), ['wl-clipboard', 'wtype']),
          hint: missing.length ? `Missing: ${missing.join(', ')}.` : undefined
        })
      }
      if (rules) {
        await rulesApplied
        const failed = rules.appliedWith === null || overlayFloating === false
        checks.push({
          id: 'hyprland-rules',
          label: 'Floating overlay',
          description: 'Hyprland window rules that keep the voice overlay floating, on top and out of focus.',
          ok: !failed,
          command: failed ? rules.snippet() : undefined,
          hint: failed ? "The app couldn't add these itself. Add them to your Hyprland config." : undefined
        })
      }
      return { checks }
    },
    requestPermission: async () => {},
    openPermissionSettings: () => {},
    positionsOverlay: !wayland,
    overlayShown() {
      if (!rules || overlayFloating !== null) return
      // Once Hyprland has mapped it, check the rule took effect.
      setTimeout(() => {
        void checkPlacement(OVERLAY_TITLE).then((p) => {
          if (!p) return
          overlayFloating = p.floating && p.pinned
          if (!overlayFloating) console.error('[hyprland] overlay is not floating/pinned; window rules did not apply')
        })
      }, 500)
    },
    modelsDir: () => join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'wimpr-flow', 'models'),
    setLaunchAtLogin(enabled) {
      const file = autostartFile()
      if (enabled) {
        mkdirSync(join(file, '..'), { recursive: true })
        writeFileSync(file, autostartEntry(launchCommand()))
      } else if (existsSync(file)) {
        rmSync(file)
      }
    },
    launchAtLoginHint: () =>
      hyprland
        ? `Hyprland only runs autostart entries through uwsm or dex. Otherwise add exec-once = ${launchCommand()} to your config.`
        : undefined
  }
}
