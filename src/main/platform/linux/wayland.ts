import { execFile, spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import type { ClipboardOps } from '../types'
import { pickSnapshotType, wtypePasteArgs } from './paste'

const run = promisify(execFile)

export function onPath(cmd: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => {
    try {
      accessSync(join(dir, cmd), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

/**
 * wl-copy forks a background process that serves the clipboard until something else is
 * copied. It inherits stdout/stderr, so those are ignored or this would never resolve.
 */
function wlCopy(data: Buffer | string, type: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('wl-copy', ['--type', type], { stdio: ['pipe', 'ignore', 'ignore'] })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`wl-copy exited with ${code}`))))
    child.stdin.end(data)
  })
}

async function wlPaste(args: string[]): Promise<Buffer> {
  const { stdout } = await run('wl-paste', ['--no-newline', ...args], {
    encoding: 'buffer',
    timeout: 2000,
    maxBuffer: 64 * 1024 * 1024
  })
  return stdout
}

/**
 * The Wayland clipboard through wl-clipboard. Electron can only set it while it has
 * keyboard focus, which a tray app dictating into another window never does.
 */
export const waylandClipboard: ClipboardOps = {
  async snapshot() {
    const types = (await wlPaste(['--list-types']).catch(() => Buffer.alloc(0))).toString('utf8').split('\n').filter(Boolean)
    if (types.length === 0) return () => run('wl-copy', ['--clear']).then(() => {})
    const type = pickSnapshotType(types)
    if (!type) return null
    const data = await wlPaste(['--type', type])
    return () => wlCopy(data, type)
  },
  writeText: (text) => wlCopy(text, 'text/plain;charset=utf-8'),
  readText: async () => (await wlPaste(['--type', 'text/plain']).catch(() => Buffer.alloc(0))).toString('utf8')
}

/** Ctrl+V (Ctrl+Shift+V in terminals) through the virtual-keyboard protocol. */
export async function wtypePaste(windowClass: string | null): Promise<void> {
  await run('wtype', wtypePasteArgs(windowClass), { timeout: 2000 })
}
