import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLEANUP_MODEL, MODEL_CATALOG, ModelManager, type CatalogEntry } from '../src/main/models'

const payload = Buffer.from('pretend this is a gguf file')
const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'test-model',
  name: 'Test',
  maker: 'Test',
  blurb: '',
  sizeMb: 1,
  url: 'https://example.com/test.gguf',
  file: 'test.gguf',
  sha256: createHash('sha256').update(payload).digest('hex'),
  bytes: payload.length,
  ...over
})

describe('ModelManager downloads', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wimpr-models-'))
    vi.stubGlobal('fetch', async () => new Response(payload))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps a download whose checksum matches', async () => {
    const models = new ModelManager(dir, [entry()])
    await models.download('test-model', () => {})
    expect(readFileSync(join(dir, 'test.gguf'))).toEqual(payload)
  })

  it('discards a download whose checksum does not match', async () => {
    const models = new ModelManager(dir, [entry({ sha256: 'f'.repeat(64) })])
    const progress: unknown[] = []
    await expect(models.download('test-model', (p) => progress.push(p))).rejects.toThrow(/checksum/)
    expect(readdirSync(dir)).toEqual([]) // no model, no leftover .part file
    expect(models.isDownloaded('test-model')).toBe(false)
    expect(progress.at(-1)).toMatchObject({ error: expect.stringMatching(/checksum/) })
  })

  it('discards a truncated download', async () => {
    const models = new ModelManager(dir, [entry({ bytes: payload.length + 1 })])
    await expect(models.download('test-model', () => {})).rejects.toThrow(/incomplete/)
    expect(existsSync(join(dir, 'test.gguf'))).toBe(false)
  })
})

describe('catalog', () => {
  it('pins every model to a commit, checksum and size', () => {
    for (const m of [...MODEL_CATALOG, CLEANUP_MODEL]) {
      expect(m.url, m.id).toMatch(/^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[0-9a-f]{40}\//)
      expect(m.url.endsWith(`/${m.file}`), m.id).toBe(true)
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/)
      expect(m.bytes, m.id).toBeGreaterThan(100e6)
    }
  })
})
