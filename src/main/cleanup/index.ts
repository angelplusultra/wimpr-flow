import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { TargetApp } from './prompt'
import type { FromCleanupWorker, ToCleanupWorker } from './protocol'

interface Waiter<T> {
  resolve: (value: T) => void
  reject: (err: Error) => void
}

/** Owns the cleanup worker process and the LLM loaded in it. */
export class CleanupEngine {
  private worker: UtilityProcess | null = null
  private loadedPath: string | null = null
  private loading: (Waiter<{ device: string }> & { path: string }) | null = null
  private pending = new Map<number, Waiter<{ text: string; ms: number }>>()
  private nextId = 1

  get loadedModelPath(): string | null {
    return this.loadedPath
  }

  private device = ''

  load(modelPath: string): Promise<{ device: string }> {
    if (this.loadedPath === modelPath && !this.loading) return Promise.resolve({ device: this.device })
    if (this.loading) return Promise.reject(new Error('Cleanup model is already loading'))
    return new Promise((resolve, reject) => {
      this.loading = { path: modelPath, resolve, reject }
      this.send({ type: 'load', modelPath })
    })
  }

  /** Resolves with null if it took longer than `timeoutMs`; generation is then cancelled. */
  clean(
    text: string,
    vocabulary: string[],
    timeoutMs: number,
    app?: TargetApp
  ): Promise<{ text: string; ms: number } | null> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.send({ type: 'cancel', id })
        resolve(null)
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer)
          resolve(r)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      })
      this.send({ type: 'clean', id, text, vocabulary, app })
    })
  }

  /** Resolves once the worker has exited. */
  stop(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.reset(new Error('Cleanup engine stopped'))
    if (!worker) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => worker.kill(), 3000)
      worker.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      worker.postMessage({ type: 'dispose' } satisfies ToCleanupWorker)
    })
  }

  private send(msg: ToCleanupWorker): void {
    this.ensureWorker().postMessage(msg)
  }

  private ensureWorker(): UtilityProcess {
    if (this.worker) return this.worker
    const worker = utilityProcess.fork(join(__dirname, 'cleanup-worker.js'), [], {
      serviceName: 'Wimpr Flow cleanup',
      stdio: 'pipe'
    })
    worker.stdout?.on('data', (d: Buffer) => process.stdout.write(`[cleanup] ${d}`))
    worker.stderr?.on('data', (d: Buffer) => process.stderr.write(`[cleanup] ${d}`))
    worker.on('message', (msg: FromCleanupWorker) => this.onMessage(msg))
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      this.reset(new Error(`Cleanup engine exited unexpectedly (code ${code})`))
    })
    this.worker = worker
    return worker
  }

  private onMessage(msg: FromCleanupWorker): void {
    switch (msg.type) {
      case 'loaded':
      case 'load-error': {
        const waiter = this.loading
        this.loading = null
        this.loadedPath = msg.type === 'loaded' ? (waiter?.path ?? null) : null
        if (msg.type === 'loaded') {
          this.device = msg.device
          waiter?.resolve({ device: msg.device })
        }
        else waiter?.reject(new Error(msg.message))
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

  private reset(err: Error): void {
    this.loadedPath = null
    this.loading?.reject(err)
    this.loading = null
    for (const w of this.pending.values()) w.reject(err)
    this.pending.clear()
  }
}
