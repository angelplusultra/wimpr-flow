import type { ReactNode } from 'react'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'

export function Page({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto max-w-[640px] px-10 pt-12 pb-14">
      <h1 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  )
}

export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-xs font-medium text-muted-foreground">{title}</h2>}
      <ItemGroup className="divide-y divide-border overflow-hidden rounded-lg border bg-card">{children}</ItemGroup>
      {footer && <p className="px-1 text-xs leading-relaxed text-subtle">{footer}</p>}
    </section>
  )
}

/** One setting: title and description on the left, its control on the right. */
export function Row({
  title,
  description,
  children,
  className
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}): ReactNode {
  return (
    // Item draws its own (transparent) border, which hides the group's dividers; draw them here.
    <Item
      size="sm"
      role="listitem"
      className={cn(
        'min-h-14 flex-nowrap gap-6 rounded-none border-0 px-4 not-last:border-b not-last:border-border',
        className
      )}
    >
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="text-[13px]">{title}</ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-none text-xs leading-relaxed text-pretty">{description}</ItemDescription>
        )}
      </ItemContent>
      {children && <ItemActions className="shrink-0">{children}</ItemActions>}
    </Item>
  )
}

/** Small status dot. `busy` pulses. */
export function Dot({ tone }: { tone: 'ok' | 'busy' | 'off' | 'error' | 'warn' }): ReactNode {
  return (
    <span
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        tone === 'ok' && 'bg-foreground',
        tone === 'busy' && 'animate-pulse bg-muted-foreground',
        tone === 'off' && 'bg-subtle',
        tone === 'error' && 'bg-destructive',
        tone === 'warn' && 'bg-warning'
      )}
    />
  )
}

export function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`
}
