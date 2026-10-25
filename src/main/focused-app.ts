import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppInfo } from '../shared/types'

const run = promisify(execFile)

/** Parses `lsappinfo info -only bundleid -only name <asn>`. */
export function parseAppInfo(out: string): AppInfo | null {
  const bundleId = /"CFBundleIdentifier"="([^"]+)"/.exec(out)?.[1]
  const name = /"LSDisplayName"="([^"]+)"/.exec(out)?.[1]
  return bundleId ? { bundleId, name: name ?? bundleId } : null
}

/** Parses `lsappinfo list`, keeping regular (Dock) apps, sorted by name. */
export function parseAppList(out: string): AppInfo[] {
  const apps = new Map<string, AppInfo>()
  for (const block of out.split(/\n(?=\s*\d+\) ")/)) {
    const name = /^\s*\d+\) "([^"]+)"/.exec(block)?.[1]
    const bundleId = /bundleID="([^"]+)"/.exec(block)?.[1]
    if (name && bundleId && block.includes('type="Foreground"')) apps.set(bundleId, { bundleId, name })
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// lsappinfo ships with macOS and needs no permissions; a lookup takes ~10 ms.

/** The app in front, i.e. the one dictated text will be pasted into. */
export async function frontmostApp(): Promise<AppInfo | null> {
  if (process.platform !== 'darwin') return null
  try {
    const { stdout: asn } = await run('lsappinfo', ['front'], { timeout: 1000 })
    const { stdout } = await run('lsappinfo', ['info', '-only', 'bundleid', '-only', 'name', asn.trim()], {
      timeout: 1000
    })
    return parseAppInfo(stdout)
  } catch {
    return null
  }
}

export async function runningApps(): Promise<AppInfo[]> {
  if (process.platform !== 'darwin') return []
  try {
    const { stdout } = await run('lsappinfo', ['list'], { timeout: 2000, maxBuffer: 8 * 1024 * 1024 })
    return parseAppList(stdout)
  } catch {
    return []
  }
}
