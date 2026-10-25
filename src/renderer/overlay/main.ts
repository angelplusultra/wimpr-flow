import type { StartRecording } from '../../shared/types'
import { Recorder } from './recorder'
import { playCue } from './sounds'

// Keep capturing briefly after release so the last syllable isn't clipped.
const TAIL_MS = 150

const api = window.wimpr.overlay
const pill = document.getElementById('pill') as HTMLDivElement
const bars = Array.from(pill.querySelectorAll<HTMLElement>('.bars i'))
const message = pill.querySelector('.message') as HTMLDivElement

// Center bars react most; outer ones less, for a simple waveform look.
const BAR_WEIGHTS = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45]
let smoothed = 0

const recorder = new Recorder((rms) => {
  const level = Math.min(1, rms * 12)
  smoothed = Math.max(level, smoothed * 0.8)
  bars.forEach((bar, i) => {
    const jitter = 0.85 + Math.random() * 0.3
    bar.style.transform = `scaleY(${Math.max(0.15, Math.min(1, smoothed * BAR_WEIGHTS[i] * jitter))})`
  })
})

let session: { id: number; sounds: boolean; started: Promise<void> } | null = null

api.onState(({ state, message: text }) => {
  pill.dataset.state = state
  message.textContent = text ?? ''
  if (state !== 'recording') {
    smoothed = 0
    bars.forEach((bar) => (bar.style.transform = 'scaleY(0.15)'))
  }
})

api.onStart(({ sessionId, sounds }: StartRecording) => {
  recorder.cancel()
  const started = recorder.start().then(() => {
    if (sounds && recorder.context) playCue(recorder.context, 'start')
  })
  session = { id: sessionId, sounds, started }
  started.catch((err: Error) => {
    if (session?.id !== sessionId || err.name === 'AbortError') return
    session = null
    recorder.cancel()
    const denied = err.name === 'NotAllowedError'
    api.sendError(sessionId, denied ? 'Microphone access denied — allow it in Settings' : `Mic error: ${err.message}`)
  })
})

api.onStop(async (sessionId) => {
  const current = session
  if (!current || current.id !== sessionId) return
  try {
    await current.started
  } catch {
    return // start failure already reported
  }
  await new Promise((r) => setTimeout(r, TAIL_MS))
  if (session !== current) return
  session = null
  const recording = await recorder.stop()
  if (current.sounds && recorder.context) playCue(recorder.context, 'stop')
  api.sendResult({ sessionId, ...recording })
})

api.onCancel((sessionId) => {
  if (session?.id !== sessionId) return
  session = null
  recorder.cancel()
})
