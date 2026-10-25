import { describe, expect, it } from 'vitest'
import { parseAppInfo, parseAppList } from '../src/main/focused-app'

describe('parseAppInfo', () => {
  it('reads the bundle id and display name', () => {
    expect(parseAppInfo('"CFBundleIdentifier"="com.tinyspeck.slackmacgap"\n"LSDisplayName"="Slack"\n')).toEqual({
      bundleId: 'com.tinyspeck.slackmacgap',
      name: 'Slack'
    })
  })

  it('returns null without a bundle id', () => {
    expect(parseAppInfo('')).toBeNull()
  })
})

describe('parseAppList', () => {
  it('keeps regular apps only, sorted by name', () => {
    const out = ` 1) "loginwindow" ASN:0x0-0x3003:
    bundleID="com.apple.loginwindow"
    pid = 409 type="UIElement" flavor=3
 2) "Slack" ASN:0x0-0x5005:
    bundleID="com.tinyspeck.slackmacgap"
    pid = 551 type="Foreground" flavor=3
 3) "universalaccessd" ASN:0x0-0x8008:
    bundleID=[ NULL ]
    pid = 612 type="Foreground" flavor=3
 4) "Ghostty" ASN:0x0-0x9009:
    bundleID="com.mitchellh.ghostty"
    pid = 610 type="Foreground" flavor=3`
    expect(parseAppList(out)).toEqual([
      { bundleId: 'com.mitchellh.ghostty', name: 'Ghostty' },
      { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack' }
    ])
  })
})
