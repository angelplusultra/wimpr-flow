import { describe, expect, it } from 'vitest'
import { autostartEntry, installCommand, isTerminal, pickSnapshotType, wtypePasteArgs } from '../src/main/platform/linux/paste'

describe('paste shortcut', () => {
  it('uses Ctrl+Shift+V in terminals', () => {
    expect(isTerminal('kitty')).toBe(true)
    expect(isTerminal('Alacritty')).toBe(true)
    expect(isTerminal('com.mitchellh.ghostty')).toBe(true)
    expect(wtypePasteArgs('foot')).toEqual(['-M', 'ctrl', '-M', 'shift', '-k', 'v', '-m', 'shift', '-m', 'ctrl'])
  })

  it('uses Ctrl+V everywhere else, including when the app is unknown', () => {
    expect(isTerminal('firefox')).toBe(false)
    expect(wtypePasteArgs('Slack')).toEqual(['-M', 'ctrl', '-k', 'v', '-m', 'ctrl'])
    expect(wtypePasteArgs(null)).toEqual(['-M', 'ctrl', '-k', 'v', '-m', 'ctrl'])
  })
})

describe('pickSnapshotType', () => {
  it('prefers an image, then UTF-8 text', () => {
    expect(pickSnapshotType(['text/html', 'image/png', 'text/plain'])).toBe('image/png')
    expect(pickSnapshotType(['TEXT', 'text/plain', 'text/plain;charset=utf-8'])).toBe('text/plain;charset=utf-8')
    expect(pickSnapshotType(['UTF8_STRING', 'STRING'])).toBe('UTF8_STRING')
    expect(pickSnapshotType(['text/uri-list'])).toBe('text/uri-list')
    expect(pickSnapshotType(['application/x-custom'])).toBeNull()
  })
})

describe('installCommand', () => {
  const pkgs = ['wl-clipboard', 'wtype']
  it('picks the package manager from os-release', () => {
    expect(installCommand('NAME="Arch Linux"\nID=arch\n', pkgs)).toBe('sudo pacman -S --needed wl-clipboard wtype')
    expect(installCommand('ID=endeavouros\nID_LIKE=arch\n', pkgs)).toBe('sudo pacman -S --needed wl-clipboard wtype')
    expect(installCommand('ID=cachyos\nID_LIKE="arch"\n', pkgs)).toBe('sudo pacman -S --needed wl-clipboard wtype')
    expect(installCommand('ID=ubuntu\nID_LIKE=debian\n', pkgs)).toBe('sudo apt install wl-clipboard wtype')
    expect(installCommand('ID=fedora\n', pkgs)).toBe('sudo dnf install wl-clipboard wtype')
    expect(installCommand('', pkgs)).toBe('Install: wl-clipboard wtype')
  })
})

describe('autostartEntry', () => {
  it('quotes paths with spaces', () => {
    expect(autostartEntry('/opt/Wimpr Flow/wimpr-flow')).toContain('Exec="/opt/Wimpr Flow/wimpr-flow"\n')
    expect(autostartEntry('wimpr-flow')).toContain('Exec=wimpr-flow\n')
  })
})
