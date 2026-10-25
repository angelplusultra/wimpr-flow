import { Check, Download, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type {
  EngineStatus,
  ModelInfo,
  ModelProgress,
  PermissionStatus,
  Settings,
  SettingsPatch,
  SettingsView
} from '../../shared/types'
import { useDraft } from './draft'
import { formatSize, Group, Page, Row } from './layout'

const api = window.fwf.settings

const LANGUAGES: [string, string][] = [
  ['auto', 'Auto-detect'],
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['pl', 'Polish'],
  ['sv', 'Swedish'],
  ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],
  ['ru', 'Russian'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese']
]

type Update = (patch: SettingsPatch) => void

// ---------------------------------------------------------------- General

export function GeneralPage({
  settings,
  permissions,
  onPermissions,
  update
}: {
  settings: Settings
  permissions: PermissionStatus | null
  onPermissions: (p: PermissionStatus) => void
  update: Update
}): ReactNode {
  return (
    <Page title="General" description="Hold your hotkey, talk, let go. Everything runs on this Mac.">
      {permissions && <Permissions status={permissions} onChange={onPermissions} />}
      <Group title="Behavior">
        <Row title="Sounds" description="Play a short cue when recording starts and stops.">
          <Switch checked={settings.sounds} onCheckedChange={(sounds) => update({ sounds })} />
        </Row>
        <Row title="Restore clipboard" description="Put back whatever you had copied after pasting.">
          <Switch checked={settings.restoreClipboard} onCheckedChange={(restoreClipboard) => update({ restoreClipboard })} />
        </Row>
        <Row title="Launch at login">
          <Switch checked={settings.launchAtLogin} onCheckedChange={(launchAtLogin) => update({ launchAtLogin })} />
        </Row>
        <Row title="Ignore short taps" description="Recordings shorter than this are thrown away.">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={3000}
              step={50}
              className="h-7 w-20 text-right text-xs tabular-nums md:text-xs"
              value={settings.minDurationMs}
              onChange={(e) => update({ minDurationMs: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </div>
        </Row>
      </Group>
    </Page>
  )
}

function Permissions({ status, onChange }: { status: PermissionStatus; onChange: (s: PermissionStatus) => void }): ReactNode {
  const row = (kind: 'microphone' | 'accessibility', title: string, why: string, granted: boolean): ReactNode => (
    <Row title={title} description={why}>
      {granted ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" />
          Granted
        </span>
      ) : (
        <>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void api.openPermissionSettings(kind)}>
            Open Settings
          </Button>
          <Button size="sm" onClick={() => void api.requestPermission(kind).then(onChange)}>
            Grant
          </Button>
        </>
      )}
    </Row>
  )
  const missing = status.microphone !== 'granted' || !status.accessibility
  return (
    <Group
      title="Permissions"
      footer={
        missing && status.grantTo ? (
          <>
            Dev mode: macOS checks <span className="text-foreground">{status.grantTo}</span>, not this app, because it
            launched it. Grant these to {status.grantTo}, then restart <code>pnpm dev</code>.
          </>
        ) : undefined
      }
    >
      {row('microphone', 'Microphone', 'To hear you while the hotkey is active.', status.microphone === 'granted')}
      {row('accessibility', 'Accessibility', 'To detect the hotkey and paste into other apps.', status.accessibility)}
    </Group>
  )
}

// ---------------------------------------------------------------- Speech model

function engineSummary(engine: EngineStatus | null): ReactNode {
  if (!engine) return null
  switch (engine.state) {
    case 'downloading':
      return <>Downloading… {engine.message}</>
    case 'loading':
      return <>Loading model…</>
    case 'error':
      return <span className="text-destructive">{engine.message}</span>
    case 'ready':
      return engine.last ? (
        <>
          Last dictation: {(engine.last.audioMs / 1000).toFixed(1)}s of audio in{' '}
          <span className="text-foreground tabular-nums">{(engine.last.transcribeMs / 1000).toFixed(2)}s</span>
        </>
      ) : (
        <>Ready</>
      )
    default:
      return null
  }
}

export function ModelsPage({
  selected,
  engine,
  onSelect,
  onModelsChanged
}: {
  selected: string
  engine: EngineStatus | null
  onSelect: (id: string) => void
  onModelsChanged: () => void
}): ReactNode {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    void api.listModels().then((list) => {
      setModels(list)
      setProgress(Object.fromEntries(list.filter((m) => m.progress).map((m) => [m.id, m.progress!])))
    })
    return api.onModelProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }))
      if (p.done) void api.listModels().then(setModels)
    })
  }, [])

  const changed = (list: ModelInfo[]): void => {
    setModels(list)
    onModelsChanged()
  }

  const download = (id: string): void => {
    setProgress((prev) => ({ ...prev, [id]: { id, received: 0, total: 0 } }))
    void api.downloadModel(id).then(changed)
  }

  const remove = (id: string): void => {
    setConfirmDelete(null)
    void api.deleteModel(id).then(changed)
  }

  const selectedName = models.find((m) => m.id === selected)?.name

  return (
    <Page title="Speech model" description="Turns your voice into words. Downloaded models can be switched any time.">
      <Group>
        <Row title={selectedName ?? 'Current model'} description={engineSummary(engine)}>
          {engine?.state === 'loading' || engine?.state === 'downloading' ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </Row>
      </Group>

      <Group title="Available models">
        <RadioGroup value={selected} onValueChange={onSelect} className="gap-0 divide-y divide-border">
          {models.map((m) => {
            const p = progress[m.id]
            const downloading = p && !p.done && !p.error
            const pct = downloading && p.total ? Math.floor((p.received / p.total) * 100) : 0
            const active = selected === m.id
            return (
              <label
                key={m.id}
                htmlFor={`model-${m.id}`}
                className={
                  'flex items-center gap-3.5 px-4 py-3 transition-colors ' +
                  (m.downloaded && !active ? 'cursor-pointer hover:bg-accent/50' : '')
                }
              >
                <RadioGroupItem id={`model-${m.id}`} value={m.id} disabled={!m.downloaded} aria-label={`Use ${m.name}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {m.name}
                    <span className="text-xs font-normal text-subtle">{m.maker}</span>
                    {m.recommended && (
                      <Badge variant="outline" className="h-[18px] px-1.5 text-[10px] font-normal text-muted-foreground">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.blurb} · {formatSize(m.sizeMb)}
                    {p?.error && <span className="text-destructive"> — {p.error}</span>}
                  </div>
                </div>
                {downloading ? (
                  <div className="flex w-36 items-center gap-2.5">
                    <Progress value={pct} className="h-1" />
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                ) : !m.downloaded ? (
                  <Button size="sm" variant="outline" onClick={() => download(m.id)}>
                    <Download />
                    Download
                  </Button>
                ) : active ? (
                  <span className="text-xs text-muted-foreground">In use</span>
                ) : confirmDelete === m.id ? (
                  <Button size="sm" variant="destructive" onClick={() => remove(m.id)}>
                    Delete {formatSize(m.sizeMb)}?
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(m.id)}
                  >
                    Delete
                  </Button>
                )}
              </label>
            )
          })}
        </RadioGroup>
      </Group>
    </Page>
  )
}

// ---------------------------------------------------------------- Dictionary

export function DictionaryPage({
  settings,
  engine,
  update
}: {
  settings: Settings
  engine: EngineStatus | null
  update: Update
}): ReactNode {
  const caps = engine?.state === 'ready' ? engine.capabilities : undefined
  const languageUnsupported = caps && settings.language !== 'auto' && !caps.languages.includes(settings.language)
  const vocabularyIgnored = caps && !caps.vocabulary && !caps.contextPrompt

  return (
    <Page title="Dictionary" description="Help the models get names, jargon and your language right.">
      <Group>
        <Row
          title="Language"
          description={
            languageUnsupported ? (
              <span className="flex items-center gap-1.5 text-warning">
                <TriangleAlert className="size-3.5" />
                The current speech model doesn't support it, so it will auto-detect.
              </span>
            ) : (
              'What you usually speak.'
            )
          }
        >
          <Select value={settings.language} onValueChange={(language) => update({ language })}>
            <SelectTrigger size="sm" className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>

      <Group
        title="Vocabulary"
        footer={
          vocabularyIgnored && !settings.cleanup ? (
            <span className="text-warning">The current speech model ignores vocabulary, and AI cleanup is off.</span>
          ) : vocabularyIgnored ? (
            'The current speech model ignores these, but AI cleanup uses them.'
          ) : (
            'Separate with commas or new lines.'
          )
        }
      >
        <div className="p-3">
          <VocabularyField value={settings.vocabulary} onCommit={(vocabulary) => update({ vocabulary })} />
        </div>
      </Group>
    </Page>
  )
}

function VocabularyField({ value, onCommit }: { value: string; onCommit: (v: string) => void }): ReactNode {
  const draft = useDraft(value, onCommit)
  return (
    <Textarea
      rows={5}
      spellCheck={false}
      aria-label="Vocabulary"
      placeholder="Supabase, Kubernetes, jane@example.com"
      className="min-h-0 resize-none border-0 bg-transparent px-1 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
      {...draft}
    />
  )
}

// ---------------------------------------------------------------- Shortcuts

export function ShortcutsPage({ view, update }: { view: SettingsView; update: Update }): ReactNode {
  const { hotkeys } = view.settings
  return (
    <Page title="Shortcuts" description="Fn / Globe isn't supported; pick any other key or combo.">
      <Group footer={<>Press <Kbd>Esc</Kbd> while recording to cancel.</>}>
        <HotkeyRow
          title="Hold to talk"
          description="Records while held, pastes on release."
          keys={hotkeys.hold}
          names={view.keyNames}
          onChange={(hold) => update({ hotkeys: { hold } })}
        />
        <HotkeyRow
          title="Hands-free"
          description="Press to start, again to stop. Press it while holding to keep going."
          keys={hotkeys.toggle}
          names={view.keyNames}
          onChange={(toggle) => update({ hotkeys: { toggle } })}
        />
      </Group>
      {sameKeys(hotkeys.hold, hotkeys.toggle) && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-warning">
          <TriangleAlert className="size-3.5" />
          Both shortcuts are identical, so hold to talk will never trigger.
        </p>
      )}
    </Page>
  )
}

function HotkeyRow({
  title,
  description,
  keys,
  names,
  onChange
}: {
  title: string
  description: string
  keys: number[] | null
  names: Record<number, string>
  onChange: (keys: number[] | null) => void
}): ReactNode {
  const [recording, setRecording] = useState(false)

  const record = (): void => {
    setRecording(true)
    void api.recordHotkey().then((combo) => {
      setRecording(false)
      if (combo) onChange(combo)
    })
  }

  return (
    <Row title={title} description={description}>
      <div className="flex min-w-24 justify-end gap-1">
        {recording ? (
          <span className="animate-pulse text-xs text-muted-foreground">Press keys…</span>
        ) : keys && keys.length ? (
          keys.map((k) => <Kbd key={k}>{names[k] ?? `#${k}`}</Kbd>)
        ) : (
          <span className="text-xs text-subtle">Off</span>
        )}
      </div>
      {keys && !recording && (
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onChange(null)}>
          Disable
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={record} disabled={recording}>
        {recording ? 'Recording' : 'Change'}
      </Button>
    </Row>
  )
}

function sameKeys(a: number[] | null, b: number[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false
  return a.every((k) => b.includes(k))
}
