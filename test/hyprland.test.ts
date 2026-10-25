import { describe, expect, it } from 'vitest'
import {
  classToApp,
  hyprlangRule,
  luaRule,
  overlayRule,
  parseActiveClass,
  parseClientClasses,
  parseDesktopEntry,
  parseEventName,
  prettyClass,
  settingsRule,
  windowPlacement
} from '../src/main/platform/linux/hyprland'

describe('window rules', () => {
  const overlay = overlayRule('Wimpr Flow overlay', 200, 48, 80)

  it('writes the Lua rule for hyprctl eval', () => {
    const lua = luaRule(overlay)
    expect(lua).toMatch(/^hl\.window_rule\(\{ match = \{ initial_title = "\^\(Wimpr Flow overlay\)\$" \}, /)
    expect(lua).toContain('float = true')
    expect(lua).toContain('pin = true')
    expect(lua).toContain('no_initial_focus = true')
    expect(lua).toContain('no_focus = true')
    expect(lua).toContain('focus_on_activate = false')
    expect(lua).toContain('size = { 200, 48 }')
    expect(lua).toContain('move = { "(monitor_w-window_w)*0.5", "monitor_h-window_h-80" }')
    expect(lua).toContain('opacity = "1.0 override 1.0 override 1.0 override"')
    expect(lua.endsWith(' })')).toBe(true)
  })

  it('writes the hyprlang rule for hyprctl keyword', () => {
    const rule = hyprlangRule(overlay)
    expect(rule.startsWith('match:initial_title ^(Wimpr Flow overlay)$, ')).toBe(true)
    expect(rule).toContain('float on')
    expect(rule).toContain('focus_on_activate off')
    expect(rule).toContain('size 200 48')
    expect(rule).toContain('move ((monitor_w-window_w)*0.5) (monitor_h-window_h-80)')
    expect(rule).toContain('border_size 0')
    // Effects are comma-separated, so no value may contain one.
    expect(rule.split(', ').every((part) => /^[a-z_:]+ /.test(part))).toBe(true)
  })

  it('escapes regex characters in titles', () => {
    expect(hyprlangRule(settingsRule('Wimpr Flow (beta)', 880, 640))).toContain('^(Wimpr Flow \\(beta\\))$')
  })
})

describe('hyprctl output', () => {
  it('reads the active window class', () => {
    expect(parseActiveClass('{"address":"0x1","class":"Slack","title":"general"}')).toBe('Slack')
    expect(parseActiveClass('{}')).toBeNull()
    expect(parseActiveClass('Invalid')).toBeNull()
  })

  it('lists classes, de-duplicated, skipping hidden, unmapped and our own windows', () => {
    const clients = JSON.stringify([
      { class: 'kitty', initialTitle: 'kitty', mapped: true },
      { class: 'kitty', initialTitle: 'kitty', mapped: true },
      { class: 'firefox', initialTitle: 'Mozilla Firefox', mapped: true },
      { class: 'wimpr-flow', initialTitle: 'Wimpr Flow overlay', mapped: true },
      { class: 'ghost', mapped: false },
      { class: 'scratch', hidden: true },
      { class: '' }
    ])
    expect(parseClientClasses(clients, ['Wimpr Flow overlay'])).toEqual(['kitty', 'firefox'])
    expect(parseClientClasses('nope')).toEqual([])
  })

  it('finds where the overlay was placed', () => {
    const clients = JSON.stringify([{ initialTitle: 'Wimpr Flow overlay', floating: true, pinned: false }])
    expect(windowPlacement(clients, 'Wimpr Flow overlay')).toEqual({ floating: true, pinned: false })
    expect(windowPlacement('[]', 'Wimpr Flow overlay')).toBeNull()
  })

  it('reads event names from socket2 lines', () => {
    expect(parseEventName('configreloaded>>')).toBe('configreloaded')
    expect(parseEventName('activewindow>>kitty,~')).toBe('activewindow')
    expect(parseEventName('garbage')).toBeNull()
  })
})

describe('app names', () => {
  it('reads Name and StartupWMClass from the Desktop Entry group only', () => {
    const text = '[Desktop Entry]\nName=Slack\nName[de]=Slack DE\nStartupWMClass=Slack\n[Desktop Action new]\nName=New window\n'
    expect(parseDesktopEntry(text)).toEqual({ name: 'Slack', wmClass: 'Slack' })
    expect(parseDesktopEntry('[Other]\nName=x')).toBeNull()
  })

  it('prettifies classes without a desktop entry', () => {
    expect(prettyClass('org.gnome.Nautilus')).toBe('Nautilus')
    expect(prettyClass('discord')).toBe('Discord')
    expect(classToApp('Slack', new Map([['slack', 'Slack']]))).toEqual({ bundleId: 'Slack', name: 'Slack' })
    expect(classToApp('vesktop', new Map())).toEqual({ bundleId: 'vesktop', name: 'Vesktop' })
  })
})
