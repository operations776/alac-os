/**
 * Board. Four columns: To Do, Doing, Waiting, Done.
 *
 * Cards move in local state on drop and the server call runs behind them, so
 * dragging never waits on a round trip.
 */
'use client'

import { Plus } from 'lucide-react'
import { Avatar } from '@/components/ops/ui/primitives'
import {
  ClientBadge, DueDate, OverdueBadge, PriorityBadge, RecurringBadge,
} from '@/components/ops/badges'
import { BoardDnd, DragCard, DropColumn, MoveError } from '@/components/ops/dnd'
import { updateTask } from '@/lib/server/ops/actions'
import { STATUS, STATUSES, priorityStyle } from '@/lib/ops/constants'
import { useKanban } from '@/lib/ops/kanban'
import { cn, formatDateShort, formatTime, isOverdue } from '@/lib/ops/utils'
import type { TaskRow, TaskStatus } from '@/types/ops'

export function Board({
  tasks, onOpen, onAdd, clientFor, showProject = true,
}: {
  tasks: TaskRow[]
  onOpen: (t: TaskRow) => void
  onAdd?: (status: TaskStatus) => void
  clientFor?: Map<string, string>
  /** Off on a project board, where every card belongs to the same project. */
  showProject?: boolean
}) {
  // The same optimistic lifecycle as every other board: the card stays where
  // it was dropped unless the server refuses, and then it says why.
  const kanban = useKanban<TaskRow, TaskStatus>({
    rows: tasks,
    field: 'status',
    stages: STATUSES,
    save: (id, stage) => updateTask(id, { status: stage }),
  })
  const shown = kanban.view

  return (
    <BoardDnd
      id="project-board"
      onDragEnd={kanban.onDragEnd}
      overlay={(id) => {
        const t = shown.find((x) => x.id === id)
        return t && <Card task={t} onOpen={() => {}} clientFor={clientFor}
                          showProject={showProject} />
      }}
    >
      <MoveError message={kanban.error} onDismiss={kanban.dismissError} />
      <div className="grid h-full grid-cols-5 gap-2.5">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={shown.filter((t) => t.status === s)}
            onOpen={onOpen}
            onAdd={onAdd}
            clientFor={clientFor}
            showProject={showProject}
          />
        ))}
      </div>
    </BoardDnd>
  )
}

function Column({
  status, tasks, onOpen, onAdd, clientFor, showProject,
}: {
  status: TaskStatus
  tasks: TaskRow[]
  onOpen: (t: TaskRow) => void
  onAdd?: (s: TaskStatus) => void
  clientFor?: Map<string, string>
  showProject: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS[status].dot)} />
        <span className="text-[11px] font-semibold" title={STATUS[status].hint}>
          {STATUS[status].label}
        </span>
        <span className="text-[10px] tabular text-[var(--text-muted)]">{tasks.length}</span>
        {onAdd && (
          <button
            onClick={() => onAdd(status)}
            className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            aria-label={`Add to ${STATUS[status].label}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      <DropColumn
        id={status}
        className="scrollbar-thin min-h-24 flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--surface)] p-1.5"
      >
        {tasks.map((t) => (
          <DragCard key={t.id} id={t.id}>
            <Card task={t} onOpen={onOpen} clientFor={clientFor} showProject={showProject} />
          </DragCard>
        ))}
        {!tasks.length && (
          <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">Empty</p>
        )}
      </DropColumn>
    </div>
  )
}

/** Sparse on purpose: a card that shows everything shows nothing. */
function Card({
  task, onOpen, clientFor, showProject = true,
}: {
  task: TaskRow
  onOpen: (t: TaskRow) => void
  clientFor?: Map<string, string>
  showProject?: boolean
}) {
  const done = task.status === 'done'
  const late = isOverdue(task.due_date, done)
  const client = task.project_id ? clientFor?.get(task.project_id) : undefined

  return (
    <article
      onClick={() => onOpen(task)}
      className={cn(
        'cursor-pointer rounded-md border border-l-2 border-[var(--border)] bg-[var(--surface-raised)] p-2',
        'transition-shadow hover:shadow-sm',
        // Finished work recedes: no priority rail, muted title.
        done ? 'border-l-transparent opacity-60' : priorityStyle(task.priority).accent,
      )}
    >
      {!done && (task.priority === 'high' || late || task.recurring_id) && (
        <div className="mb-1 flex items-center gap-1">
          <PriorityBadge p={task.priority} />
          {late && <OverdueBadge />}
          {task.recurring_id && <RecurringBadge />}
        </div>
      )}

      <p className={cn('mb-1.5 line-clamp-2 text-[11px] leading-snug',
                       done ? 'text-[var(--text-secondary)]' : 'font-medium')}>
        {task.title}
      </p>

      {showProject && (client || task.project) && (
        <div className="mb-1.5 flex items-center gap-1">
          {client && <ClientBadge name={client} />}
          {task.project && !client && (
            <span className="truncate text-[10px] text-[var(--text-muted)]">
              {task.project.name}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {task.assignee
          ? <Avatar id={task.assignee.id} name={task.assignee.name}
                    src={task.assignee.avatar_url} size="xs" />
          : <span className="text-[10px] text-[var(--text-muted)]">Unassigned</span>}
        <div className="ml-auto">
          {done
            ? <span className="text-[10px] text-[var(--text-muted)]">
                {task.done_at ? formatDateShort(task.done_at) : 'Done'}
              </span>
            : <>
                <DueDate date={task.due_date} />
                {task.due_time && (
                  <span className="ml-1 text-[10px] tabular text-[var(--text-muted)]">{formatTime(task.due_time)}</span>
                )}
              </>}
        </div>
      </div>
    </article>
  )
}
