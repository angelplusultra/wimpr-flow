import { describe, expect, it } from 'vitest'
import {
  evdevToUiohook,
  groupEntry,
  INPUT_EVENT_SIZE,
  isKeyboard,
  parseKeyEvents,
  UNMAPPED_BASE
} from '../src/main/platform/linux/evdev'
import { UIOHOOK_KEYS } from '../src/shared/keycodes'

function event(type: number, code: number, value: number): Buffer {
  const buf = Buffer.alloc(INPUT_EVENT_SIZE)
  buf.writeBigInt64LE(1n, 0) // tv_sec
  buf.writeUInt16LE(type, 16)
  buf.writeUInt16LE(code, 18)
  buf.writeInt32LE(value, 20)
  return buf
}

describe('parseKeyEvents', () => {
  it('keeps presses and releases, dropping repeats and other event types', () => {
    const buf = Buffer.concat([
      event(4, 4, 458982), // EV_MSC scan code
      event(1, 100, 1), // Right Alt down
      event(0, 0, 0), // EV_SYN
      event(1, 100, 2), // auto-repeat
      event(1, 100, 0) // up
    ])
    expect(parseKeyEvents(buf)).toEqual([
      { code: 100, down: true },
      { code: 100, down: false }
    ])
  })

  it('ignores a trailing partial record', () => {
    expect(parseKeyEvents(Buffer.concat([event(1, 30, 1), Buffer.alloc(10)]))).toEqual([{ code: 30, down: true }])
  })
})

describe('isKeyboard', () => {
  // Real sysfs bitmaps: most significant word first, 64-bit words.
  const keyboard = '120013 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1000000000007 ff9f207ac14057ff febeffdfffefffff fffffffffffffffe'
  const mouse = '1f0000 0 0 0 0 0 0 0 0'
  const powerButton = '10000000000000 0'

  it('accepts a keyboard', () => expect(isKeyboard(keyboard)).toBe(true))
  it('rejects mice and buttons', () => {
    expect(isKeyboard(mouse)).toBe(false)
    expect(isKeyboard(powerButton)).toBe(false)
    expect(isKeyboard('0')).toBe(false)
    expect(isKeyboard('')).toBe(false)
  })
})

describe('evdevToUiohook', () => {
  it('maps the default hotkeys', () => {
    expect(evdevToUiohook(100)).toBe(UIOHOOK_KEYS.AltRight)
    expect(evdevToUiohook(57)).toBe(UIOHOOK_KEYS.Space)
    expect(evdevToUiohook(1)).toBe(UIOHOOK_KEYS.Escape)
  })

  it('maps letters, modifiers, arrows and function keys', () => {
    expect(evdevToUiohook(47)).toBe(UIOHOOK_KEYS.V)
    expect(evdevToUiohook(30)).toBe(UIOHOOK_KEYS.A)
    expect(evdevToUiohook(29)).toBe(UIOHOOK_KEYS.Ctrl)
    expect(evdevToUiohook(97)).toBe(UIOHOOK_KEYS.CtrlRight)
    expect(evdevToUiohook(56)).toBe(UIOHOOK_KEYS.Alt)
    expect(evdevToUiohook(125)).toBe(UIOHOOK_KEYS.Meta)
    expect(evdevToUiohook(126)).toBe(UIOHOOK_KEYS.MetaRight)
    expect(evdevToUiohook(54)).toBe(UIOHOOK_KEYS.ShiftRight)
    expect(evdevToUiohook(103)).toBe(UIOHOOK_KEYS.ArrowUp)
    expect(evdevToUiohook(108)).toBe(UIOHOOK_KEYS.ArrowDown)
    expect(evdevToUiohook(102)).toBe(UIOHOOK_KEYS.Home)
    expect(evdevToUiohook(111)).toBe(UIOHOOK_KEYS.Delete)
    expect(evdevToUiohook(59)).toBe(UIOHOOK_KEYS.F1)
    expect(evdevToUiohook(88)).toBe(UIOHOOK_KEYS.F12)
    expect(evdevToUiohook(183)).toBe(UIOHOOK_KEYS.F13)
    expect(evdevToUiohook(96)).toBe(UIOHOOK_KEYS.NumpadEnter)
    expect(evdevToUiohook(82)).toBe(UIOHOOK_KEYS.Numpad0)
  })

  it('maps every key to a distinct code', () => {
    const codes = Array.from({ length: 256 }, (_, i) => evdevToUiohook(i + 1))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('gives keys uiohook lacks a code outside its range', () => {
    expect(evdevToUiohook(113)).toBe(UNMAPPED_BASE + 113) // KEY_MUTE
    expect(Object.values(UIOHOOK_KEYS)).not.toContain(evdevToUiohook(113))
  })
})

describe('groupEntry', () => {
  const etc = 'root:x:0:root\ninput:x:994:marcello,alice\nvideo:x:985:\n'
  it('reads the gid and members', () => expect(groupEntry(etc, 'input')).toEqual({ gid: 994, members: ['marcello', 'alice'] }))
  it('handles empty member lists and missing groups', () => {
    expect(groupEntry(etc, 'video')).toEqual({ gid: 985, members: [] })
    expect(groupEntry(etc, 'plugdev')).toBeNull()
  })
})
