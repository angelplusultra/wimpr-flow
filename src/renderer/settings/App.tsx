import { AudioLines, BookOpen, Keyboard, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { CleanupStatus, EngineStatus, ModelInfo, PermissionStatus, SettingsPatch, SettingsView } from '../../shared/types'
import { Dot, Logo } from './layout'
import { CleanupPage, DictionaryPage, GeneralPage, ModelsPage, ShortcutsPage } from './pages'

const api = window.fwf.settings

type PageId = 'general' | 'models' | 'cleanup' | 'dictionary' | 'shortcuts'

const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'models', label: 'Speech model', icon: AudioLines },
  { id: 'cleanup', label: 'AI cleanup', icon: Sparkles },
  { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard }
]

export function App(): ReactNode {
  const [page, setPage] = useState<PageId>('general')
  const [view, setView] = useState<SettingsView | null>(null)
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [cleanup, setCleanup] = useState<CleanupStatus | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])

  const refreshModels = useCallback(() => void api.listModels().then(setModels), [])

  useEffect(() => {
    void api.get().then(setView)
    void api.getEngineStatus().then(setEngine)
    void api.getCleanupStatus().then(setCleanup)
    refreshModels()
    const offs = [
      api.onChange(setView),
      api.onEngineStatus(setEngine),
      api.onCleanupStatus(setCleanup),
      api.onModelProgress((p) => p.done && refreshModels())
    ]
    void api.set({ onboarded: true })
    return () => offs.forEach((off) => off())
  }, [refreshModels])

  // Permissions are granted in System Settings, so poll while the window is open.
  useEffect(() => {
    const refresh = (): void => void api.getPermissions().then(setPermissions)
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [])

  const update = useCallback((patch: SettingsPatch) => void api.set(patch).then(setView), [])

  if (!view) return null
  const { settings } = view
  const needsPermissions = !!permissions && (permissions.microphone !== 'granted' || !permissions.accessibility)
  const modelName = models.find((m) => m.id === (engine?.modelId ?? settings.model))?.name ?? 'Speech model'

  return (
    <div className="flex h-screen overflow-hidden select-none">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        {/* Room for the traffic lights; doubles as a drag handle. */}
        <div className="h-12 shrink-0 [-webkit-app-region:drag]" />
        <div className="flex items-center gap-2.5 px-4 pb-5">
          <div className="flex size-6 items-center justify-center rounded-md border bg-card">
            <Logo className="size-3.5" />
          </div>
          <span className="text-[13px] font-semibold tracking-[-0.01em]">Fuck Wispr Flow</span>
        </div>
        <nav className="flex flex-col gap-px px-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                page === id && 'bg-accent text-foreground'
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
              {id === 'general' && needsPermissions && (
                <span className="ml-auto">
                  <Dot tone="warn" />
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t px-4 py-4 text-xs">
          <StatusLine label={modelName} tone={engineTone(engine)} state={engineState(engine)} />
          {cleanup && <StatusLine label="AI cleanup" tone={cleanupTone(cleanup)} state={cleanupState(cleanup)} />}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0 z-10 h-10 [-webkit-app-region:drag]" />
        <ScrollArea className="h-full">
          {page === 'general' && (
            <GeneralPage settings={settings} permissions={permissions} onPermissions={setPermissions} update={update} />
          )}
          {page === 'models' && (
            <ModelsPage
              selected={settings.model}
              engine={engine}
              onSelect={(model) => update({ model })}
              onModelsChanged={refreshModels}
            />
          )}
          {page === 'cleanup' && (
            <CleanupPage
              enabled={settings.cleanup}
              status={cleanup}
              onToggle={(on) => update({ cleanup: on })}
              onStatus={setCleanup}
            />
          )}
          {page === 'dictionary' && <DictionaryPage settings={settings} engine={engine} update={update} />}
          {page === 'shortcuts' && <ShortcutsPage view={view} update={update} />}
        </ScrollArea>
      </main>
    </div>
  )
}

function StatusLine({ label, tone, state }: { label: string; tone: Parameters<typeof Dot>[0]['tone']; state: string }): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <Dot tone={tone} />
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="ml-auto shrink-0 text-subtle">{state}</span>
    </div>
  )
}

type Tone = Parameters<typeof Dot>[0]['tone']

function engineTone(engine: EngineStatus | null): Tone {
  if (!engine) return 'off'
  return engine.state === 'ready' ? 'ok' : engine.state === 'error' ? 'error' : engine.state === 'idle' ? 'off' : 'busy'
}

function engineState(engine: EngineStatus | null): string {
  switch (engine?.state) {
    case 'ready':
      return 'Ready'
    case 'downloading':
      return engine.message ?? 'Downloading'
    case 'loading':
      return 'Loading'
    case 'error':
      return 'Error'
    default:
      return '—'
  }
}

function cleanupTone(status: CleanupStatus): Tone {
  if (status.state === 'ready') return 'ok'
  if (status.state === 'error') return 'error'
  if (status.state === 'off' || status.state === 'idle') return 'off'
  return 'busy'
}

function cleanupState(status: CleanupStatus): string {
  switch (status.state) {
    case 'ready':
      return 'Ready'
    case 'off':
      return 'Off'
    case 'downloading':
      return status.message ?? 'Downloading'
    case 'loading':
      return 'Loading'
    case 'error':
      return 'Error'
    default:
      return '—'
  }
}
