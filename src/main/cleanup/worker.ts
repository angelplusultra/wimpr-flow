// Runs the cleanup LLM in its own utility process, like the transcription worker.
import type { ChatHistoryItem, Llama, LlamaChatSession, LlamaContext, LlamaModel } from 'node-llama-cpp'
import { EXAMPLES, SYSTEM_PROMPT, transcriptMessage } from './prompt'
import type { FromCleanupWorker, ToCleanupWorker } from './protocol'

const port = process.parentPort
let llama: Llama | null = null
let loaded: { model: LlamaModel; context: LlamaContext; session: LlamaChatSession } | null = null
let queue: Promise<void> = Promise.resolve()
const running = new Map<number, AbortController>()
/** Cancelled while still queued behind another request. */
const cancelled = new Set<number>()
let disposing = false

const send = (msg: FromCleanupWorker): void => port.postMessage(msg)

// The system prompt and examples are identical every run, so their KV cache is reused and
// only the transcript itself is processed per dictation.
const HISTORY: ChatHistoryItem[] = [
  { type: 'system', text: SYSTEM_PROMPT },
  ...EXAMPLES.flatMap(([user, reply]): ChatHistoryItem[] => [
    { type: 'user', text: user },
    { type: 'model', response: [reply] }
  ])
]

async function load(modelPath: string): Promise<void> {
  const { getLlama, LlamaChatSession, LlamaLogLevel } = await import('node-llama-cpp')
  const start = performance.now()
  try {
    // Prebuilt Metal binaries only; never try to compile llama.cpp on the user's machine.
    llama ??= await getLlama({ build: 'never', logLevel: LlamaLogLevel.error })
    await loaded?.model.dispose()
    loaded = null
    const model = await llama.loadModel({ modelPath })
    const context = await model.createContext({ contextSize: 8192 })
    const session = new LlamaChatSession({ contextSequence: context.getSequence() })
    loaded = { model, context, session }
    await clean('warm up', [], new AbortController().signal) // fills the prefix cache
    send({ type: 'loaded', loadMs: Math.round(performance.now() - start) })
  } catch (err) {
    await loaded?.model.dispose()
    loaded = null
    send({ type: 'load-error', message: (err as Error).message })
  }
}

async function clean(text: string, vocabulary: string[], signal: AbortSignal): Promise<string> {
  if (!loaded) throw new Error('No cleanup model loaded')
  const { model, session } = loaded
  session.setChatHistory(HISTORY)
  return session.prompt(transcriptMessage(text, vocabulary), {
    temperature: 0,
    // A formatted transcript is about as long as the raw one; this stops a runaway reply.
    maxTokens: Math.ceil(model.tokenize(text).length * 1.5) + 32,
    budgets: { thoughtTokens: 0 },
    signal,
    stopOnAbortSignal: true
  })
}

async function handleClean(msg: Extract<ToCleanupWorker, { type: 'clean' }>): Promise<void> {
  if (cancelled.delete(msg.id) || disposing) {
    send({ type: 'error', id: msg.id, message: 'Cancelled' })
    return
  }
  const abort = new AbortController()
  running.set(msg.id, abort)
  const start = performance.now()
  try {
    const text = await clean(msg.text, msg.vocabulary, abort.signal)
    send({ type: 'result', id: msg.id, text, ms: Math.round(performance.now() - start) })
  } catch (err) {
    send({ type: 'error', id: msg.id, message: (err as Error).message })
  } finally {
    running.delete(msg.id)
  }
}

async function dispose(): Promise<void> {
  disposing = true
  for (const run of running.values()) run.abort()
  await queue
  await llama?.dispose()
  process.exit(0)
}

port.on('message', (e: Electron.MessageEvent) => {
  const msg = e.data as ToCleanupWorker
  if (msg.type === 'dispose') {
    void dispose()
    return
  }
  if (msg.type === 'cancel') {
    const run = running.get(msg.id)
    if (run) run.abort()
    else cancelled.add(msg.id)
    return
  }
  queue = queue.then(() => (msg.type === 'load' ? load(msg.modelPath) : handleClean(msg)))
})
