/**
 * Potential duplicate warning (spec §5.1).
 *
 * Shown before something is created, never after. It warns and never blocks:
 * the person can open what already exists, or create anyway as an explicit
 * override. Defaulting to "use the existing one" is the whole point, the
 * cheapest duplicate is the one that never gets made.
 */
'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ops/ui/primitives'
import { cn } from '@/lib/ops/utils'
import type { DuplicateHit } from '@/lib/server/ops/actions'

export function DuplicateWarning({
  hits, onUseExisting, onCreateAnyway, onCancel, openHref,
}: {
  hits: DuplicateHit[]
  onUseExisting?: (id: string) => void
  onCreateAnyway: () => void
  onCancel: () => void
  openHref?: (id: string) => string
}) {
  if (!hits.length) return null
  const exact = hits.some((h) => h.confidence === 'exact')

  return (
    <div className="rounded-[3px] border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-950/30">
      <div className="mb-2 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            {exact ? 'This already exists' : 'This might already exist'}
          </p>
          <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
            Review what is already here before creating another.
          </p>
        </div>
      </div>

      <ul className="mb-2 space-y-1">
        {hits.map((h) => (
          <li key={h.id}
              className="flex items-center gap-2 rounded-[3px] bg-[var(--surface-raised)] px-2 py-1.5">
            <span className={cn(
              'shrink-0 rounded-[3px] px-1 py-px text-[9px] font-medium uppercase',
              h.confidence === 'exact'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
            )}>
              {h.confidence}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium">{h.title}</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {h.reason} · {h.context}
              </p>
            </div>
            {openHref && (
              <a href={openHref(h.id)} target="_blank" rel="noreferrer"
                 className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                 title="Open the existing record">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {onUseExisting && (
              <Button size="xs" variant="secondary"
                      onClick={() => onUseExisting(h.id)}>
                Use this
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Button size="xs" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" variant="ghost" onClick={onCreateAnyway}>
          Create anyway
        </Button>
      </div>
    </div>
  )
}
