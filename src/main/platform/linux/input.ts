import { utilityProcess, type UtilityProcess } from 'electron'
import { accessSync, constants, readdirSync, readFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import type { KeyHook } from '../types'
import { groupEntry, isKeyboard } from './evdev'
import type { FromInputWorker } from './input-protocol'

/** Keyboards under /dev/input, and whether each can be read. */
export function keyboardAccess(): { keyboards: number; readable: number } {
  let keyboards = 0
  let readable = 0
  let names: string[] = []
  try {
    names = readdirSync('/dev/input').filter((n) => /^event\d+$/.test(n))
  } catch {
    return { keyboards, readable }
  }
  for (const name of names) {
    try {
      if (!isKeyboard(readFileSync(`/sys/class/input/${name}/device/capabilities/key`, 'utf8'))) continue
    } catch {
      continue
    }
    keyboards++
    try {
      accessSync(`/dev/input/${name}`, constants.R_OK)
      readable++
    } catch {
      // not allowed
    }
  }
  return { keyboards, readable }
}

/** True when the user was added to `input` but this login session predates it. */
export function inputGroupPendingRelogin(): boolean {
  try {
    const entry = groupEntry(readFileSync('/etc/group', 'utf8'), 'input')
    if (!entry) return false
    return entry.members.includes(userInfo().username) && !process.getgroups?.().includes(entry.gid)
  } catch {
    return false
  }
}

/** Reads keyboards directly through the input worker; works on Wayland and X11 alike. */
export function evdevKeyHook(): KeyHook {
  let worker: UtilityProcess | null = null
  let listener: (keycode: number, down: boolean) => void = () => {}
  let running = false
  /** Held keys, released if the worker dies so none stays "pressed". */
  const held = new Set<number>()
  const emit = (keycode: number, down: boolean): void => {
    if (down) held.add(keycode)
    else held.delete(keycode)
    listener(keycode, down)
  }
  const releaseAll = (): void => {
    for (const keycode of [...held]) emit(keycode, false)
  }

  const fork = (): void => {
    const child = utilityProcess.fork(join(__dirname, 'input-worker.js'), [], {
      serviceName: 'Wimpr Flow keyboard',
      env: { ...process.env, UV_THREADPOOL_SIZE: '16' },
      stdio: 'pipe'
    })
    child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[input] ${d}`))
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[input] ${d}`))
    child.on('message', (msg: FromInputWorker) => {
      if (msg.type === 'key') emit(msg.keycode, msg.down)
      else console.log(`[input] reading ${msg.reading.length} keyboard(s)${msg.denied.length ? `, ${msg.denied.length} not permitted` : ''}`)
    })
    child.on('exit', (code) => {
      if (worker !== child) return
      worker = null
      releaseAll()
      if (running) {
        console.error(`[input] worker exited (code ${code}); restarting`)
        setTimeout(() => running && !worker && fork(), 1000)
      }
    })
    worker = child
  }

  return {
    start() {
      if (keyboardAccess().readable === 0) throw new Error('No readable keyboard under /dev/input')
      running = true
      if (!worker) fork()
    },
    stop() {
      running = false
      worker?.kill()
      worker = null
      releaseAll()
    },
    onKey(cb) {
      listener = cb
    }
  }
}
