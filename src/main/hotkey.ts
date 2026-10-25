import { KEY_ESCAPE, type Hotkeys } from '../shared/types'
import { HotkeyMachine, type HotkeyAction } from './hotkey-machine'
import type { KeyHook } from './platform/types'

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

  constructor(
    private readonly hook: KeyHook,
    bindings: Hotkeys,
    onAction: (action: HotkeyAction) => void
  ) {
    this.machine = new HotkeyMachine(bindings, onAction)
    hook.onKey((keycode, down) => this.onKey(keycode, down))
  }

  start(): void {
    if (this.started) return
    this.hook.start()
    this.started = true
  }

  stop(): void {
    if (!this.started) return
    this.hook.stop()
    this.started = false
  }

  get isStarted(): boolean {
    return this.started
  }

  /** Keys physically held right now. */
  get heldKeys(): number[] {
    return this.machine.pressedKeys
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

  private onKey(keycode: number, down: boolean): void {
    if (this.capture) {
      const c = this.capture
      if (down) {
        c.held.add(keycode)
        if (!c.keys.includes(keycode)) c.keys.push(keycode)
      } else {
        c.held.delete(keycode)
        if (c.held.size === 0 && c.keys.length > 0) {
          this.endCapture(c.keys.length === 1 && c.keys[0] === KEY_ESCAPE ? null : c.keys)
        }
      }
      // Only forward releases, so keys held before capture began don't stay "pressed".
      if (!down) this.machine.up(keycode)
      return
    }
    if (down) this.machine.down(keycode)
    else this.machine.up(keycode)
  }
}
