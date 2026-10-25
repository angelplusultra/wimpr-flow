import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseDesktopEntry } from './hyprland'

function applicationDirs(): string[] {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local/share')
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)
  return [dataHome, ...dataDirs, join(homedir(), '.local/share/flatpak/exports/share'), '/var/lib/flatpak/exports/share'].map(
    (d) => join(d, 'applications')
  )
}

let cache: { at: number; names: Promise<Map<string, string>> } | null = null

/**
 * App display names by lower-cased desktop id ("org.gnome.Nautilus") and StartupWMClass,
 * which is how window classes map to them. Earlier directories win, as in the spec.
 */
export function desktopNames(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.names
  const names = (async () => {
    const out = new Map<string, string>()
    for (const dir of applicationDirs()) {
      let files: string[]
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith('.desktop'))
      } catch {
        continue
      }
      for (const file of files) {
        const entry = parseDesktopEntry(await readFile(join(dir, file), 'utf8').catch(() => ''))
        if (!entry) continue
        const id = file.slice(0, -'.desktop'.length).toLowerCase()
        if (!out.has(id)) out.set(id, entry.name)
        const wm = entry.wmClass?.toLowerCase()
        if (wm && !out.has(wm)) out.set(wm, entry.name)
      }
    }
    return out
  })()
  cache = { at: Date.now(), names }
  return names
}
