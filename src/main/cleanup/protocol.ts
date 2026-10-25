import type { TargetApp } from './prompt'

/** Messages between the main process and the cleanup worker. */
export type ToCleanupWorker =
  | { type: 'load'; modelPath: string }
  | { type: 'clean'; id: number; text: string; vocabulary: string[]; app?: TargetApp }
  /** Stop generating for `id`; it answers with whatever it has, which the caller ignores. */
  | { type: 'cancel'; id: number }
  /** Free the model and exit. Killing it mid-generation crashes llama.cpp on the way out. */
  | { type: 'dispose' }

export type FromCleanupWorker =
  | { type: 'loaded'; loadMs: number }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'error'; id: number; message: string }
