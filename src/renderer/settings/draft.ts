import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * Props for a text field that keeps a local draft and saves on blur (or Enter in a
 * single-line input), so every keystroke doesn't rewrite settings.
 */
export function useDraft(
  value: string,
  onCommit: (value: string) => void
): {
  value: string
  onChange: (e: ChangeEvent<Field>) => void
  onBlur: () => void
  onKeyDown: (e: KeyboardEvent<Field>) => void
} {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }
  return {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) commit()
    }
  }
}
