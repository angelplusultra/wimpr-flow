import type { KeyHook } from './types'

type Uiohook = typeof import('uiohook-napi')

let loaded: Promise<Uiohook> | null = null

/**
 * uiohook is loaded on first use so Wayland, where it can't see keys and its X11
 * dependencies may be missing, never loads it.
 */
export function loadUiohook(): Promise<Uiohook> {
  loaded ??= import('uiohook-napi')
  return loaded
}

export async function uiohookKeyHook(): Promise<KeyHook> {
  const { uIOhook } = await loadUiohook()
  return {
    start: () => uIOhook.start(),
    stop: () => uIOhook.stop(),
    onKey: (cb) => {
      uIOhook.on('keydown', (e) => cb(e.keycode, true))
      uIOhook.on('keyup', (e) => cb(e.keycode, false))
    }
  }
}

/** Tap `key` with `modifiers` held, e.g. V with Meta for ⌘V. */
export async function keyTap(key: number, modifiers: number[]): Promise<void> {
  const { uIOhook } = await loadUiohook()
  uIOhook.keyTap(key, modifiers)
}
