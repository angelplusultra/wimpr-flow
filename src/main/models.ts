import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_MODEL, type ModelInfo, type ModelProgress } from '../shared/types'

export interface CatalogEntry extends Omit<ModelInfo, 'downloaded' | 'recommended'> {
  url: string
  /** File name in the models directory. */
  file: string
  /**
   * Pinned from the Hugging Face LFS metadata. A download that doesn't match is discarded,
   * so a corrupted transfer or a changed upstream file can never be loaded.
   */
  sha256: string
  bytes: number
}

/** A file on Hugging Face, pinned to a commit so the URL and checksum can never drift apart. */
function hf(
  repo: string,
  revision: string,
  file: string,
  sha256: string,
  bytes: number
): Pick<CatalogEntry, 'url' | 'file' | 'sha256' | 'bytes'> {
  return { url: `https://huggingface.co/${repo}/resolve/${revision}/${file}`, file, sha256, bytes }
}

/**
 * Curated models that run on transcribe.cpp. Quantization is picked per model as the
 * smallest whose published WER matches full precision (Q8 for 0.6B models, Q5_K_M/Q4_K_M
 * for the bigger ones).
 */
export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'parakeet-tdt-0.6b-v3',
    name: 'Parakeet TDT v3',
    maker: 'NVIDIA',
    blurb: 'Fastest. 25 European languages.',
    sizeMb: 740,
    ...hf(
      'handy-computer/parakeet-tdt-0.6b-v3-gguf', // transcribe.cpp's verified GGUF builds
      'd8d8c32cb2017c57e5307767343e97870f8a7f53',
      'parakeet-tdt-0.6b-v3-Q8_0.gguf',
      '5859f77944efcd8eafa23a6350731960b2b55b2203df51f319665c807d802cc7',
      739508576
    )
  },
  {
    id: 'parakeet-unified-en-0.6b',
    name: 'Parakeet Unified',
    maker: 'NVIDIA',
    blurb: 'Newest Parakeet. English only.',
    sizeMb: 731,
    ...hf(
      'handy-computer/parakeet-unified-en-0.6b-gguf', // transcribe.cpp's verified GGUF builds
      '843b1b175ace04f5a89d379c79e2518c0d065b25',
      'parakeet-unified-en-0.6b-Q8_0.gguf',
      '4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795',
      731357568
    )
  },
  {
    id: 'granite-speech-4.1-2b',
    name: 'Granite Speech 4.1 2B',
    maker: 'IBM',
    blurb: '#1 on the Open ASR Leaderboard. 6 languages.',
    sizeMb: 1830,
    ...hf(
      'handy-computer/granite-speech-4.1-2b-gguf', // transcribe.cpp's verified GGUF builds
      'a9dbf6ea76e87ef0deb6c2cd26f0bb533dd38756',
      'granite-speech-4.1-2b-Q5_K_M.gguf',
      '1ea15c2174b485b8de81337a1da3ae6703a7892a5330345b9a2212e9a6a0c365',
      1829704640
    )
  },
  {
    id: 'cohere-transcribe-03-2026',
    name: 'Cohere Transcribe',
    maker: 'Cohere',
    blurb: 'Near the top of the Open ASR Leaderboard. 14 languages.',
    sizeMb: 1770,
    ...hf(
      'handy-computer/cohere-transcribe-03-2026-gguf', // transcribe.cpp's verified GGUF builds
      '7353b6040bdc1be9e5a3823d99d5fe12afe88264',
      'cohere-transcribe-03-2026-Q5_K_M.gguf',
      '14d02f1ad6dd77b3a60f82639879012c3adb4fe25c50a5a47a2c4c661daf1558',
      1770270208
    )
  },
  {
    id: 'canary-qwen-2.5b',
    name: 'Canary-Qwen 2.5B',
    maker: 'NVIDIA',
    blurb: 'High accuracy. English only.',
    sizeMb: 1984,
    ...hf(
      'handy-computer/canary-qwen-2.5b-gguf', // transcribe.cpp's verified GGUF builds
      'a4480da236b7d99d7a12186868de021ef4ff5ced',
      'canary-qwen-2.5b-Q5_K_M.gguf',
      'd71b1d9ae442dc538665ed4df63a69520eb9be769ec0bc78c7d2f40040928306',
      1983729024
    )
  },
  {
    id: 'voxtral-mini-3b-2507',
    name: 'Voxtral Mini 3B',
    maker: 'Mistral',
    blurb: 'Best open model on conversational benchmarks. Multilingual.',
    sizeMb: 2985,
    ...hf(
      'handy-computer/Voxtral-Mini-3B-2507-gguf', // transcribe.cpp's verified GGUF builds
      '3d4e8e74a2ada47b400b2957575b2a9c058efe80',
      'Voxtral-Mini-3B-2507-Q4_K_M.gguf',
      '3a6717aa8f8989108d260cbd237584289eec43cc987e10133c33643515936205',
      2984721056
    )
  },
  {
    id: 'qwen3-asr-1.7b',
    name: 'Qwen3-ASR 1.7B',
    maker: 'Alibaba',
    blurb: '30 languages.',
    sizeMb: 1517,
    ...hf(
      'handy-computer/Qwen3-ASR-1.7B-gguf', // transcribe.cpp's verified GGUF builds
      '0e0a596e3959c3f3f2ab7d443a5b6f0f4a4bba6f',
      'Qwen3-ASR-1.7B-Q5_K_M.gguf',
      '034c557fe92ff8fcd9a9c041cbdaad347be0a86a58d3a348f63cf3f0180879d0',
      1517290464
    )
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    maker: 'OpenAI',
    blurb: 'Widest language coverage (99).',
    sizeMb: 886,
    ...hf(
      'handy-computer/whisper-large-v3-turbo-gguf', // transcribe.cpp's verified GGUF builds
      '18ada752005f5fddef499256f9a458d0b37a203a',
      'whisper-large-v3-turbo-Q8_0.gguf',
      '257aa7ec9121c22c167d5e2c49e3e76b4ba0e6e27ebc13074eba0a80f8190220',
      886381728
    )
  }
]

