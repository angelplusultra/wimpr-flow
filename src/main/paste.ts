import { clipboard, ClipboardItem } from 'electron'

type Payload = Blob | Electron.ClipboardBookmark

/** Copy every type of every clipboard item, so it can be written back verbatim. */
async function snapshot(): Promise<ClipboardItem[]> {
  const items = await clipboard.read()
  return Promise.all(
    items.map(async (item) => {
      const entries = await Promise.all(
        item.types.map(async (type): Promise<[string, Payload | null]> => [
          type,
          await item.getType(type).catch(() => null)
        ])
      )
      return new ClipboardItem(Object.fromEntries(entries.filter((e): e is [string, Payload] => e[1] !== null)))
    })
  )
}

async function restore(items: ClipboardItem[]): Promise<void> {
  if (items.length === 0) clipboard.clear()
  else await clipboard.write(items)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface PasteDeps {
  waitForKeysReleased: () => Promise<void>
  sendPasteShortcut: () => void
}

/**
 * Put `text` on the clipboard, press ⌘V in the focused app, then put the user's
 * previous clipboard contents back (best-effort).
 */
export async function pasteText(text: string, restoreClipboard: boolean, deps: PasteDeps): Promise<void> {
  const previous = restoreClipboard ? await snapshot().catch(() => null) : null
  await clipboard.writeText(text)
  // If modifiers from the hotkey are still physically down, ⌘V would arrive as e.g. ⌥⌘V.
  await deps.waitForKeysReleased()
  deps.sendPasteShortcut()
  if (previous) {
    // Give the target app time to read the clipboard before we swap it back.
    await sleep(250)
    // Don't clobber something the user copied in the meantime.
    if ((await clipboard.readText()) === text) await restore(previous)
  }
}
