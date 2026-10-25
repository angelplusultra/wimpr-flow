import { AppWindowMac, AtSign, LoaderCircle, TriangleAlert, UserPlus, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type {
  AppInfo,
  AppRule,
  CleanupStatus,
  MentionApp,
  Person,
  Settings,
  SettingsPatch
} from '../../shared/types'
import { useDraft } from './draft'
import { formatSize, Group, Page, Row } from './layout'

const api = window.fwf.settings

type Update = (patch: SettingsPatch) => void

export function CleanupPage({
  settings,
  status,
  update,
  onStatus
}: {
  settings: Settings
  status: CleanupStatus | null
  update: Update
  onStatus: (s: CleanupStatus) => void
}): ReactNode {
  return (
    <Page title="AI cleanup" description="A small local language model tidies every transcript before it's pasted.">
      <Tabs defaultValue="overview" className="-mt-2 gap-8">
        <TabsList variant="line" className="h-9 w-full justify-start gap-5 rounded-none border-b p-0">
          <TabsTrigger value="overview" className="flex-none px-0 text-[13px]">
            Overview
          </TabsTrigger>
          <TabsTrigger value="people" className="flex-none px-0 text-[13px]">
            People
            {settings.people.length > 0 && <Count n={settings.people.length} />}
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex-none px-0 text-[13px]">
            App rules
            {settings.appRules.length > 0 && <Count n={settings.appRules.length} />}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-8">
          <Overview enabled={settings.cleanup} status={status} update={update} onStatus={onStatus} />
        </TabsContent>
        <TabsContent value="people" className="space-y-8">
          <PeopleTab settings={settings} update={update} />
        </TabsContent>
        <TabsContent value="rules" className="space-y-8">
          <RulesTab settings={settings} update={update} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function Count({ n }: { n: number }): ReactNode {
  return (
    <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
      {n}
    </Badge>
  )
}

function CleanupOffNote({ what }: { what: string }): ReactNode {
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-warning">
      <TriangleAlert className="size-3.5" />
      AI cleanup is off, so {what}.
    </p>
  )
}

/** Title and blurb above a list, with an optional action on the right. */
function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }): ReactNode {
  return (
    <div className="flex items-end justify-between gap-4 px-1">
      <div>
        <h2 className="text-[13px] font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------- Overview

const CLEANUP_OUTCOME: Record<NonNullable<CleanupStatus['last']>['outcome'], string> = {
  applied: '',
  unchanged: ' · nothing to change',
  rejected: ' · strayed from what you said, pasted raw',
  timeout: ' · too slow, pasted raw',
  error: ' · failed, pasted raw'
}

function cleanupSummary(status: CleanupStatus): ReactNode {
  switch (status.state) {
    case 'off':
      return 'Off — transcripts are pasted exactly as the speech model wrote them.'
    case 'downloading':
      return <>Downloading {formatSize(status.sizeMb)}… {status.message}. Until then, text is pasted as-is.</>
    case 'loading':
      return 'Loading…'
    case 'error':
      return <span className="text-destructive">{status.message}</span>
    case 'ready':
      return status.last ? (
        <>
          Last cleanup <span className="text-foreground tabular-nums">{(status.last.ms / 1000).toFixed(2)}s</span>
          {CLEANUP_OUTCOME[status.last.outcome]}
        </>
      ) : (
        'Ready'
      )
    default:
      return null
  }
}

function Overview({
  enabled,
  status,
  update,
  onStatus
}: {
  enabled: boolean
  status: CleanupStatus | null
  update: Update
  onStatus: (s: CleanupStatus) => void
}): ReactNode {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const last = status?.last
  return (
    <>
      <Group footer="Uses your dictionary for spellings. If cleanup is slow or changes what you said, the raw transcript is pasted instead.">
        <Row title="Clean up transcripts" description="Punctuation, capitalization, filler words, emails and numbers.">
          <Switch checked={enabled} onCheckedChange={(cleanup) => update({ cleanup })} />
        </Row>
        {status && (
          <Row
            title={
              <>
                {status.modelName}
                <span className="text-xs font-normal text-subtle">Google · {formatSize(status.sizeMb)}</span>
              </>
            }
            description={cleanupSummary(status)}
          >
            {(status.state === 'loading' || status.state === 'downloading') && (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            )}
            {!enabled &&
              status.downloaded &&
              (confirmDelete ? (
                <Button size="sm" variant="destructive" onClick={() => void api.deleteCleanupModel().then(onStatus)}>
                  Delete {formatSize(status.sizeMb)}?
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete model
                </Button>
              ))}
          </Row>
        )}
      </Group>

      {last && (
        <Group
          title={[
            'Last dictation',
            last.app,
            last.mentions && 'mentions',
            last.ruleApplied && 'app rule'
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <Transcript label="Heard" text={last.raw} muted />
          <Transcript label="Pasted" text={last.text} />
        </Group>
      )}
    </>
  )
}

function Transcript({ label, text, muted }: { label: string; text: string; muted?: boolean }): ReactNode {
  return (
    <div className="flex gap-4 px-4 py-3">
      <div className="w-14 shrink-0 pt-px text-xs text-subtle">{label}</div>
      <p className={'min-w-0 text-[13px] leading-relaxed select-text ' + (muted ? 'text-muted-foreground' : 'text-foreground')}>
        {text}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- People

const splitList = (text: string): string[] =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function PeopleTab({ settings, update }: { settings: Settings; update: Update }): ReactNode {
  const { people, mentionApps } = settings
  const enabledApps = mentionApps.filter((a) => a.enabled)
  const setPeople = (next: Person[]): void => update({ people: next })
  const patchPerson = (id: string, patch: Partial<Person>): void =>
    setPeople(people.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addPerson = (): void => setPeople([...people, { id: crypto.randomUUID(), name: '', aliases: [], handles: {} }])
  const setApps = (next: MentionApp[]): void => update({ mentionApps: next })

  const addButton = (
    <Button size="sm" variant="outline" onClick={addPerson}>
      <UserPlus />
      Add person
    </Button>
  )

  return (
    <>
      {!settings.cleanup && <CleanupOffNote what="mentions aren't written" />}

      <section className="space-y-3">
        <SectionHeader
          title="People"
          description="Say a name, get their @mention in the apps below."
          action={people.length > 0 ? addButton : undefined}
        />
        {people.length === 0 ? (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AtSign />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No people yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Add the people you mention most. Say "hey sean" in Slack and get @sean.kelly.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              apps={enabledApps}
              onChange={(patch) => patchPerson(person.id, patch)}
              onRemove={() => setPeople(people.filter((p) => p.id !== person.id))}
            />
          ))
        )}
      </section>

      <Group title="Mention apps" footer="Only running apps can be added.">
        {mentionApps.map((app) => (
          <Row key={app.bundleId} title={app.name} description={app.bundleId}>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setApps(mentionApps.filter((a) => a.bundleId !== app.bundleId))}
            >
              Remove
            </Button>
            <Switch
              checked={app.enabled}
              onCheckedChange={(enabled) =>
                setApps(mentionApps.map((a) => (a.bundleId === app.bundleId ? { ...a, enabled } : a)))
              }
            />
          </Row>
        ))}
        <Row title="Add an app">
          <AppPicker
            taken={mentionApps}
            placeholder="Choose an app…"
            onPick={(app) => setApps([...mentionApps, { ...app, enabled: true }])}
          />
        </Row>
        <Row title="Mention people not in your list" description="Writes them as @Name. Off: only the people above.">
          <Switch checked={settings.mentionOthers} onCheckedChange={(mentionOthers) => update({ mentionOthers })} />
        </Row>
      </Group>
    </>
  )
}

function PersonCard({
  person,
  apps,
  onChange,
  onRemove
}: {
  person: Person
  apps: MentionApp[]
  onChange: (patch: Partial<Person>) => void
  onRemove: () => void
}): ReactNode {
  const name = useDraft(person.name, (v) => onChange({ name: v.trim() }))
  const aliases = useDraft(person.aliases.join(', '), (v) => onChange({ aliases: splitList(v) }))
  const id = (field: string): string => `person-${person.id}-${field}`

  return (
    <Card className="relative gap-0 rounded-lg py-0 shadow-none">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${person.name || 'person'}`}
        className="absolute top-2.5 right-2.5 size-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X />
      </Button>
      <FieldGroup className="gap-5 p-4 pr-12">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor={id('name')} className="text-xs text-muted-foreground">
              Name
            </FieldLabel>
            <Input id={id('name')} placeholder="Sean" spellCheck={false} className="h-8 text-[13px] md:text-[13px]" {...name} />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={id('aliases')} className="text-xs text-muted-foreground">
              Also heard as
            </FieldLabel>
            <Input
              id={id('aliases')}
              placeholder="Other spellings (optional)"
              spellCheck={false}
              className="h-8 text-[13px] md:text-[13px]"
              {...aliases}
            />
          </Field>
        </div>
        {apps.length > 0 && (
          <Field className="gap-1.5">
            <FieldLabel className="text-xs text-muted-foreground">Mentions</FieldLabel>
            <div className="grid gap-2">
              {apps.map((app) => (
                <HandleInput
                  key={app.bundleId}
                  app={app}
                  person={person}
                  onCommit={(handle) => onChange({ handles: { ...person.handles, [app.bundleId]: handle.trim() } })}
                />
              ))}
            </div>
            <FieldDescription className="text-xs">Leave empty to use @{person.name || 'Name'}.</FieldDescription>
          </Field>
        )}
      </FieldGroup>
    </Card>
  )
}

function HandleInput({
  app,
  person,
  onCommit
}: {
  app: MentionApp
  person: Person
  onCommit: (handle: string) => void
}): ReactNode {
  const handle = useDraft(person.handles[app.bundleId] ?? '', onCommit)
  return (
    <InputGroup className="h-8">
      <InputGroupAddon className="w-32 justify-start text-xs font-normal">{app.name}</InputGroupAddon>
      <InputGroupInput
        aria-label={`${person.name || 'Person'} in ${app.name}`}
        placeholder={`@${person.name || 'Name'}`}
        spellCheck={false}
        className="text-[13px] md:text-[13px]"
        {...handle}
      />
    </InputGroup>
  )
}

// ---------------------------------------------------------------- App rules

function RulesTab({ settings, update }: { settings: Settings; update: Update }): ReactNode {
  const rules = settings.appRules
  const setRules = (appRules: AppRule[]): void => update({ appRules })
  const patchRule = (bundleId: string, patch: Partial<AppRule>): void =>
    setRules(rules.map((r) => (r.bundleId === bundleId ? { ...r, ...patch } : r)))
  const picker = (
    <AppPicker taken={rules} onPick={(app) => setRules([...rules, { ...app, instructions: '', enabled: true }])} />
  )

  return (
    <>
      {!settings.cleanup && <CleanupOffNote what="app rules aren't applied" />}
      <section className="space-y-3">
        <SectionHeader
          title="App rules"
          description="Plain-English instructions for one app. For @mentions, use People."
          action={rules.length > 0 ? picker : undefined}
        />
        {rules.length === 0 ? (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AppWindowMac />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No app rules</EmptyTitle>
              <EmptyDescription className="text-xs">
                E.g. "Keep it casual, all lowercase" for Messages, or "Formal, no contractions" for Mail.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{picker}</EmptyContent>
          </Empty>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.bundleId}
              rule={rule}
              onChange={(patch) => patchRule(rule.bundleId, patch)}
              onRemove={() => setRules(rules.filter((r) => r.bundleId !== rule.bundleId))}
            />
          ))
        )}
      </section>
    </>
  )
}

function RuleCard({
  rule,
  onChange,
  onRemove
}: {
  rule: AppRule
  onChange: (patch: Partial<AppRule>) => void
  onRemove: () => void
}): ReactNode {
  const instructions = useDraft(rule.instructions, (v) => onChange({ instructions: v }))
  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0 shadow-none">
      <Item size="sm" className="rounded-none border-b px-4">
        <ItemContent className="gap-0.5">
          <ItemTitle className="text-[13px]">{rule.name}</ItemTitle>
          <ItemDescription className="text-xs">{rule.bundleId}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onRemove}>
            Remove
          </Button>
          <Switch
            aria-label={`Apply the ${rule.name} rule`}
            checked={rule.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </ItemActions>
      </Item>
      <Textarea
        rows={3}
        spellCheck={false}
        aria-label={`Instructions for ${rule.name}`}
        placeholder={`How should text be written in ${rule.name}?`}
        className="min-h-0 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
        {...instructions}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- Shared

/** Running apps not already in `taken`, as a picker that resets after each choice. */
function AppPicker({
  taken,
  onPick,
  placeholder = 'Add an app…'
}: {
  taken: readonly AppInfo[]
  onPick: (app: AppInfo) => void
  placeholder?: string
}): ReactNode {
  const [running, setRunning] = useState<AppInfo[]>([])
  useEffect(() => void api.runningApps().then(setRunning), [taken.length])
  const addable = running.filter((a) => !taken.some((t) => t.bundleId === a.bundleId))
  return (
    <Select
      key={taken.length}
      onValueChange={(bundleId) => {
        const app = running.find((a) => a.bundleId === bundleId)
        if (app) onPick(app)
      }}
    >
      <SelectTrigger size="sm" className="h-7 w-44 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {addable.map((a) => (
          <SelectItem key={a.bundleId} value={a.bundleId}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
