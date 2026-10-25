// Runs in an Electron utility process, so the model stays loaded between dictations and
// a native crash can't take the app down with it.
import type { TranscribeModel as Model } from 'transcribe-cpp'
import { deviceLabel } from '../../shared/device'
import type { FromWorker, ToWorker } from './protocol'

const port = process.parentPort
let model: Model | null = null
// Messages are handled one at a time so a transcribe never races a model swap.
let queue: Promise<void> = Promise.resolve()

const send = (msg: FromWorker): void => port.postMessage(msg)

async function load(modelPath: string): Promise<void> {
  const { TranscribeModel } = await import('transcribe-cpp')
  model?.dispose()
  model = null
  const start = performance.now()
  try {
    model = await TranscribeModel.load(modelPath)
    // The first run pays one-time GPU setup; do it now instead of on the user's dictation.
    await model.transcribe(new Float32Array(16_000))
    const caps = model.capabilities
    const { deviceType, kind, description } = model.device
    send({
      type: 'loaded',
      loadMs: Math.round(performance.now() - start),
      device: deviceType === 'cpu' ? 'CPU' : deviceLabel(kind, [description]),
      capabilities: {
        languages: caps.languages,
        languageDetect: caps.supportsLanguageDetect,
        vocabulary: model.supports('vocabulary'),
        contextPrompt: model.supports('context_prompt')
      }
    })
  } catch (err) {
    model?.dispose()
    model = null
    send({ type: 'load-error', message: (err as Error).message })
  }
}

async function transcribe(msg: Extract<ToWorker, { type: 'transcribe' }>): Promise<void> {
  if (!model) {
    send({ type: 'error', id: msg.id, message: 'No model loaded' })
    return
  }
  const start = performance.now()
  try {
    const result = await model.transcribe(msg.pcm, msg.options)
    send({ type: 'result', id: msg.id, text: result.text, ms: Math.round(performance.now() - start) })
  } catch (err) {
    send({ type: 'error', id: msg.id, message: (err as Error).message })
  }
}

port.on('message', (e: Electron.MessageEvent) => {
  const msg = e.data as ToWorker
  queue = queue.then(() => (msg.type === 'load' ? load(msg.modelPath) : transcribe(msg)))
})
