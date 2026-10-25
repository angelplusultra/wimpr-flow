import type { ModelCapabilities } from '../../shared/types'

export interface RunOptions {
  language?: string
  vocabulary?: string[]
  prompt?: string
}

/** Split the free-form vocabulary setting into terms ("Supabase, gRPC\nKubernetes"). */
export function vocabularyTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ]
}

/**
 * Translate user settings into options the loaded model accepts. transcribe.cpp rejects
 * unsupported language hints outright, so anything the model can't take is dropped.
 */
export function runOptions(caps: ModelCapabilities, language: string, vocabulary: string): RunOptions {
  const opts: RunOptions = {}
  if (language !== 'auto' && caps.languages.includes(language)) opts.language = language
  const terms = vocabularyTerms(vocabulary)
  if (terms.length) {
    if (caps.vocabulary) opts.vocabulary = terms
    else if (caps.contextPrompt) opts.prompt = `Vocabulary: ${terms.join(', ')}.`
  }
  return opts
}

/** Whether the vocabulary setting has any effect on this model. */
export function usesVocabulary(caps: ModelCapabilities): boolean {
  return caps.vocabulary || caps.contextPrompt
}
