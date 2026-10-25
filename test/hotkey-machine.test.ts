import { describe, expect, it } from 'vitest'
import { CHORD_WINDOW_MS, HotkeyMachine, type HotkeyAction } from '../src/main/hotkey-machine'
import { KEY_ALT_RIGHT as OPT, KEY_ESCAPE as ESC, KEY_SPACE as SPACE } from '../src/shared/types'

const E = 18 // uiohook keycode for "E"
const F5 = 63

function setup(bindings = { hold: [OPT], toggle: [OPT, SPACE] }) {
  const actions: HotkeyAction[] = []
  let now = 0
  const m = new HotkeyMachine(bindings, (a) => actions.push(a), () => now)
  return { m, actions, advance: (ms: number) => (now += ms) }
}

describe('HotkeyMachine', () => {
  it('hold: starts on press, stops on release', () => {
    const { m, actions } = setup()
    m.down(OPT)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'stop'])
  })

  it('ignores auto-repeat keydowns', () => {
    const { m, actions } = setup()
    m.down(OPT)
    m.down(OPT)
    m.down(OPT)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'stop'])
  })

  it('latches into hands-free when the toggle combo completes while holding', () => {
    const { m, actions, advance } = setup()
    m.down(OPT)
    advance(1000)
    m.down(SPACE)
    m.up(SPACE)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'latch'])
    expect(m.currentMode).toBe('toggle')
    // Pressing the hold key again stops; its keys can't immediately start a new one.
    m.down(OPT)
    m.down(SPACE)
    m.up(SPACE)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'latch', 'stop'])
    // Once everything is released, it works again.
    m.down(OPT)
    expect(actions.at(-1)).toBe('start-hold')
  })

  it('independent toggle key starts and stops', () => {
    const { m, actions } = setup({ hold: [OPT], toggle: [F5] })
    m.down(F5)
    m.up(F5)
    m.down(F5)
    m.up(F5)
    expect(actions).toEqual(['start-toggle', 'stop'])
  })

  it('Esc cancels a recording', () => {
    const { m, actions, advance } = setup({ hold: [OPT], toggle: [F5] })
    m.down(F5)
    m.up(F5)
    advance(2000)
    m.down(ESC)
    m.up(ESC)
    expect(actions).toEqual(['start-toggle', 'cancel'])
  })

  it('Esc does nothing when idle', () => {
    const { m, actions } = setup()
    m.down(ESC)
    m.up(ESC)
    expect(actions).toEqual([])
  })

  it('cancels when the hold key is used as a modifier for typing (e.g. ⌥E)', () => {
    const { m, actions } = setup()
    m.down(OPT)
    m.down(E)
    m.up(E)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'cancel'])
  })

  it('does not cancel on stray keys late into a long hold', () => {
    const { m, actions, advance } = setup()
    m.down(OPT)
    advance(CHORD_WINDOW_MS + 1)
    m.down(E)
    m.up(E)
    m.up(OPT)
    expect(actions).toEqual(['start-hold', 'stop'])
  })

  it('disabled bindings never fire', () => {
    const { m, actions } = setup({ hold: null as unknown as number[], toggle: null as unknown as number[] })
    m.down(OPT)
    m.down(SPACE)
    expect(actions).toEqual([])
  })

  it('reset() while keys are held waits for release before re-arming', () => {
    const { m, actions } = setup()
    m.down(OPT)
    m.reset()
    m.up(OPT)
    m.down(OPT)
    expect(actions).toEqual(['start-hold', 'start-hold'])
  })
})
