import type { AppInfo, CleanupStatus, ModelProgress, Settings } from '../shared/types'
import type { CleanupEngine } from './cleanup'
import {
  acceptCleanup,
  cleanupTimeoutMs,
  mentionInstructions,
  mentionsFor,
  tidyOutput,
  type Mention,
  type TargetApp
} from './cleanup/prompt'
import { vocabularyTerms } from './engine/run-options'
import { CLEANUP_MODEL, type ModelManager } from './models'

/** What the prompt says about the app being dictated into: its rule and its mentions. */
export function targetFor(
  settings: Settings,
  app: AppInfo | null | undefined
): { target?: TargetApp; mentions: Mention[]; ruleApplied: boolean } {
  if (!app) return { mentions: [], ruleApplied: false }
  const rule = settings.appRules.find((r) => r.enabled && r.bundleId === app.bundleId && r.instructions.trim())
  const mentionApp = settings.mentionApps.some((a) => a.enabled && a.bundleId === app.bundleId)
  const mentions = mentionApp ? mentionsFor(settings.people, app.bundleId) : []
  const instructions = mentionApp ? mentionInstructions(mentions, settings.mentionOthers) : ''
  return {
    target: { name: app.name, rules: rule?.instructions.trim(), mentions: instructions || undefined },
    mentions,
    ruleApplied: !!rule
  }
}

export interface CleanerDeps {
  engine: CleanupEngine
  /** A ModelManager over [CLEANUP_MODEL]. */
  models: ModelManager
  getSettings: () => Settings
  onStatus: (status: CleanupStatus) => void
}

/**
 * Keeps the cleanup LLM downloaded and loaded while cleanup is on, and runs transcripts
 * through it. Never makes a dictation fail: on any problem the raw transcript is used.
 */
export class Cleaner {
  private _status: CleanupStatus
  private preparing: Promise<void> | null = null

  constructor(private readonly deps: CleanerDeps) {
    this._status = this.statusFor(deps.getSettings().cleanup ? 'idle' : 'off')
  }

  get status(): CleanupStatus {
    return this._status
  }

  /** Download (first run) and load the model if cleanup is on; unload it if it's off. */
  prepare(): Promise<void> {
    if (!this.deps.getSettings().cleanup) {
      void this.deps.engine.stop() // frees the memory
      this.setStatus(this.statusFor('off'))
      return Promise.resolve()
    }
    this.preparing ??= this.load().finally(() => (this.preparing = null))
    return this.preparing
  }

  /** Delete the downloaded model. Only while cleanup is off. */
  deleteModel(): void {
    if (this.deps.getSettings().cleanup) return
    this.deps.models.delete(CLEANUP_MODEL.id)
    this.setStatus(this.statusFor('off'))
  }

  /** `app` is where the text will be pasted; its rule, if any, is added to the prompt. */
  async clean(text: string, app?: AppInfo | null): Promise<string> {
    const settings = this.deps.getSettings()
    if (!settings.cleanup || !text) return text
    if (this._status.state !== 'ready' || this.deps.engine.loadedModelPath !== this.path) {
      // Still downloading/loading, or the worker crashed: paste the raw text, get ready for next time.
      void this.prepare()
      return text
    }

    const { target, mentions, ruleApplied } = targetFor(settings, app)
    const start = performance.now()
    let outcome: NonNullable<CleanupStatus['last']>['outcome']
    let result = text
    try {
      // People's names go to the speech model's vocabulary, not here: listed as vocabulary,
      // Gemma prefers a full name ("Robert Hale") over the person's handle.
      const r = await this.deps.engine.clean(text, vocabularyTerms(settings.vocabulary), cleanupTimeoutMs(text), target)
      const cleaned = r && tidyOutput(r.text)
      if (cleaned === null) outcome = 'timeout'
      else if (cleaned === text) outcome = 'unchanged'
      else if (acceptCleanup(text, cleaned, mentions)) {
        outcome = 'applied'
        result = cleaned
      } else {
        outcome = 'rejected'
        console.warn('[cleanup] rejected output that strayed from the transcript:', JSON.stringify(cleaned))
      }
    } catch (err) {
      outcome = 'error'
      console.error('[cleanup] failed:', err)
    }
    this.setStatus({ ...this._status, last: {
        ms: Math.round(performance.now() - start),
        outcome,
        raw: text,
        text: result,
        app: app?.name,
        ruleApplied,
        mentions: !!target?.mentions
      }
    })
    return result
  }

  private get path(): string {
    return this.deps.models.pathFor(CLEANUP_MODEL.id)!
  }

  private async load(): Promise<void> {
    const { models, engine } = this.deps
    if (!models.isDownloaded(CLEANUP_MODEL.id)) {
      this.setStatus(this.statusFor('downloading', '0%'))
      try {
        await models.download(CLEANUP_MODEL.id, (p: ModelProgress) => {
          if (p.done || p.error) return
          const pct = p.total ? Math.floor((p.received / p.total) * 100) : 0
          this.setStatus(this.statusFor('downloading', `${pct}%`))
        })
      } catch (err) {
        this.setStatus(this.statusFor('error', `Download failed: ${(err as Error).message}`))
        return
      }
    }
    if (!this.deps.getSettings().cleanup) {
      this.setStatus(this.statusFor('off'))
      return
    }
    if (engine.loadedModelPath === this.path && this._status.state === 'ready') return

    this.setStatus(this.statusFor('loading'))
    try {
      await engine.load(this.path)
      this.setStatus(this.statusFor('ready'))
    } catch (err) {
      // Turning cleanup off mid-load stops the engine, which rejects the load.
      if (!this.deps.getSettings().cleanup) this.setStatus(this.statusFor('off'))
      else this.setStatus(this.statusFor('error', `Couldn't load: ${(err as Error).message}`))
    }
  }

  private statusFor(state: CleanupStatus['state'], message?: string): CleanupStatus {
    return {
      state,
      message,
      modelName: CLEANUP_MODEL.name,
      sizeMb: CLEANUP_MODEL.sizeMb,
      downloaded: this.deps.models.isDownloaded(CLEANUP_MODEL.id)
    }
  }

  private setStatus(status: CleanupStatus): void {
    this._status = status
    this.deps.onStatus(status)
  }
}