/** The LLM that cleans up transcripts (punctuation, filler words, emails). */
export const CLEANUP_MODEL: CatalogEntry = {
  id: 'gemma-4-e2b-it',
  name: 'Gemma 4 E2B',
  maker: 'Google',
  blurb: 'Fixes punctuation, filler words and formatting.',
  sizeMb: 3107,
  ...hf(
    'unsloth/gemma-4-E2B-it-GGUF',
    '0314792d7f1f7e229411f620751375812bb9faf2',
    'gemma-4-E2B-it-Q4_K_M.gguf',
    '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8',
    3106738272
  )
}

export function findModel(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}

export class ModelManager {
  private downloads = new Map<string, { job: Promise<void>; progress: ModelProgress }>()

  constructor(
    private readonly dir: string,
    private readonly catalog: CatalogEntry[] = MODEL_CATALOG
  ) {}

  private find(id: string): CatalogEntry | undefined {
    return this.catalog.find((m) => m.id === id)
  }

  pathFor(id: string): string | null {
    const entry = this.find(id)
    return entry ? join(this.dir, entry.file) : null
  }

  isDownloaded(id: string): boolean {
    const path = this.pathFor(id)
    return !!path && existsSync(path)
  }

  /** Progress of an in-flight download, if any. */
  progress(id: string): ModelProgress | undefined {
    return this.downloads.get(id)?.progress
  }

  list(): ModelInfo[] {
    return this.catalog.map(({ url: _url, file: _file, sha256: _sha256, bytes: _bytes, ...m }) => ({
      ...m,
      downloaded: this.isDownloaded(m.id),
      recommended: m.id === DEFAULT_MODEL
    }))
  }

  download(id: string, onProgress: (p: ModelProgress) => void): Promise<void> {
    const entry = this.find(id)
    if (!entry) return Promise.reject(new Error(`Unknown model ${id}`))
    const existing = this.downloads.get(id)
    if (existing) return existing.job
    const state = { progress: { id, received: 0, total: entry.bytes } as ModelProgress, job: Promise.resolve() }
    state.job = this.fetchModel(entry, (p) => {
      state.progress = p
      onProgress(p)
    }).finally(() => this.downloads.delete(id))
    this.downloads.set(id, state)
    return state.job
  }

  delete(id: string): void {
    const path = this.pathFor(id)
    if (path) rmSync(path, { force: true })
  }

  private async fetchModel(entry: CatalogEntry, onProgress: (p: ModelProgress) => void): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const dest = join(this.dir, entry.file)
    const part = `${dest}.part`
    const { id } = entry
    try {
      const res = await fetch(entry.url)
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
      const total = entry.bytes
      const hash = createHash('sha256')
      let received = 0
      let lastReport = 0
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
      body.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        received += chunk.length
        const now = Date.now()
        if (now - lastReport > 250) {
          lastReport = now
          onProgress({ id, received, total })
        }
      })
      await pipeline(body, createWriteStream(part))
      if (received !== total) throw new Error('Download was incomplete')
      if (hash.digest('hex') !== entry.sha256) {
        throw new Error('Downloaded file failed its checksum check (corrupted or changed upstream)')
      }
      renameSync(part, dest)
      onProgress({ id, received, total, done: true })
    } catch (err) {
      rmSync(part, { force: true })
      onProgress({ id, received: 0, total: 0, error: (err as Error).message })
      throw err
    }
  }
}
