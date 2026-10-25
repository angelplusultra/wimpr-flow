import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import type { AppInfo } from '../../../shared/types'

const run = promisify(execFile)

/** App id on Windows: the lower-case executable name, e.g. "slack.exe". */
export const exeId = (path: string): string => basename(path.replace(/\\/g, '/')).toLowerCase()

/** "slack.exe" → "Slack", used until the real description is known. */
export function exeFallbackName(path: string): string {
  const stem = basename(path.replace(/\\/g, '/')).replace(/\.exe$/i, '')
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

/** Parses `ConvertTo-Json` output of `[{ Path, Description }]` (a lone object when there's one). */
export function parseDescriptions(json: string): Map<string, string> {
  const out = new Map<string, string>()
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return out
  }
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    const { Path: path, Description: description } = (item ?? {}) as { Path?: unknown; Description?: unknown }
    if (typeof path === 'string' && typeof description === 'string' && description.trim()) {
      out.set(path.toLowerCase(), description.trim())
    }
  }
  return out
}

const descriptions = new Map<string, string>()

/** File descriptions ("Slack", "Microsoft Teams") for `paths`, from one PowerShell call, cached. */
export async function describe(paths: string[]): Promise<void> {
  const missing = paths.filter((p) => !descriptions.has(p.toLowerCase()))
  if (!missing.length) return
  const list = missing.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
  const script = `@(${list}) | ForEach-Object { [pscustomobject]@{ Path = $_; Description = (Get-Item -LiteralPath $_).VersionInfo.FileDescription } } | ConvertTo-Json -Compress`
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 5000,
      windowsHide: true
    })
    for (const [path, description] of parseDescriptions(stdout)) descriptions.set(path, description)
  } catch {
    // Fall back to names derived from the exe.
  }
  for (const p of missing) if (!descriptions.has(p.toLowerCase())) descriptions.set(p.toLowerCase(), exeFallbackName(p))
}

export function appInfo(path: string): AppInfo {
  return { bundleId: exeId(path), name: descriptions.get(path.toLowerCase()) ?? exeFallbackName(path) }
}
