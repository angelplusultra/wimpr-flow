import type { ReactNode } from 'react'
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
      <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">{children}</div>
      {footer && <p className="px-1 text-xs leading-relaxed text-subtle">{footer}</p>}
    </section>
  )
}

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
    <div className={cn('flex min-h-14 items-center justify-between gap-6 px-4 py-3', className)}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
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

/** The app mark: the icon's waveform. */
export function Logo({ className }: { className?: string }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4', className)} fill="currentColor" aria-hidden>
      <rect x="2.5" y="9" width="2.6" height="6" rx="1.3" />
      <rect x="7" y="5.5" width="2.6" height="13" rx="1.3" />
      <rect x="11.5" y="2.5" width="2.6" height="19" rx="1.3" />
      <rect x="16" y="6" width="2.6" height="12" rx="1.3" />
      <rect x="20.5" y="9.5" width="2.6" height="5" rx="1.3" />
    </svg>
  )
}

export function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`
}
