// Pure helpers for pasting on Linux.

/** Window classes of terminals, where Ctrl+V isn't paste but Ctrl+Shift+V is. Lower case. */
const TERMINALS = new Set([
  'kitty',
  'alacritty',
  'foot',
  'footclient',
  'com.mitchellh.ghostty',
  'ghostty',
  'org.wezfurlong.wezterm',
  'wezterm',
  'org.kde.konsole',
  'konsole',
  'org.gnome.terminal',
  'gnome-terminal-server',
  'org.gnome.ptyxis',
  'org.gnome.console',
  'kgx',
  'xterm',
  'urxvt',
  'st',
  'st-256color',
  'tilix',
  'com.gexperts.tilix',
  'terminator',
  'xfce4-terminal',
  'rio',
  'warp',
  'dev.warp.warp'
])

export function isTerminal(cls: string | null | undefined): boolean {
  return !!cls && TERMINALS.has(cls.toLowerCase())
}

/** `wtype` arguments that press the paste shortcut for an app with window class `cls`. */
export function wtypePasteArgs(cls: string | null | undefined): string[] {
  return isTerminal(cls)
    ? ['-M', 'ctrl', '-M', 'shift', '-k', 'v', '-m', 'shift', '-m', 'ctrl']
    : ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl']
}

/**
 * The one clipboard type worth saving before a paste (wl-copy can only offer one when
 * restoring): an image if there is one, otherwise text. Null for nothing restorable.
 */
export function pickSnapshotType(types: string[]): string | null {
  const image = types.find((t) => t === 'image/png') ?? types.find((t) => t.startsWith('image/'))
  if (image) return image
  return (
    types.find((t) => t === 'text/plain;charset=utf-8') ??
    types.find((t) => t === 'UTF8_STRING') ??
    types.find((t) => t.startsWith('text/plain')) ??
    types.find((t) => t.startsWith('text/')) ??
    null
  )
}

/** The package-manager command that installs `packages`, from /etc/os-release. */
export function installCommand(osRelease: string, packages: string[]): string {
  const field = (key: string): string[] =>
    (new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm').exec(osRelease)?.[1] ?? '').split(/\s+/).filter(Boolean)
  const ids = [...field('ID'), ...field('ID_LIKE')]
  const list = packages.join(' ')
  if (ids.some((id) => id === 'arch')) return `sudo pacman -S --needed ${list}`
  if (ids.some((id) => id === 'fedora' || id === 'rhel')) return `sudo dnf install ${list}`
  if (ids.some((id) => id === 'opensuse' || id.startsWith('opensuse') || id === 'suse')) return `sudo zypper install ${list}`
  if (ids.some((id) => id === 'debian' || id === 'ubuntu')) return `sudo apt install ${list}`
  if (ids.includes('nixos')) return `nix-env -iA ${packages.map((p) => `nixpkgs.${p}`).join(' ')}`
  return `Install: ${list}`
}

/** A freedesktop autostart entry that runs `exec` at login. */
export function autostartEntry(exec: string): string {
  const quoted = /[\s"'\\]/.test(exec) ? `"${exec.replace(/(["\\`$])/g, '\\$1')}"` : exec
  return ['[Desktop Entry]', 'Type=Application', 'Name=Wimpr Flow', `Exec=${quoted}`, 'X-GNOME-Autostart-enabled=true', ''].join(
    '\n'
  )
}
