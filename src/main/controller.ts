import type { AppInfo, AppState, OverlayState, RecordingResult, Settings, StartRecording } from '../shared/types'

/** Below this peak RMS the clip is treated as silence; some models hallucinate ("Thank you.") on it. */
export const SILENCE_PEAK = 0.008

const ERROR_DISPLAY_MS = 2500

export interface ControllerDeps {
  getSettings: () => Settings
  /** Tell the recorder to start capturing. */
  startRecorder: (msg: StartRecording) => void
  stopRecorder: (sessionId: number) => void
  cancelRecorder: (sessionId: number) => void
  showOverlay: () => void
  hideOverlay: () => void
  setOverlayState: (state: OverlayState) => void
  transcribe: (pcm: Float32Array, audioMs: number) => Promise<string>
  /** Formatting pass over the transcript; resolves with the raw text on any problem. */
  cleanup: (text: string, app: AppInfo | null) => Promise<string>
  /** The app in front, i.e. the one the text will be pasted into. */
  focusedApp: () => Promise<AppInfo | null>
  paste: (text: string) => Promise<void>
  notifyError: (message: string) => void
  onStateChange: (state: AppState) => void
  resetHotkeys: () => void
}

/** idle → recording → transcribing → idle, with cancel and error exits. */
export class Controller {
  private state: AppState = 'idle'
  private sessionId = 0
  private errorTimer: NodeJS.Timeout | null = null
  /** Looked up when recording starts, while the target app is still in front. */
  private targetApp: Promise<AppInfo | null> = Promise.resolve(null)
  lastTranscript = ''

  constructor(private readonly deps: ControllerDeps) {}

  get current(): AppState {
    return this.state
  }

  start(): void {
    if (this.state === 'recording' || this.state === 'transcribing') {
      // Busy; make sure the hotkey machine doesn't think a new recording is running.
      this.deps.resetHotkeys()
      return
    }
    this.clearErrorTimer()
    this.sessionId++
    this.targetApp = this.deps.focusedApp()
    this.setState('recording')
    this.deps.setOverlayState({ state: 'recording' })
    this.deps.showOverlay()
    this.deps.startRecorder({ sessionId: this.sessionId, sounds: this.deps.getSettings().sounds })
  }

  stop(): void {
    if (this.state !== 'recording') return
    this.setState('transcribing')
    this.deps.setOverlayState({ state: 'transcribing' })
    this.deps.stopRecorder(this.sessionId)
  }

  cancel(): void {
    if (this.state !== 'recording') return
    this.deps.cancelRecorder(this.sessionId)
    this.finish()
  }

  async handleRecording(result: RecordingResult): Promise<void> {
    if (result.sessionId !== this.sessionId || this.state !== 'transcribing') return
    const settings = this.deps.getSettings()

    if (result.durationMs < settings.minDurationMs || result.peak < SILENCE_PEAK) {
      this.finish()
      return
    }

    try {
      const raw = await this.deps.transcribe(result.pcm, result.durationMs)
      if (result.sessionId !== this.sessionId) return
      if (!raw) {
        this.finish()
        return
      }
      const text = await this.deps.cleanup(raw, await this.targetApp)
      if (result.sessionId !== this.sessionId) return
      this.lastTranscript = text
      this.deps.hideOverlay()
      await this.deps.paste(text)
      this.finish()
    } catch (err) {
      if (result.sessionId !== this.sessionId) return
      this.fail((err as Error).message)
    }
  }

  handleRecorderError(sessionId: number, message: string): void {
    if (sessionId !== this.sessionId || this.state === 'idle') return
    this.deps.resetHotkeys()
    this.fail(message)
  }

  private fail(message: string): void {
    this.setState('error')
    this.deps.setOverlayState({ state: 'error', message })
    this.deps.showOverlay()
    this.deps.notifyError(message)
    this.errorTimer = setTimeout(() => this.finish(), ERROR_DISPLAY_MS)
  }

  private finish(): void {
    this.clearErrorTimer()
    this.deps.hideOverlay()
    this.deps.setOverlayState({ state: 'idle' })
    this.setState('idle')
  }

  private clearErrorTimer(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer)
    this.errorTimer = null
  }

  private setState(state: AppState): void {
    this.state = state
    this.deps.onStateChange(state)
  }
}
