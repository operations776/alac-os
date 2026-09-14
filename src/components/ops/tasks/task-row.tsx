/**
 * A task row. Used everywhere a list of tasks appears.
 *
 * Completing, reprioritizing and rescheduling all happen inline, updating
 * status should never cost a page load.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { workLink } from '@/lib/ops/work-link'
import { Check, ListChecks, MessageSquare } from 'lucide-react'
import { Avatar } from '@/components/ops/ui/primitives'
import { DueDate, PriorityDot, RecurringBadge, StatusBadge } from '@/components/ops/badges'
import { updateTask } from '@/lib/server/ops/actions'
import { cn } from '@/lib/ops/utils'
import type { TaskRow as Task } from '@/types/ops'

export function TaskRow({
  task, onOpen, showProject = true,
}: {
  task: Task
  onOpen: (t: Task) => void
  showProject?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Optimistic: the tick should feel instant even though the round trip
  // recomputes the project's task counts.
  const [done, setDone] = useState(task.status === 'done')

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !done
    setDone(next)
    start(async () => {
      const r = await updateTask(task.id, { status: next ? 'done' : 'todo' })
      if (!r.ok) setDone(!next)
      router.refresh()
    })
  }

  const checks = task.checklist_total ?? 0

  return (
    <div
      onClick={() => {
        // A generated item opens the thing it is about. Only an ordinary
        // task belongs in the drawer, where status and checklists matter.
        const link = workLink(task)
        if (link) router.push(link.href)
        else onOpen(task)
      }}
      title={workLink(task)?.label}
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0',
        'hover:bg-[var(--surface-hover)]',
        pending && 'opacity-60',
      )}
    >
      <button
        onClick={toggle}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          done ? 'border-emerald-500 bg-emerald-500 text-white'
               : 'border-[var(--border-strong)] hover:border-emerald-500',
        )}
      >
        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </button>

      <PriorityDot p={task.priority} />

      <span className={cn('min-w-0 flex-1 truncate text-xs',
                          done ? 'text-[var(--text-muted)] line-through' : 'font-medium')}>
        {task.title}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {task.recurring_id && <RecurringBadge />}
        {checks > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] tabular text-[var(--text-muted)]">
            <ListChecks className="h-3 w-3" />
            {task.checklist_done}/{checks}
          </span>
        )}
        {(task.comment_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] tabular text-[var(--text-muted)]">
            <MessageSquare className="h-3 w-3" />
            {task.comment_count}
          </span>
        )}
      </div>

      {showProject && task.project && (
        <span className="hidden w-40 shrink-0 truncate text-[10px] text-[var(--text-muted)] lg:block">
          {task.project.name}
        </span>
      )}

      <div className="hidden w-20 shrink-0 md:block">
        <StatusBadge s={done ? 'done' : task.status} />
      </div>

      <div className="w-6 shrink-0">
        {task.assignee && (
          <Avatar id={task.assignee.id} name={task.assignee.name}
                  src={task.assignee.avatar_url} size="sm" />
        )}
      </div>

      <div className="w-20 shrink-0 text-right">
        <DueDate date={task.due_date} done={done} icon={false} />
      </div>
    </div>
  )
}

/** A collapsible group of tasks with a colored rail and a count. */
export function TaskGroup({
  title, tasks, onOpen, empty, accent, showProject = true,
}: {
  title: string
  tasks: Task[]
  onOpen: (t: Task) => void
  empty?: string
  accent?: string
  showProject?: boolean
}) {
  const [open, setOpen] = useState(true)
  if (!tasks.length && !empty) return null

  return (
    <section className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
      >
        {accent && <span className={cn('h-3 w-1 rounded-full', accent)} />}
        <span className="text-xs font-semibold">{title}</span>
        <span className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] tabular text-[var(--text-muted)]">
          {tasks.length}
        </span>
      </button>

      {open && (tasks.length ? (
        <div>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} showProject={showProject} />
          ))}
        </div>
      ) : (
        <p className="px-3 py-4 text-center text-[11px] text-[var(--text-muted)]">{empty}</p>
      ))}
    </section>
  )
}
