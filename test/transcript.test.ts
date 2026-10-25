import { describe, expect, it } from 'vitest'
import { cleanTranscript } from '../src/shared/transcript'

describe('cleanTranscript', () => {
  it('strips non-speech markers and normalizes whitespace', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] ')).toBe('')
    expect(cleanTranscript('Hello  world.\n [ Silence ] Bye')).toBe('Hello world. Bye')
    expect(cleanTranscript('(upbeat music) Okay')).toBe('Okay')
  })

  it('leaves normal parentheses and brackets alone', () => {
    expect(cleanTranscript('Use the map (not the list) [v2]')).toBe('Use the map (not the list) [v2]')
  })
})
