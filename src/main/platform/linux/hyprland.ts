// Pure helpers for Hyprland: hyprctl JSON, window rules and the event socket.
import type { AppInfo } from '../../../shared/types'

type EffectValue = boolean | number | string | [number | string, number | string]

/** A window rule matched by a window's initial title. */
export interface WindowRule {
  initialTitle: string
  effects: Record<string, EffectValue>
}

const anchored = (title: string): string => `^(${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`

/**
 * Hyprland 0.55+ (Lua config): the argument to `hyprctl eval`. Anonymous, so adding it again
 * after the app restarts can't clash with the copy still loaded from last time.
 */
export function luaRule(rule: WindowRule): string {
  const value = (v: EffectValue): string =>
    Array.isArray(v) ? `{ ${v.map((x) => JSON.stringify(x)).join(', ')} }` : JSON.stringify(v)
  const effects = Object.entries(rule.effects).map(([k, v]) => `${k} = ${value(v)}`)
  return `hl.window_rule({ match = { initial_title = ${JSON.stringify(anchored(rule.initialTitle))} }, ${effects.join(', ')} })`
}

/** Hyprland 0.53–0.54 (hyprlang): the value for `hyprctl keyword windowrule`. */
export function hyprlangRule(rule: WindowRule): string {
  // Expressions can't contain spaces, so each one is parenthesized.
  const part = (x: number | string): string => (typeof x === 'number' ? String(x) : `(${x.replace(/\s+/g, '')})`)
  const value = (v: EffectValue): string =>
    typeof v === 'boolean' ? (v ? 'on' : 'off') : Array.isArray(v) ? v.map(part).join(' ') : String(v)
  const effects = Object.entries(rule.effects).map(([k, v]) => `${k} ${value(v)}`)
  return [`match:initial_title ${anchored(rule.initialTitle)}`, ...effects].join(', ')
}

/** The voice overlay: floating, on every workspace, never focused, bottom-center of the focused monitor. */
export function overlayRule(title: string, width: number, height: number, marginBottom: number): WindowRule {
  return {
    initialTitle: title,
    effects: {
      float: true,
      pin: true,
      no_initial_focus: true,
      no_focus: true,
      focus_on_activate: false,
      size: [width, height],
      move: ['(monitor_w-window_w)*0.5', `monitor_h-window_h-${marginBottom}`],
      border_size: 0,
      decorate: false,
      no_shadow: true,
      no_blur: true,
      no_dim: true,
      no_anim: true,
      rounding: 0,
      opacity: '1.0 override 1.0 override 1.0 override'
    }
  }
}

/** The settings window: a floating, centered dialog rather than a tile. */
export function settingsRule(title: string, width: number, height: number): WindowRule {
  return { initialTitle: title, effects: { float: true, center: true, size: [width, height] } }
}

interface HyprClient {
  class?: string
  initialClass?: string
  initialTitle?: string
  mapped?: boolean
  hidden?: boolean
  floating?: boolean
  pinned?: boolean
}

function parseJson<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/** The window class from `hyprctl -j activewindow` (`{}` when nothing has focus). */
export function parseActiveClass(json: string): string | null {
  const w = parseJson<HyprClient>(json)
  return w?.class || w?.initialClass || null
}

/** Window classes from `hyprctl -j clients`, de-duplicated, skipping windows titled `skipTitles`. */
export function parseClientClasses(json: string, skipTitles: string[] = []): string[] {
  const clients = parseJson<HyprClient[]>(json)
  if (!Array.isArray(clients)) return []
  const classes = new Set<string>()
  for (const c of clients) {
    const cls = c.class || c.initialClass
    if (!cls || c.mapped === false || c.hidden || skipTitles.includes(c.initialTitle ?? '')) continue
    classes.add(cls)
  }
  return [...classes]
}

/** Whether the window that opened with `title` is floating and pinned; null if it isn't there. */
export function windowPlacement(json: string, title: string): { floating: boolean; pinned: boolean } | null {
  const clients = parseJson<HyprClient[]>(json)
  const w = Array.isArray(clients) ? clients.find((c) => c.initialTitle === title) : undefined
  return w ? { floating: !!w.floating, pinned: !!w.pinned } : null
}

/** `configreloaded>>` → `configreloaded`, from the event socket's line protocol. */
export function parseEventName(line: string): string | null {
  const i = line.indexOf('>>')
  return i > 0 ? line.slice(0, i) : null
}

export interface DesktopEntry {
  name: string
  wmClass?: string
}

/** Name= and StartupWMClass= from a .desktop file's [Desktop Entry] group. */
export function parseDesktopEntry(text: string): DesktopEntry | null {
  let inEntry = false
  let name: string | undefined
  let wmClass: string | undefined
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]'
      continue
    }
    if (!inEntry) continue
    if (line.startsWith('Name=') && name === undefined) name = line.slice(5).trim()
    else if (line.startsWith('StartupWMClass=')) wmClass = line.slice(15).trim()
  }
  return name ? { name, wmClass } : null
}

/** "org.gnome.Nautilus" → "Nautilus", "discord" → "Discord". */
export function prettyClass(cls: string): string {
  const last = cls.includes('.') ? cls.slice(cls.lastIndexOf('.') + 1) : cls
  return last.charAt(0).toUpperCase() + last.slice(1)
}

/** `cls` with its display name from `names` (lower-cased class or desktop id → Name). */
export function classToApp(cls: string, names: Map<string, string>): AppInfo {
  return { bundleId: cls, name: names.get(cls.toLowerCase()) ?? prettyClass(cls) }
}
