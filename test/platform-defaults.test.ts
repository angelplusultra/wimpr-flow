import { describe, expect, it } from 'vitest'
import { exeFallbackName, exeId, parseDescriptions } from '../src/main/platform/win32/apps'
import { deviceLabel } from '../src/shared/device'
import { keyNames, UIOHOOK_KEYS } from '../src/shared/keycodes'
import { DEFAULT_SETTINGS, defaultSettings } from '../src/shared/types'

describe('defaultSettings', () => {
  it('uses each platform’s app ids for mention apps', () => {
    expect(defaultSettings('darwin').mentionApps.map((a) => a.bundleId)).toContain('com.tinyspeck.slackmacgap')
    expect(defaultSettings('win32').mentionApps.map((a) => a.bundleId)).toContain('slack.exe')
    expect(defaultSettings('linux').mentionApps.map((a) => a.bundleId)).toContain('Slack')
    expect(defaultSettings('freebsd').mentionApps).toEqual([])
  })

  it('leaves the rest of the defaults alone and never shares them', () => {
    const s = defaultSettings('linux')
    expect({ ...s, mentionApps: DEFAULT_SETTINGS.mentionApps }).toEqual(DEFAULT_SETTINGS)
    s.hotkeys.hold!.push(1)
    expect(DEFAULT_SETTINGS.hotkeys.hold).toEqual([UIOHOOK_KEYS.AltRight])
  })
})

describe('keyNames', () => {
  it('uses Mac symbols on macOS and words elsewhere', () => {
    expect(keyNames('darwin')[UIOHOOK_KEYS.AltRight]).toBe('Right ⌥')
    expect(keyNames('linux')[UIOHOOK_KEYS.AltRight]).toBe('Right Alt')
    expect(keyNames('linux')[UIOHOOK_KEYS.Meta]).toBe('Left Super')
    expect(keyNames('win32')[UIOHOOK_KEYS.Meta]).toBe('Left Win')
    expect(keyNames('win32')[UIOHOOK_KEYS.Escape]).toBe('Esc')
    expect(keyNames('linux')[UIOHOOK_KEYS.V]).toBe('V')
  })
})

describe('Windows app ids', () => {
  it('uses the lower-case exe name', () => {
    expect(exeId('C:\\Users\\me\\AppData\\Local\\slack\\app-4.41.105\\slack.exe')).toBe('slack.exe')
    expect(exeId('C:\\Program Files\\WindowsApps\\MSTeams\\ms-teams.exe')).toBe('ms-teams.exe')
    expect(exeFallbackName('C:\\x\\Discord.exe')).toBe('Discord')
  })

  it('reads PowerShell file descriptions, single or many', () => {
    expect(parseDescriptions('{"Path":"C:\\\\x\\\\slack.exe","Description":"Slack"}')).toEqual(
      new Map([['c:\\x\\slack.exe', 'Slack']])
    )
    expect(
      parseDescriptions('[{"Path":"C:\\\\a.exe","Description":" A "},{"Path":"C:\\\\b.exe","Description":""},{"Path":null}]')
    ).toEqual(new Map([['c:\\a.exe', 'A']]))
    expect(parseDescriptions('')).toEqual(new Map())
  })
})

describe('deviceLabel', () => {
  it('names the backend and its devices', () => {
    expect(deviceLabel('metal', ['Apple M5 Pro'])).toBe('Metal (Apple M5 Pro)')
    expect(deviceLabel('vulkan', ['NVIDIA GeForce RTX 4070'])).toBe('Vulkan (NVIDIA GeForce RTX 4070)')
    expect(deviceLabel('cuda', [])).toBe('CUDA')
  })
})
