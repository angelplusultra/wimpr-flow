import { clipboard, ClipboardItem } from 'electron'
import type { ClipboardOps } from './types'

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

/** Electron's clipboard, used on macOS, Windows and X11. */
export const electronClipboard: ClipboardOps = {
  async snapshot() {
    const items = await snapshot()
    return () => restore(items)
  },
  writeText: async (text) => clipboard.writeText(text),
  readText: async () => clipboard.readText()
}
