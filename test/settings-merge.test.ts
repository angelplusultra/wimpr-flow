import { describe, expect, it } from 'vitest'
import { mergeSettings } from '../src/shared/settings-merge'
import { DEFAULT_SETTINGS } from '../src/shared/types'

describe('mergeSettings', () => {
  it('fills in missing keys from defaults', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { language: 'es', hotkeys: { toggle: [63] } })
    expect(s.language).toBe('es')
    expect(s.model).toBe(DEFAULT_SETTINGS.model)
    expect(s.hotkeys.toggle).toEqual([63])
    expect(s.hotkeys.hold).toEqual(DEFAULT_SETTINGS.hotkeys.hold)
  })

  it('drops wrongly typed and unknown values', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { sounds: 'yes', bogus: 1, hotkeys: { hold: ['x'] } })
    expect(s.sounds).toBe(DEFAULT_SETTINGS.sounds)
    expect(s).not.toHaveProperty('bogus')
    expect(s.hotkeys.hold).toEqual(DEFAULT_SETTINGS.hotkeys.hold)
  })

  it('ignores settings from older versions (cloud providers)', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, {
      provider: 'openai-compatible',
      openai: { preset: 'groq' },
      whisperCpp: { model: 'base.en' },
      vocabulary: 'Supabase'
    })
    expect(s).not.toHaveProperty('provider')
    expect(s).not.toHaveProperty('openai')
    expect(s).not.toHaveProperty('whisperCpp')
    expect(s.vocabulary).toBe('Supabase')
  })

  it('allows disabling and re-enabling hotkeys', () => {
    const disabled = mergeSettings(DEFAULT_SETTINGS, { hotkeys: { toggle: null } })
    expect(disabled.hotkeys.toggle).toBeNull()
    expect(disabled.hotkeys.hold).toEqual(DEFAULT_SETTINGS.hotkeys.hold)
    const enabled = mergeSettings(disabled, { hotkeys: { toggle: [63] } })
    expect(enabled.hotkeys.toggle).toEqual([63])
  })

  it('tolerates garbage input', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings(DEFAULT_SETTINGS, 'nope')).toEqual(DEFAULT_SETTINGS)
  })
})
