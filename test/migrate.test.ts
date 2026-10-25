import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyData } from '../src/main/migrate'

describe('migrateLegacyData', () => {
  let root: string, legacy: string, current: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wimpr-migrate-'))
    legacy = join(root, 'open-wispr')
    current = join(root, 'Wimpr Flow')
    mkdirSync(join(legacy, 'models'), { recursive: true })
    writeFileSync(join(legacy, 'settings.json'), '{"settings":{"model":"granite"}}')
    writeFileSync(join(legacy, 'models', 'granite.gguf'), 'g')
    writeFileSync(join(legacy, 'models', 'half.gguf.part'), 'x')
    mkdirSync(join(legacy, 'Cache'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('moves settings and models into the folder Electron already created', () => {
    mkdirSync(join(current, 'Cache'), { recursive: true }) // what Electron makes before app code runs
    expect(migrateLegacyData(legacy, current)).toBe(true)
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toContain('granite')
    expect(existsSync(join(current, 'models', 'granite.gguf'))).toBe(true)
    expect(existsSync(join(current, 'models', 'half.gguf.part'))).toBe(false)
    expect(existsSync(legacy)).toBe(false)
  })

  it('leaves both alone once the new folder has settings', () => {
    mkdirSync(current, { recursive: true })
    writeFileSync(join(current, 'settings.json'), '{}')
    expect(migrateLegacyData(legacy, current)).toBe(false)
    expect(existsSync(join(legacy, 'models', 'granite.gguf'))).toBe(true)
  })

  it('does nothing without an old folder', () => {
    expect(migrateLegacyData(join(root, 'missing'), current)).toBe(false)
  })
})
