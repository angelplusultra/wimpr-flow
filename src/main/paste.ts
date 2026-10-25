import type { ClipboardOps } from './platform/types'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface PasteDeps {
  clipboard: ClipboardOps
  waitForKeysReleased: () => Promise<void>
  sendPasteShortcut: () => Promise<void>
}

/**
 * Put `text` on the clipboard, press the paste shortcut in the focused app, then put the
 * user's previous clipboard contents back (best-effort).
 */
export async function pasteText(text: string, restoreClipboard: boolean, deps: PasteDeps): Promise<void> {
  const { clipboard } = deps
  const restore = restoreClipboard ? await clipboard.snapshot().catch(() => null) : null
  await clipboard.writeText(text)
  // If modifiers from the hotkey are still physically down, ⌘V would arrive as e.g. ⌥⌘V.
  await deps.waitForKeysReleased()
  await deps.sendPasteShortcut()
  if (restore) {
    // Give the target app time to read the clipboard before we swap it back.
    await sleep(250)
    // Don't clobber something the user copied in the meantime.
    if ((await clipboard.readText()) === text) await restore()
  }
}
