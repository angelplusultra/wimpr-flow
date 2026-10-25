import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { ModelCapabilities } from '../../shared/types'
import type { FromWorker, ToWorker } from './protocol'
import type { RunOptions } from './run-options'

interface Waiter<T> {
  resolve: (value: T) => void
  reject: (err: Error) => void
}

/**
 * The prebuilt transcribe.cpp library is loaded with dlopen, which can't read inside
 * app.asar, so packaged builds point it at the unpacked copy.
 */
function workerEnv(): NodeJS.ProcessEnv {
  if (!app.isPackaged) return process.env
  const lib = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@transcribe-cpp',
    'darwin-arm64-metal',
    'libtranscribe.dylib'
  )
  return { ...process.env, TRANSCRIBE_LIBRARY: lib }
}

/** Owns the transcription worker process and the model loaded in it. */
export class Engine {
  private worker: UtilityProcess | null = null
  private loadedPath: string | null = null
  private capabilities: ModelCapabilities | null = null
  private loads: (Waiter<{ capabilities: ModelCapabilities; loadMs: number }> & { path: string })[] = []
  private pending = new Map<number, Waiter<{ text: string; ms: number }>>()
  private nextId = 1

  get loadedModelPath(): string | null {
    return this.loadedPath
  }

  /** Load `modelPath` unless it's already loaded (or loading). */
  load(modelPath: string): Promise<{ capabilities: ModelCapabilities; loadMs: number }> {
    if (this.loadedPath === modelPath && this.capabilities && this.loads.length === 0) {
      return Promise.resolve({ capabilities: this.capabilities, loadMs: 0 })
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
      serviceName: 'Fuck Wispr Flow transcription',
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
          for (const w of waiters) w.resolve({ capabilities: msg.capabilities, loadMs: msg.loadMs })
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
