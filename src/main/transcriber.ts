import { cleanTranscript } from '../shared/transcript'
import type { EngineStatus, ModelProgress, Settings } from '../shared/types'
import type { Engine } from './engine'
import { dictionaryTerms, runOptions } from './engine/run-options'
import { findModel, type ModelManager } from './models'

export interface TranscriberDeps {
  engine: Engine
  models: ModelManager
  getSettings: () => Settings
  onStatus: (status: EngineStatus) => void
  onDownloadProgress: (p: ModelProgress) => void
}

/** Keeps the selected model downloaded and loaded, and runs dictations through it. */
export class Transcriber {
  private _status: EngineStatus

  constructor(private readonly deps: TranscriberDeps) {
    this._status = { state: 'idle', modelId: deps.getSettings().model }
  }

  get status(): EngineStatus {
    return this._status
  }

  /**
   * Make the selected model ready: download it if this is the first run, then load it.
   * Safe to call repeatedly (e.g. on every settings change).
   */
  async prepare(): Promise<void> {
    const { model: id } = this.deps.getSettings()
    const path = this.deps.models.pathFor(id)
    if (!path) {
      this.setStatus({ state: 'error', modelId: id, message: `Unknown model “${id}”` })
      return
    }
    if (!this.deps.models.isDownloaded(id)) {
      await this.download(id).catch(() => {})
      return // download() calls prepare() again when it finishes
    }
    if (this.deps.engine.loadedModelPath === path && this._status.state === 'ready') return

    this.setStatus({ state: 'loading', modelId: id, last: undefined })
    try {
      const { capabilities, device } = await this.deps.engine.load(path)
      if (this.deps.getSettings().model !== id) return // switched again meanwhile
      this.setStatus({ state: 'ready', modelId: id, capabilities, device })
    } catch (err) {
      if (this.deps.getSettings().model !== id) return
      this.setStatus({ state: 'error', modelId: id, message: `Couldn't load model: ${(err as Error).message}` })
    }
  }

  async download(id: string): Promise<void> {
    const isSelected = (): boolean => this.deps.getSettings().model === id
    if (isSelected()) this.setStatus({ state: 'downloading', modelId: id })
    try {
      await this.deps.models.download(id, (p) => {
        this.deps.onDownloadProgress(p)
        if (isSelected() && !p.done && !p.error) {
          const pct = p.total ? Math.floor((p.received / p.total) * 100) : 0
          this.setStatus({ state: 'downloading', modelId: id, message: `${pct}%` })
        }
      })
    } catch (err) {
      if (isSelected()) this.setStatus({ state: 'error', modelId: id, message: `Download failed: ${(err as Error).message}` })
      throw err
    }
    if (isSelected()) await this.prepare()
  }

  async transcribe(pcm: Float32Array, audioMs: number): Promise<string> {
    const settings = this.deps.getSettings()
    const name = findModel(settings.model)?.name ?? settings.model
    if (this._status.state === 'downloading') {
      throw new Error(`${name} is still downloading (${this._status.message ?? '…'})`)
    }
    if (this._status.state !== 'ready' || this.deps.engine.loadedModelPath !== this.deps.models.pathFor(settings.model)) {
      await this.prepare()
    }
    const { capabilities } = this._status
    if (this._status.state !== 'ready' || !capabilities) {
      throw new Error(this._status.message ?? `${name} isn't ready`)
    }
    const { text, ms } = await this.deps.engine.transcribe(
      pcm,
      runOptions(capabilities, settings.language, dictionaryTerms(settings))
    )
    this.setStatus({ ...this._status, last: { audioMs: Math.round(audioMs), transcribeMs: ms } })
    return cleanTranscript(text)
  }

  private setStatus(status: EngineStatus): void {
    this._status = status
    this.deps.onStatus(status)
  }
}
