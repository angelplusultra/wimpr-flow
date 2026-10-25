export const SAMPLE_RATE = 16_000
const CHUNK = 512 // ~32 ms at 16 kHz; also drives the level meter

// Inlined so it needs no separate bundled file. Batches 128-frame render quanta into
// CHUNK-sized posts and flushes the remainder on request.
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(${CHUNK})
    this.len = 0
    this.port.onmessage = () => {
      this.port.postMessage({ samples: this.buf.slice(0, this.len), flushed: true })
      this.len = 0
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.len++] = ch[i]
        if (this.len === this.buf.length) {
          this.port.postMessage({ samples: this.buf.slice(0) })
          this.len = 0
        }
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

export interface Recording {
  pcm: Float32Array
  durationMs: number
  peak: number
}

/**
 * Captures mono 16 kHz PCM (Chromium resamples the mic for us). The AudioContext is kept
 * alive between recordings so starts are fast; the mic stream itself is released after
 * each recording so the macOS mic indicator turns off.
 */
export class Recorder {
  private ctx: AudioContext | null = null
  private workletReady: Promise<void> | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[] = []
  private peak = 0
  /** Bumped on cancel so a start() still awaiting the mic knows it was abandoned. */
  private generation = 0

  constructor(private readonly onLevel: (rms: number) => void) {}

  get context(): AudioContext | null {
    return this.ctx
  }

  async start(): Promise<void> {
    const generation = this.generation
    const ctx = await this.ensureContext()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }
    })
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop())
      throw new DOMException('Recording cancelled', 'AbortError')
    }
    this.chunks = []
    this.peak = 0
    this.stream = stream
    this.source = ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(ctx, 'pcm-capture')
    this.node.port.onmessage = (e: MessageEvent<{ samples: Float32Array }>) => this.onChunk(e.data.samples)
    this.source.connect(this.node)
    // The processor writes no output; connecting to the destination keeps it pulled.
    this.node.connect(ctx.destination)
  }

  /** Stop capturing and return the audio. */
  async stop(): Promise<Recording> {
    const node = this.node
    if (node) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 200)
        node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; flushed?: boolean }>) => {
          this.onChunk(e.data.samples)
          if (e.data.flushed) {
            clearTimeout(timeout)
            resolve()
          }
        }
        node.port.postMessage('flush')
      })
    }
    this.release()

    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    const samples = new Float32Array(total)
    let offset = 0
    for (const c of this.chunks) {
      samples.set(c, offset)
      offset += c.length
    }
    this.chunks = []
    return {
      pcm: samples,
      durationMs: (total / SAMPLE_RATE) * 1000,
      peak: this.peak
    }
  }

  cancel(): void {
    this.generation++
    this.release()
    this.chunks = []
  }

  private onChunk(samples: Float32Array): void {
    if (!samples.length) return
    this.chunks.push(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / samples.length)
    if (rms > this.peak) this.peak = rms
    this.onLevel(rms)
  }

  private release(): void {
    this.source?.disconnect()
    this.node?.disconnect()
    if (this.node) this.node.port.onmessage = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source = null
    this.node = null
    this.stream = null
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
      this.workletReady = this.ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    }
    await this.workletReady
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }
}
