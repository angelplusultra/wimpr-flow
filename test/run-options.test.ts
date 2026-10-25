import { describe, expect, it } from 'vitest'
import { runOptions, vocabularyTerms } from '../src/main/engine/run-options'
import type { ModelCapabilities } from '../src/shared/types'

const caps = (over: Partial<ModelCapabilities> = {}): ModelCapabilities => ({
  languages: ['en', 'de', 'fr'],
  languageDetect: true,
  vocabulary: false,
  contextPrompt: false,
  ...over
})

describe('vocabularyTerms', () => {
  it('splits on commas, semicolons and newlines, trimming and de-duplicating', () => {
    expect(vocabularyTerms(' Supabase, gRPC;\nKubernetes,, Supabase ')).toEqual(['Supabase', 'gRPC', 'Kubernetes'])
    expect(vocabularyTerms('   ')).toEqual([])
  })
})

describe('runOptions', () => {
  it('passes a language hint only when the model supports it', () => {
    expect(runOptions(caps(), 'de', '')).toEqual({ language: 'de' })
    expect(runOptions(caps(), 'ja', '')).toEqual({})
    expect(runOptions(caps(), 'auto', '')).toEqual({})
  })

  it('uses native vocabulary support when available', () => {
    expect(runOptions(caps({ vocabulary: true }), 'auto', 'Supabase, gRPC')).toEqual({
      vocabulary: ['Supabase', 'gRPC']
    })
  })

  it('falls back to a context prompt', () => {
    expect(runOptions(caps({ contextPrompt: true }), 'auto', 'Supabase, gRPC')).toEqual({
      prompt: 'Vocabulary: Supabase, gRPC.'
    })
  })

  it('drops vocabulary for models that support neither', () => {
    expect(runOptions(caps(), 'en', 'Supabase')).toEqual({ language: 'en' })
  })
})
