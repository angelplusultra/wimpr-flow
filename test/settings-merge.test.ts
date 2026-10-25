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

describe('appRules', () => {
  it('starts empty', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {}).appRules).toEqual([])
  })

  it('replaces the list and drops malformed rules', () => {
    const rule = { bundleId: 'com.apple.mail', name: 'Mail', instructions: 'Formal.', enabled: true }
    const s = mergeSettings(DEFAULT_SETTINGS, { appRules: [rule, { bundleId: 'x' }, 'nope'] })
    expect(s.appRules).toEqual([rule])
  })

  it('keeps the defaults when the value is not a list', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { appRules: 'Slack' }).appRules).toEqual(DEFAULT_SETTINGS.appRules)
  })
})

describe('people and mention apps', () => {
  it('defaults to Slack, Discord and Teams with mentions for everyone', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, {})
    expect(s.mentionApps.map((a) => a.name)).toEqual(['Slack', 'Discord', 'Microsoft Teams'])
    expect(s.mentionOthers).toBe(true)
    expect(s.people).toEqual([])
  })

  it('keeps valid people and drops malformed ones', () => {
    const sean = { id: '1', name: 'Sean', aliases: ['Shawn'], handles: { 'com.tinyspeck.slackmacgap': '@sean.kelly' } }
    const s = mergeSettings(DEFAULT_SETTINGS, {
      people: [sean, { id: '2', name: 'X', aliases: 'nope', handles: {} }, { id: '3', name: 'Y', aliases: [], handles: { a: 1 } }]
    })
    expect(s.people).toEqual([sean])
  })
})
