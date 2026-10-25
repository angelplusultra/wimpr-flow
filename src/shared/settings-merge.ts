import type { AppRule, MentionApp, Person, Settings, SettingsPatch } from './types'

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

function isAppRule(v: unknown): v is AppRule {
  return (
    isPlainObject(v) &&
    typeof v.bundleId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.instructions === 'string' &&
    typeof v.enabled === 'boolean'
  )
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

function isPerson(v: unknown): v is Person {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isStringArray(v.aliases) &&
    isPlainObject(v.handles) &&
    Object.values(v.handles).every((h) => typeof h === 'string')
  )
}

function isMentionApp(v: unknown): v is MentionApp {
  return isPlainObject(v) && typeof v.bundleId === 'string' && typeof v.name === 'string' && typeof v.enabled === 'boolean'
}

/** Lists of records: replaced wholesale, malformed entries dropped. */
const RECORD_LISTS: Record<string, (v: unknown) => boolean> = {
  appRules: isAppRule,
  people: isPerson,
  mentionApps: isMentionApp
}

function mergeObject(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  if (!isPlainObject(patch)) return out
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue
    const current = base[key]
    if (key in RECORD_LISTS) {
      if (Array.isArray(value)) out[key] = value.filter(RECORD_LISTS[key])
    } else if (isPlainObject(current)) {
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
