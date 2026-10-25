import { KEY_ESCAPE, type Hotkeys } from '../shared/types'

export type HotkeyAction = 'start-hold' | 'start-toggle' | 'latch' | 'stop' | 'cancel'

type Mode = 'idle' | 'hold' | 'toggle'

/** If another key is pressed this soon after a hold starts, the user is typing a chord (e.g. ⌥E), not dictating. */
export const CHORD_WINDOW_MS = 600

/**
 * Turns raw key down/up events into dictation actions.
 *
 * - hold combo fully pressed → `start-hold`; releasing any of its keys → `stop`
 * - toggle combo pressed → `start-toggle`; pressed again (or the hold combo) → `stop`
 * - toggle combo completed while holding (e.g. ⌥ then Space) → `latch` into toggle mode
 * - Esc while recording → `cancel`
 *
 * After any stop/cancel, nothing new starts until every key has been released, so the
 * keys of a stopping combo can't immediately re-trigger a start.
 */
export class HotkeyMachine {
  private pressed = new Set<number>()
  private mode: Mode = 'idle'
  private armed = true
  private holdStartedAt = 0

  constructor(
    private bindings: Hotkeys,
    private readonly emit: (action: HotkeyAction) => void,
    private readonly now: () => number = Date.now
  ) {}

  setBindings(bindings: Hotkeys): void {
    this.bindings = bindings
    this.reset()
  }

  /** Called when recording ended for some other reason (error, rejected start). */
  reset(): void {
    this.mode = 'idle'
    this.armed = this.pressed.size === 0
  }

  get anyPressed(): boolean {
    return this.pressed.size > 0
  }

  get pressedKeys(): number[] {
    return [...this.pressed]
  }

  get currentMode(): Mode {
    return this.mode
  }

  down(keycode: number): void {
    if (this.pressed.has(keycode)) return // auto-repeat
    this.pressed.add(keycode)

    if (this.mode !== 'idle' && keycode === KEY_ESCAPE) {
      this.finish('cancel')
      return
    }

    const { hold, toggle } = this.bindings
    const toggleHit = this.completes(toggle, keycode)
    const holdHit = this.completes(hold, keycode)

    switch (this.mode) {
      case 'idle':
        if (!this.armed) return
        if (toggleHit) {
          this.mode = 'toggle'
          this.emit('start-toggle')
        } else if (holdHit) {
          this.mode = 'hold'
          this.holdStartedAt = this.now()
          this.emit('start-hold')
        }
        return
      case 'hold':
        if (toggleHit) {
          this.mode = 'toggle'
          this.emit('latch')
        } else if (!hold?.includes(keycode) && !toggle?.includes(keycode)) {
          if (this.now() - this.holdStartedAt < CHORD_WINDOW_MS) this.finish('cancel')
        }
        return
      case 'toggle':
        if (toggleHit || holdHit) this.finish('stop')
        return
    }
  }

  up(keycode: number): void {
    this.pressed.delete(keycode)
    if (this.mode === 'hold' && this.bindings.hold?.includes(keycode)) {
      this.finish('stop')
    }
    if (this.pressed.size === 0) this.armed = true
  }

  private finish(action: 'stop' | 'cancel'): void {
    this.mode = 'idle'
    this.armed = false
    this.emit(action)
  }

  private completes(combo: number[] | null, keycode: number): boolean {
    return !!combo && combo.length > 0 && combo.includes(keycode) && combo.every((k) => this.pressed.has(k))
  }
}
