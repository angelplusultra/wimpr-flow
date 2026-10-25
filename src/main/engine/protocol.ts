import type { ModelCapabilities } from '../../shared/types'
import type { RunOptions } from './run-options'

/** Messages between the main process and the transcription worker. */
export type ToWorker =
  | { type: 'load'; modelPath: string }
  | { type: 'transcribe'; id: number; pcm: Float32Array; options: RunOptions }

export type FromWorker =
  | { type: 'loaded'; capabilities: ModelCapabilities; loadMs: number; device: string }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'error'; id: number; message: string }
