import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Move settings and downloaded models from the folder the app used under its old name.
 * Electron creates the new folder before any app code runs, so "does it exist" can't tell
 * a first launch apart; a missing settings.json can. Leftover Chromium caches in the old
 * folder are deleted. Returns whether anything was migrated.
 */
export function migrateLegacyData(legacyDir: string, currentDir: string): boolean {
  if (!existsSync(join(legacyDir, 'settings.json')) || existsSync(join(currentDir, 'settings.json'))) return false
  mkdirSync(join(currentDir, 'models'), { recursive: true })
  renameSync(join(legacyDir, 'settings.json'), join(currentDir, 'settings.json'))
  const legacyModels = join(legacyDir, 'models')
  if (existsSync(legacyModels)) {
    for (const file of readdirSync(legacyModels)) {
      const dest = join(currentDir, 'models', file)
      if (!existsSync(dest) && !file.endsWith('.part')) renameSync(join(legacyModels, file), dest)
    }
  }
  rmSync(legacyDir, { recursive: true, force: true })
  return true
}
