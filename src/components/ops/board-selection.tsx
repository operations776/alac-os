/**
 * Selection and bulk actions for any kanban (spec §1-4, §25-27).
 *
 * One component so every board behaves identically: the same checkbox, the
 * same bar, the same confirmation. Archive is an ordinary action; delete asks
 * first and is refused for anyone below admin (§27).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, CheckSquare, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ops/ui/primitives'
import {
  archiveRecords, deleteRecords, setPriorityForRecords,
} from '@/lib/server/ops/actions'
import { atLeast, PRIORITIES, PRIORITY } from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person } from '@/types/ops'

export type BoardKind = 'task' | 'content' | 'gtm_account'

/** Selection state, shared by the toolbar and the cards. */
export function useSelection() {
  const [on, setOn] = useState(false)
  const [ids, setIds] = useState<Set<string>>(new Set())

  return {
    active: on,
    ids,
    count: ids.size,
    has: (id: string) => ids.has(id),
    toggleMode: () => { setOn((v) => !v); setIds(new Set()) },
    toggle: (id: string) => setIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    }),
    selectAll: (all: string[]) => setIds(new Set(all)),
    clear: () => setIds(new Set()),
  }
}

/** The checkbox on a card. Visible in selection mode, out of the way otherwise. */
export function SelectBox({
  checked, onChange,
}: {
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange() }}
      className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)]"
      aria-label={checked ? 'Deselect' : 'Select'}
    >
      {checked
        ? <CheckSquare className="h-3.5 w-3.5 text-[var(--accent)]" />
        : <Square className="h-3.5 w-3.5" />}
    </button>
  )
}

/**
 * The bulk action bar.
 *
 * Appears only when something is selected, so the board is not permanently
 * cluttered with a toolbar nobody is using (§2).
 */
export function BulkBar({
  kind, selection, me, allIds, onDone,
}: {
  kind: BoardKind
  selection: ReturnType<typeof useSelection>
  me: Person
  allIds: string[]
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canDelete = atLeast(me.role, 'admin')

  if (!selection.active) return null

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setConfirming(null); setError(null)
      selection.clear(); onDone?.()
      router.refresh()
    })

  const ids = [...selection.ids]

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="text-xs font-medium tabular">
        {selection.count} selected
      </span>

      {selection.count === 0 && (
        <Button size="xs" variant="ghost"
                onClick={() => selection.selectAll(allIds)}>
          Select all {allIds.length}
        </Button>
      )}

      {confirming === null ? (
        <>
          {selection.count > 0 && (
            <>
              <Button size="xs" variant="secondary"
                      onClick={() => setConfirming('archive')}>
                <Archive className="h-3 w-3" /> Archive
              </Button>
              <Button
                size="xs" variant="ghost"
                onClick={() => canDelete
                  ? setConfirming('delete')
                  : setError('Only an owner or admin can delete records.')}
                title={canDelete ? undefined : 'Requires owner or admin'}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>

              {/* Re-prioritising one card at a time is work nobody does, which
                  is how a board ends up mostly high priority. */}
              {/* Content has no priority column, so the control is not offered there. */}
              {kind !== 'content' && <span className="ml-1 flex items-center gap-1 border-l border-[var(--border)] pl-2">
                <span className="text-[10px] text-[var(--text-muted)]">
                  Priority
                </span>
                {PRIORITIES.map((pr) => (
                  <Button
                    key={pr}
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => setPriorityForRecords(kind, ids, pr))}
                    title={`Set ${selection.count} to ${PRIORITY[pr].label}`}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY[pr].dot)} />
                    {PRIORITY[pr].label}
                  </Button>
                ))}
              </span>}
            </>
          )}
          <Button size="xs" variant="ghost" className="ml-auto"
                  onClick={selection.toggleMode}>
            <X className="h-3 w-3" /> Done
          </Button>
        </>
      ) : (
        <>
          {/* §3 destructive actions ask first. */}
          <span className="text-xs">
            {confirming === 'delete'
              ? `Permanently delete ${selection.count} item${selection.count === 1 ? '' : 's'}?`
              : `Archive ${selection.count} item${selection.count === 1 ? '' : 's'}? They stay searchable.`}
          </span>
          <Button
            size="xs"
            variant={confirming === 'delete' ? 'danger' : 'primary'}
            disabled={pending}
            onClick={() => run(() => confirming === 'delete'
              ? deleteRecords(kind, ids)
              : archiveRecords(kind, ids))}
          >
            {pending ? 'Working…' : confirming === 'delete' ? 'Delete' : 'Archive'}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </>
      )}

      {error && (
        <span className={cn('text-[11px] text-rose-600 dark:text-rose-400')}>
          {error}
        </span>
      )}
    </div>
  )
}
