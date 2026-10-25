import { describe, expect, it } from 'vitest'
import { targetFor } from '../src/main/cleaner'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types'

const slack = { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack' }
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })

describe('targetFor', () => {
  it('adds mention instructions in mention apps only', () => {
    expect(targetFor(settings(), slack).target?.mentions).toContain('@mention')
    expect(targetFor(settings(), { bundleId: 'com.apple.mail', name: 'Mail' }).target).toEqual({
      name: 'Mail',
      rules: undefined,
      mentions: undefined
    })
  })

  it('skips disabled mention apps and empty or disabled rules', () => {
    const s = settings({
      mentionApps: [{ ...slack, enabled: false }],
      appRules: [{ ...slack, instructions: '  ', enabled: true }]
    })
    expect(targetFor(s, slack)).toEqual({ target: { name: 'Slack', rules: undefined, mentions: undefined }, mentions: [], ruleApplied: false })
  })

  it('combines a rule with mentions', () => {
    const s = settings({
      appRules: [{ ...slack, instructions: 'All lowercase.', enabled: true }],
      people: [{ id: '1', name: 'Sean', aliases: [], handles: { [slack.bundleId]: '@sean.kelly' } }]
    })
    const t = targetFor(s, slack)
    expect(t.ruleApplied).toBe(true)
    expect(t.target?.rules).toBe('All lowercase.')
    expect(t.mentions).toEqual([{ name: 'Sean', aliases: [], handle: '@sean.kelly' }])
  })

  it('has nothing to add without an app', () => {
    expect(targetFor(settings(), null)).toEqual({ mentions: [], ruleApplied: false })
  })
})
