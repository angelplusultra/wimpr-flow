import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi'
import type { Hotkeys } from '../shared/types'
import { HotkeyMachine, type HotkeyAction } from './hotkey-machine'

const PRETTY_NAMES: Record<string, string> = {
  Alt: 'Left ⌥',
  AltRight: 'Right ⌥',
  Meta: 'Left ⌘',
  MetaRight: 'Right ⌘',
  Ctrl: 'Left ⌃',
  CtrlRight: 'Right ⌃',
  Shift: 'Left ⇧',
  ShiftRight: 'Right ⇧',
  Escape: 'Esc',
  Enter: '↩',
  Backspace: '⌫',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

export function keyNames(): Record<number, string> {
  const names: Record<number, string> = {}
  for (const [name, code] of Object.entries(UiohookKey)) {
    names[code] = PRETTY_NAMES[name] ?? name
  }
  return names
}

/** Owns the global keyboard hook; feeds the state machine and supports capturing a new combo. */
export class HotkeyService {
  private readonly machine: HotkeyMachine
  private started = false
  private capture: {
    keys: number[]
    held: Set<number>
    resolve: (keys: number[] | null) => void
    timer: NodeJS.Timeout
  } | null = null

  constructor(bindings: Hotkeys, onAction: (action: HotkeyAction) => void) {
    this.machine = new HotkeyMachine(bindings, onAction)
    uIOhook.on('keydown', (e) => this.onKey(e, true))
    uIOhook.on('keyup', (e) => this.onKey(e, false))
  }

  start(): void {
    if (this.started) return
    uIOhook.start()
    this.started = true
  }

  stop(): void {
    if (!this.started) return
    uIOhook.stop()
    this.started = false
  }

  get isStarted(): boolean {
    return this.started
  }

  setBindings(bindings: Hotkeys): void {
    this.machine.setBindings(bindings)
  }

  reset(): void {
    this.machine.reset()
  }

  /** Resolves once no keys are physically held (or after `timeoutMs`). */
  async waitForRelease(timeoutMs = 500): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (this.machine.anyPressed && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  /**
   * Capture the next key combo: everything pressed until all keys are released.
   * Resolves null on Esc-only or timeout. The dictation machine is paused meanwhile.
   */
  recordCombo(timeoutMs = 10_000): Promise<number[] | null> {
    this.endCapture(null)
    this.machine.reset()
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.endCapture(null), timeoutMs)
      this.capture = { keys: [], held: new Set(), resolve, timer }
    })
  }

  private endCapture(keys: number[] | null): void {
    if (!this.capture) return
    clearTimeout(this.capture.timer)
    this.capture.resolve(keys)
    this.capture = null
    this.machine.reset()
  }

  private onKey(e: UiohookKeyboardEvent, down: boolean): void {
    if (this.capture) {
      const c = this.capture
      if (down) {
        c.held.add(e.keycode)
        if (!c.keys.includes(e.keycode)) c.keys.push(e.keycode)
      } else {
        c.held.delete(e.keycode)
        if (c.held.size === 0 && c.keys.length > 0) {
          this.endCapture(c.keys.length === 1 && c.keys[0] === UiohookKey.Escape ? null : c.keys)
        }
      }
      // Only forward releases, so keys held before capture began don't stay "pressed".
      if (!down) this.machine.up(e.keycode)
      return
    }
    if (down) this.machine.down(e.keycode)
    else this.machine.up(e.keycode)
  }
}

export function tapPaste(): void {
  uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta])
}
