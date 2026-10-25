// Non-speech markers whisper models emit for silence/noise, e.g. "[BLANK_AUDIO]", "(music)".
const MARKER = /\[(?:BLANK_AUDIO|[^\]]*(?:silence|music|noise|inaudible)[^\]]*)\]|\((?:[^)]*(?:silence|music|noise|inaudible)[^)]*)\)/gi

export function cleanTranscript(text: string): string {
  return text.replace(MARKER, ' ').replace(/\s+/g, ' ').trim()
}
