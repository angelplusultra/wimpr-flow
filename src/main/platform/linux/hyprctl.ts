import { execFile } from 'node:child_process'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { hyprlangRule, luaRule, parseEventName, windowPlacement, type WindowRule } from './hyprland'

const run = promisify(execFile)

export const isHyprland = (): boolean => !!process.env.HYPRLAND_INSTANCE_SIGNATURE

export async function hyprctl(args: string[], timeout = 1000): Promise<string> {
  const { stdout } = await run('hyprctl', args, { timeout, maxBuffer: 8 * 1024 * 1024 })
  return stdout.trim()
}

export type RuleSyntax = 'lua' | 'hyprlang'

/**
 * Installs window rules at runtime, without touching the user's config: through `hyprctl
 * eval` on Lua configs (Hyprland 0.55+), else `hyprctl keyword` (hyprlang, 0.53–0.54).
 * A config reload drops runtime rules, so they're applied again on every reload.
 */
export class HyprlandRules {
  private syntax: RuleSyntax | null = null
  private applying: Promise<RuleSyntax | null> | null = null
  private events: Socket | null = null

  constructor(private readonly rules: WindowRule[]) {}

  /** The syntax that worked, or null if neither did. */
  get appliedWith(): RuleSyntax | null {
    return this.syntax
  }

  apply(): Promise<RuleSyntax | null> {
    this.applying ??= this.tryApply().finally(() => (this.applying = null))
    return this.applying
  }

  /** The rules as config lines, for pasting by hand when applying them failed. */
  snippet(): string {
    return this.syntax === 'hyprlang' || !this.syntax
      ? [
          '# hyprland.lua (Hyprland 0.55+)',
          ...this.rules.map(luaRule),
          '',
          '# hyprland.conf (0.53–0.54)',
          ...this.rules.map((r) => `windowrule = ${hyprlangRule(r)}`)
        ].join('\n')
      : this.rules.map(luaRule).join('\n')
  }

  watchReloads(): void {
    const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE
    const runtime = process.env.XDG_RUNTIME_DIR
    if (!sig || !runtime || this.events) return
    const socket = connect(join(runtime, 'hypr', sig, '.socket2.sock'))
    let buffered = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffered += chunk
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      if (lines.some((l) => parseEventName(l) === 'configreloaded')) void this.apply()
    })
    socket.on('error', (err) => console.error('[hyprland] event socket:', err.message))
    socket.on('close', () => {
      this.events = null
      setTimeout(() => this.watchReloads(), 5000)
    })
    this.events = socket
  }

  private async tryApply(): Promise<RuleSyntax | null> {
    if (await this.applyEach((r) => ['eval', luaRule(r)])) return (this.syntax = 'lua')
    if (await this.applyEach((r) => ['keyword', 'windowrule', hyprlangRule(r)])) return (this.syntax = 'hyprlang')
    console.error('[hyprland] could not add window rules; the overlay may tile and take focus')
    return (this.syntax = null)
  }

  private async applyEach(args: (rule: WindowRule) => string[]): Promise<boolean> {
    for (const rule of this.rules) {
      try {
        const out = await hyprctl(args(rule))
        if (out !== 'ok') return false
      } catch {
        return false
      }
    }
    return true
  }
}

/** Floating and pinned, as the overlay rule asks? Null if Hyprland doesn't list it. */
export async function checkPlacement(title: string): Promise<{ floating: boolean; pinned: boolean } | null> {
  try {
    return windowPlacement(await hyprctl(['-j', 'clients']), title)
  } catch {
    return null
  }
}
