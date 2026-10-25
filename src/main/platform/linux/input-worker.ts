// Runs in an Electron utility process: reads every keyboard under /dev/input and forwards
// key presses to the main process. Each blocking read holds a libuv thread-pool thread,
// so this lives in its own process (with a bigger pool) instead of starving the main one.
import { closeSync, openSync, read, readdirSync, readFileSync, watch } from 'node:fs'
import { evdevToUiohook, INPUT_EVENT_SIZE, isKeyboard, parseKeyEvents } from './evdev'
import type { FromInputWorker } from './input-protocol'

const port = process.parentPort
const INPUT_DIR = '/dev/input'
const isEventNode = (name: string): boolean => /^event\d+$/.test(name)

interface Device {
  fd: number
  /** uiohook keycodes held on this device, released if it disappears. */
  held: Set<number>
}

const devices = new Map<string, Device>()
const denied = new Set<string>()

const send = (msg: FromInputWorker): void => port.postMessage(msg)

function report(): void {
  send({ type: 'devices', reading: [...devices.keys()], denied: [...denied] })
}

function keyboardNode(name: string): boolean {
  try {
    return isKeyboard(readFileSync(`/sys/class/input/${name}/device/capabilities/key`, 'utf8'))
  } catch {
    return false
  }
}

function open(name: string): void {
  if (devices.has(name) || !keyboardNode(name)) return
  let fd: number
  try {
    fd = openSync(`${INPUT_DIR}/${name}`, 'r')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EACCES') denied.add(name)
    return
  }
  denied.delete(name)
  const device: Device = { fd, held: new Set() }
  devices.set(name, device)
  readLoop(name, device)
}

function readLoop(name: string, device: Device): void {
  const buf = Buffer.alloc(INPUT_EVENT_SIZE * 64)
  const next = (): void =>
    read(device.fd, buf, 0, buf.length, null, (err, bytes) => {
      if (err || bytes === 0) {
        close(name) // unplugged (ENODEV), or suspended away
        return
      }
      for (const { code, down } of parseKeyEvents(buf.subarray(0, bytes))) {
        const keycode = evdevToUiohook(code)
        if (down) device.held.add(keycode)
        else device.held.delete(keycode)
        send({ type: 'key', keycode, down })
      }
      next()
    })
  next()
}

function close(name: string): void {
  const device = devices.get(name)
  if (!device) return
  devices.delete(name)
  // A key held on a device that vanished would otherwise stay "pressed" forever.
  for (const keycode of device.held) send({ type: 'key', keycode, down: false })
  try {
    closeSync(device.fd)
  } catch {
    // already gone
  }
  report()
}

function scan(): void {
  const before = `${[...devices.keys()]}|${[...denied]}`
  try {
    for (const name of readdirSync(INPUT_DIR)) if (isEventNode(name)) open(name)
  } catch (err) {
    console.error('[input] cannot list', INPUT_DIR, err)
  }
  if (`${[...devices.keys()]}|${[...denied]}` !== before) report()
}

scan()
report()
// New keyboards (plugged in, or back after suspend). udev sets a node's permissions just
// after creating it, so look again a moment later as well.
watch(INPUT_DIR, (_event, file) => {
  if (!file || !isEventNode(String(file))) return
  setTimeout(scan, 100)
  setTimeout(scan, 1000)
})
// Catches anything the watcher missed, e.g. permissions that changed later.
setInterval(scan, 10_000)
