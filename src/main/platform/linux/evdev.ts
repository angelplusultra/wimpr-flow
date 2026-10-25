// Pure helpers for reading Linux input devices (/dev/input/event*).
import { UIOHOOK_KEYS as K } from '../../../shared/keycodes'

export const EV_KEY = 1
/** sizeof(struct input_event) on 64-bit Linux: struct timeval (16) + type, code (2 + 2) + value (4). */
export const INPUT_EVENT_SIZE = 24

export interface KeyEvent {
  /** evdev keycode (linux/input-event-codes.h). */
  code: number
  down: boolean
}

/**
 * Key presses and releases in a buffer of whole input_event records. Auto-repeat (value 2)
 * and non-key events are dropped.
 */
export function parseKeyEvents(buf: Buffer): KeyEvent[] {
  const events: KeyEvent[] = []
  for (let off = 0; off + INPUT_EVENT_SIZE <= buf.length; off += INPUT_EVENT_SIZE) {
    if (buf.readUInt16LE(off + 16) !== EV_KEY) continue
    const value = buf.readInt32LE(off + 20)
    if (value === 0 || value === 1) events.push({ code: buf.readUInt16LE(off + 18), down: value === 1 })
  }
  return events
}

const KEY_ENTER = 28
const KEY_A = 30
const KEY_Z = 44
const KEY_SPACE = 57

/**
 * Whether a device's key capability bitmap (sysfs `device/capabilities/key`: hex words, most
 * significant first) has the keys of a real keyboard. Mice, power buttons and lid switches
 * report EV_KEY too, but not letters.
 */
export function isKeyboard(capabilities: string): boolean {
  const words = capabilities.trim().split(/\s+/).reverse()
  const has = (bit: number): boolean => {
    const word = words[Math.floor(bit / 64)]
    return !!word && ((BigInt(`0x${word}`) >> BigInt(bit % 64)) & 1n) === 1n
  }
  return [KEY_A, KEY_Z, KEY_SPACE, KEY_ENTER].every(has)
}

/** Keys whose evdev and uiohook codes differ. Codes 1–83 (and F11/F12) are the same in both. */
const EXTENDED: Record<number, number> = {
  96: K.NumpadEnter,
  97: K.CtrlRight,
  98: K.NumpadDivide,
  99: K.PrintScreen,
  100: K.AltRight,
  102: K.Home,
  103: K.ArrowUp,
  104: K.PageUp,
  105: K.ArrowLeft,
  106: K.ArrowRight,
  107: K.End,
  108: K.ArrowDown,
  109: K.PageDown,
  110: K.Insert,
  111: K.Delete,
  125: K.Meta,
  126: K.MetaRight,
  183: K.F13,
  184: K.F14,
  185: K.F15,
  186: K.F16,
  187: K.F17,
  188: K.F18,
  189: K.F19,
  190: K.F20,
  191: K.F21,
  192: K.F22,
  193: K.F23,
  194: K.F24
}

/** Keys uiohook has no code for still count as "another key" (e.g. typing ⌥ + a media key). */
export const UNMAPPED_BASE = 0x10000

/** The uiohook keycode for an evdev keycode, so hotkey settings are the same on every platform. */
export function evdevToUiohook(code: number): number {
  if ((code >= 1 && code <= 83) || code === 87 || code === 88) return code
  return EXTENDED[code] ?? UNMAPPED_BASE + code
}

/** Parses /etc/group for `group`'s gid and members. */
export function groupEntry(etcGroup: string, group: string): { gid: number; members: string[] } | null {
  for (const line of etcGroup.split('\n')) {
    const [name, , gid, members] = line.split(':')
    if (name === group && gid) return { gid: Number(gid), members: (members ?? '').split(',').filter(Boolean) }
  }
  return null
}
