/** Messages from the input worker to the main process. */
export type FromInputWorker =
  | { type: 'key'; keycode: number; down: boolean }
  /** Keyboards it's reading, and ones it found but isn't allowed to read. */
  | { type: 'devices'; reading: string[]; denied: string[] }
