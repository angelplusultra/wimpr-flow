import { describe, expect, it } from 'vitest'
import { dictionaryTerms, runOptions, vocabularyTerms } from '../src/main/engine/run-options'
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

describe('dictionaryTerms', () => {
  it('adds the names of people you mention', () => {
    const person = (name: string) => ({ id: name, name, aliases: ['Shawn'], handles: {} })
    expect(dictionaryTerms({ vocabulary: 'Supabase, Sean', people: [person('Sean'), person('Maria'), person(' ')] })).toEqual([
      'Supabase',
      'Sean',
      'Maria'
    ])
  })
})

describe('runOptions', () => {
  it('passes a language hint only when the model supports it', () => {
    expect(runOptions(caps(), 'de', vocabularyTerms(''))).toEqual({ language: 'de' })
    expect(runOptions(caps(), 'ja', vocabularyTerms(''))).toEqual({})
    expect(runOptions(caps(), 'auto', vocabularyTerms(''))).toEqual({})
  })

  it('uses native vocabulary support when available', () => {
    expect(runOptions(caps({ vocabulary: true }), 'auto', vocabularyTerms('Supabase, gRPC'))).toEqual({
      vocabulary: ['Supabase', 'gRPC']
    })
  })

  it('falls back to a context prompt', () => {
    expect(runOptions(caps({ contextPrompt: true }), 'auto', vocabularyTerms('Supabase, gRPC'))).toEqual({
      prompt: 'Vocabulary: Supabase, gRPC.'
    })
  })

  it('drops vocabulary for models that support neither', () => {
    expect(runOptions(caps(), 'en', vocabularyTerms('Supabase'))).toEqual({ language: 'en' })
  })
})
