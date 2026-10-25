import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyPatch, mergeSettings } from '../shared/settings-merge'
import { defaultSettings, type Settings, type SettingsPatch } from '../shared/types'

type Listener = (settings: Settings, previous: Settings) => void

export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json')
  private settings: Settings
  private listeners: Listener[] = []

  constructor() {
    this.settings = this.load()
  }

  get(): Settings {
    return this.settings
  }

  update(patch: SettingsPatch): Settings {
    const previous = this.settings
    this.settings = applyPatch(this.settings, patch)
    this.save()
    for (const l of this.listeners) l(this.settings, previous)
    return this.settings
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener)
  }

  private load(): Settings {
    try {
      if (existsSync(this.file)) {
        // Unknown keys (e.g. from older versions) are dropped by mergeSettings.
        return mergeSettings(defaultSettings(process.platform), JSON.parse(readFileSync(this.file, 'utf8')).settings)
      }
    } catch (err) {
      console.error('[settings] failed to read, using defaults:', err)
    }
    return defaultSettings(process.platform)
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ settings: this.settings }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
