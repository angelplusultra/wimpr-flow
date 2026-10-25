import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { ModelCapabilities } from '../../shared/types'
import type { FromWorker, ToWorker } from './protocol'
import type { RunOptions } from './run-options'

interface Waiter<T> {
  resolve: (value: T) => void
  reject: (err: Error) => void
}

/** transcribe.cpp's prebuilt package for this platform, as its loader picks it. */
const NATIVE_PACKAGE: Partial<Record<string, [string, string]>> = {
  'darwin-arm64': ['darwin-arm64-metal', 'libtranscribe.dylib'],
  'darwin-x64': ['darwin-x64-cpu', 'libtranscribe.dylib'],
  'linux-x64': ['linux-x64-cpu-vulkan', 'libtranscribe.so'],
  'linux-arm64': ['linux-arm64-cpu-vulkan', 'libtranscribe.so'],
  'win32-x64': ['win32-x64-cpu-vulkan', 'transcribe.dll']
}

/**
 * The prebuilt transcribe.cpp library is loaded with dlopen, which can't read inside
 * app.asar, so packaged builds point it at the unpacked copy.
 */
function workerEnv(): NodeJS.ProcessEnv {
  const native = NATIVE_PACKAGE[`${process.platform}-${process.arch}`]
  if (!app.isPackaged || !native) return process.env
  const [tuple, file] = native
  const lib = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@transcribe-cpp', tuple, file)
  return { ...process.env, TRANSCRIBE_LIBRARY: lib }
}

interface LoadResult {
  capabilities: ModelCapabilities
  loadMs: number
  device: string
}

/** Owns the transcription worker process and the model loaded in it. */
export class Engine {
  private worker: UtilityProcess | null = null
  private loadedPath: string | null = null
  private capabilities: ModelCapabilities | null = null
  private device = ''
  private loads: (Waiter<LoadResult> & { path: string })[] = []
  private pending = new Map<number, Waiter<{ text: string; ms: number }>>()
  private nextId = 1

  get loadedModelPath(): string | null {
    return this.loadedPath
  }

  /** Load `modelPath` unless it's already loaded (or loading). */
  load(modelPath: string): Promise<LoadResult> {
    if (this.loadedPath === modelPath && this.capabilities && this.loads.length === 0) {
      return Promise.resolve({ capabilities: this.capabilities, loadMs: 0, device: this.device })
    }
    const inFlight = this.loads.at(-1)
    if (inFlight?.path === modelPath) {
      return new Promise((resolve, reject) => this.loads.push({ path: modelPath, resolve, reject }))
    }
    return new Promise((resolve, reject) => {
      this.loads.push({ path: modelPath, resolve, reject })
      this.send({ type: 'load', modelPath })
    })
  }

  transcribe(pcm: Float32Array, options: RunOptions): Promise<{ text: string; ms: number }> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.send({ type: 'transcribe', id, pcm, options })
    })
  }

  stop(): void {
    this.worker?.kill()
    this.reset(new Error('Transcription engine stopped'))
  }

  private send(msg: ToWorker): void {
    this.ensureWorker().postMessage(msg)
  }

  private ensureWorker(): UtilityProcess {
    if (this.worker) return this.worker
    const worker = utilityProcess.fork(join(__dirname, 'worker.js'), [], {
      serviceName: 'Wimpr Flow transcription',
      env: workerEnv(),
      stdio: 'pipe'
    })
    worker.stdout?.on('data', (d: Buffer) => process.stdout.write(`[engine] ${d}`))
    worker.stderr?.on('data', (d: Buffer) => process.stderr.write(`[engine] ${d}`))
    worker.on('message', (msg: FromWorker) => this.onMessage(msg))
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      this.reset(new Error(`Transcription engine exited unexpectedly (code ${code})`))
    })
    this.worker = worker
    return worker
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'loaded':
      case 'load-error': {
        const waiters = this.takeLoadWaiters()
        if (msg.type === 'loaded') {
          this.loadedPath = waiters[0]?.path ?? null
          this.capabilities = msg.capabilities
          this.device = msg.device
          for (const w of waiters) w.resolve({ capabilities: msg.capabilities, loadMs: msg.loadMs, device: msg.device })
        } else {
          this.loadedPath = null
          this.capabilities = null
          for (const w of waiters) w.reject(new Error(msg.message))
        }
        return
      }
      case 'result':
      case 'error': {
        const waiter = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.type === 'result') waiter?.resolve({ text: msg.text, ms: msg.ms })
        else waiter?.reject(new Error(msg.message))
        return
      }
    }
  }

  /** The worker answers loads in order; the first answer covers every waiter for that path. */
  private takeLoadWaiters(): typeof this.loads {
    const first = this.loads[0]
    if (!first) return []
    let n = 0
    while (n < this.loads.length && this.loads[n].path === first.path) n++
    return this.loads.splice(0, n)
  }

  private reset(err: Error): void {
    this.loadedPath = null
    this.capabilities = null
    for (const w of this.loads.splice(0)) w.reject(err)
    for (const w of this.pending.values()) w.reject(err)
    this.pending.clear()
  }
}
