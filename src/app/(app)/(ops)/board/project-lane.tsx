'use client'

/**
 * Projects, as a view of the board rather than a place of their own.
 *
 * A project is a container for tasks that already exist here, not a second
 * task system. Keeping it as a board view rather than a separate page is
 * what stops the same task being managed in two places and drifting.
 *
 * Unlike the function and person lanes, this shows project cards rather than
 * columns of tasks: what you want from a project list is which ones are
 * moving and which are stuck, and that is a property of the project, not of
 * any one task in it.
 */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, EmptyState, Panel } from '@/components/ops/ui/primitives'
import { cn, formatDate, isOverdue } from '@/lib/ops/utils'
import type { Person, Project, TaskRow } from '@/types/ops'

interface Fn { id: string; name: string; color?: string | null }

const HEALTH: Record<string, { label: string; chip: string }> = {
  on_track: { label: 'On track', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  watch:    { label: 'Watch',    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  at_risk:  { label: 'At risk',  chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
}

export function ProjectLane({
  projects, tasks, people, functions, fn, who, onOpen, onNew,
}: {
  projects: Project[]
  tasks: TaskRow[]
  people: Person[]
  functions: Fn[]
  /** The board's own filters, applied to projects rather than to tasks. */
  fn: string
  who: string
  onOpen: (p: Project) => void
  onNew: () => void
}) {
  const [showFinished, setShowFinished] = useState(false)

  const rows = useMemo(() => {
    const live = projects.filter((p) => {
      if (p.deleted_at) return false
      const finished = p.status === 'archived' || Boolean(p.archived_at)
      if (!showFinished && finished) return false
      if (fn && p.function_id !== fn) return false
      // Owner first, as the spec's default. A project nobody owns still
      // shows when its tasks belong to the filtered person, since that is
      // work they are carrying.
      if (who && p.owner_id !== who
          && !tasks.some((t) => t.project_id === p.id && t.assignee_id === who)) {
        return false
      }
      return true
    })

    // The stored counts, not the board's tasks: the board excludes archived
    // work, and completing a task archives it, so counting cards would show
    // every project at 0 done however much had actually been finished.
    return live.map((p) => {
      const mine = tasks.filter((t) => t.project_id === p.id)
      const total = p.task_count ?? mine.length
      const done = p.done_count ?? mine.filter((t) => t.status === 'done').length
      return {
        project: p,
        total,
        done,
        late: mine.filter((t) => t.status !== 'done' && isOverdue(t.due_date)).length,
        fnName: functions.find((f) => f.id === p.function_id)?.name,
        owner: people.find((x) => x.id === p.owner_id)?.name,
      }
    })
  }, [projects, tasks, people, functions, fn, who, showFinished])

  // Grouped by function, as the spec describes.
  const groups = useMemo(() => {
    const byFn = new Map<string, typeof rows>()
    for (const r of rows) {
      const key = r.fnName ?? 'No function'
      byFn.set(key, [...(byFn.get(key) ?? []), r])
    }
    return [...byFn.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <input type="checkbox" checked={showFinished}
                 onChange={(e) => setShowFinished(e.target.checked)} />
          Show finished
        </label>
        <Button size="xs" onClick={onNew}>
          <Plus className="h-3 w-3" /> New project
        </Button>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title={showFinished ? 'No projects' : 'No active projects'}
            description="A project groups tasks that already live on this board."
          />
        </Panel>
      ) : (
        groups.map(([fnName, list]) => (
          <section key={fnName}>
            <p className="section-label mb-1.5">{fnName}</p>
            <div className="space-y-1.5">
              {list.map(({ project: p, total, done, late, owner }) => {
                const pct = total ? Math.round((done / total) * 100) : 0
                const h = HEALTH[p.health ?? 'on_track']
                return (
                  <button
                    key={p.id}
                    onClick={() => onOpen(p)}
                    className="flex w-full flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        {owner && <span>{owner}</span>}
                        {p.due_date && (
                          <span className={cn(
                            isOverdue(p.due_date) && p.status !== 'archived'
                              && 'text-rose-600 dark:text-rose-400',
                          )}>
                            Due {formatDate(p.due_date)}
                          </span>
                        )}
                        {late > 0 && (
                          <span className="text-rose-600 dark:text-rose-400">
                            {late} late
                          </span>
                        )}
                      </span>
                    </span>

                    {/* A project with no tasks reads 0/0 rather than a
                        percentage of nothing. */}
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-9 text-right text-[10px] tabular text-[var(--text-muted)]">
                        {done}/{total}
                      </span>
                      {h && (
                        <span className={cn('rounded-[3px] px-1.5 py-0.5 text-[10px]', h.chip)}>
                          {h.label}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
