import type { Settings, SettingsPatch } from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merge `patch` onto `base`. Arrays and null replace wholesale; keys whose
 * type doesn't match the base are dropped, so a corrupt or outdated settings file
 * can't put the app in a bad state.
 */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  return mergeObject(base as unknown as Record<string, unknown>, patch) as unknown as Settings
}

function mergeObject(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  if (!isPlainObject(patch)) return out
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue
    const current = base[key]
    if (isPlainObject(current)) {
      out[key] = mergeObject(current, value)
    } else if (Array.isArray(current) || current === null) {
      // Hotkey bindings: number[] or null.
      if (value === null || (Array.isArray(value) && value.every((n) => typeof n === 'number'))) {
        out[key] = value
      }
    } else if (typeof value === typeof current) {
      out[key] = value
    }
  }
  return out
}

export function applyPatch(base: Settings, patch: SettingsPatch): Settings {
  return mergeSettings(base, patch)
}
