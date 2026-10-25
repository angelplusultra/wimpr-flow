// uiohook keycodes, copied from uiohook-napi's UiohookKey so the renderer and the Linux
// evdev backend can use them without loading the native module. Hotkey settings are stored
// in these codes on every platform.
export const UIOHOOK_KEYS = {
  Backspace: 0x000e,
  Tab: 0x000f,
  Enter: 0x001c,
  CapsLock: 0x003a,
  Escape: 0x0001,
  Space: 0x0039,
  PageUp: 0x0e49,
  PageDown: 0x0e51,
  End: 0x0e4f,
  Home: 0x0e47,
  ArrowLeft: 0xe04b,
  ArrowUp: 0xe048,
  ArrowRight: 0xe04d,
  ArrowDown: 0xe050,
  Insert: 0x0e52,
  Delete: 0x0e53,
  0: 0x000b,
  1: 0x0002,
  2: 0x0003,
  3: 0x0004,
  4: 0x0005,
  5: 0x0006,
  6: 0x0007,
  7: 0x0008,
  8: 0x0009,
  9: 0x000a,
  A: 0x001e,
  B: 0x0030,
  C: 0x002e,
  D: 0x0020,
  E: 0x0012,
  F: 0x0021,
  G: 0x0022,
  H: 0x0023,
  I: 0x0017,
  J: 0x0024,
  K: 0x0025,
  L: 0x0026,
  M: 0x0032,
  N: 0x0031,
  O: 0x0018,
  P: 0x0019,
  Q: 0x0010,
  R: 0x0013,
  S: 0x001f,
  T: 0x0014,
  U: 0x0016,
  V: 0x002f,
  W: 0x0011,
  X: 0x002d,
  Y: 0x0015,
  Z: 0x002c,
  Numpad0: 0x0052,
  Numpad1: 0x004f,
  Numpad2: 0x0050,
  Numpad3: 0x0051,
  Numpad4: 0x004b,
  Numpad5: 0x004c,
  Numpad6: 0x004d,
  Numpad7: 0x0047,
  Numpad8: 0x0048,
  Numpad9: 0x0049,
  NumpadMultiply: 0x0037,
  NumpadAdd: 0x004e,
  NumpadSubtract: 0x004a,
  NumpadDecimal: 0x0053,
  NumpadDivide: 0x0e35,
  NumpadEnter: 0x0e1c,
  NumpadEnd: 0xee4f,
  NumpadArrowDown: 0xee50,
  NumpadPageDown: 0xee51,
  NumpadArrowLeft: 0xee4b,
  NumpadArrowRight: 0xee4d,
  NumpadHome: 0xee47,
  NumpadArrowUp: 0xee48,
  NumpadPageUp: 0xee49,
  NumpadInsert: 0xee52,
  NumpadDelete: 0xee53,
  F1: 0x003b,
  F2: 0x003c,
  F3: 0x003d,
  F4: 0x003e,
  F5: 0x003f,
  F6: 0x0040,
  F7: 0x0041,
  F8: 0x0042,
  F9: 0x0043,
  F10: 0x0044,
  F11: 0x0057,
  F12: 0x0058,
  F13: 0x005b,
  F14: 0x005c,
  F15: 0x005d,
  F16: 0x0063,
  F17: 0x0064,
  F18: 0x0065,
  F19: 0x0066,
  F20: 0x0067,
  F21: 0x0068,
  F22: 0x0069,
  F23: 0x006a,
  F24: 0x006b,
  Semicolon: 0x0027,
  Equal: 0x000d,
  Comma: 0x0033,
  Minus: 0x000c,
  Period: 0x0034,
  Slash: 0x0035,
  Backquote: 0x0029,
  BracketLeft: 0x001a,
  Backslash: 0x002b,
  BracketRight: 0x001b,
  Quote: 0x0028,
  Ctrl: 0x001d, // Left
  CtrlRight: 0x0e1d,
  Alt: 0x0038, // Left
  AltRight: 0x0e38,
  Shift: 0x002a, // Left
  ShiftRight: 0x0036,
  Meta: 0x0e5b, // Left
  MetaRight: 0x0e5c,
  NumLock: 0x0045,
  ScrollLock: 0x0046,
  PrintScreen: 0x0e37
} as const satisfies Record<string, number>

export type KeyName = keyof typeof UIOHOOK_KEYS

const COMMON_NAMES: Partial<Record<KeyName, string>> = {
  Escape: 'Esc',
  Enter: '↩',
  Backspace: '⌫',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

const MAC_NAMES: Partial<Record<KeyName, string>> = {
  Alt: 'Left ⌥',
  AltRight: 'Right ⌥',
  Meta: 'Left ⌘',
  MetaRight: 'Right ⌘',
  Ctrl: 'Left ⌃',
  CtrlRight: 'Right ⌃',
  Shift: 'Left ⇧',
  ShiftRight: 'Right ⇧'
}

const PC_NAMES = (meta: string): Partial<Record<KeyName, string>> => ({
  Alt: 'Left Alt',
  AltRight: 'Right Alt',
  Meta: `Left ${meta}`,
  MetaRight: `Right ${meta}`,
  Ctrl: 'Left Ctrl',
  CtrlRight: 'Right Ctrl',
  Shift: 'Left Shift',
  ShiftRight: 'Right Shift'
})

/** Display names for every keycode, e.g. "Right ⌥" on macOS and "Right Alt" elsewhere. */
export function keyNames(platform: string): Record<number, string> {
  const pretty = {
    ...COMMON_NAMES,
    ...(platform === 'darwin' ? MAC_NAMES : PC_NAMES(platform === 'win32' ? 'Win' : 'Super'))
  }
  const names: Record<number, string> = {}
  for (const [name, code] of Object.entries(UIOHOOK_KEYS)) {
    names[code] = pretty[name as KeyName] ?? name
  }
  return names
}
