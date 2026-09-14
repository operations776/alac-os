/**
 * Board. Four columns: To Do, Doing, Waiting, Done.
 *
 * Cards move in local state on drop and the server call runs behind them, so
 * dragging never waits on a round trip.
 */
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Avatar } from '@/components/ops/ui/primitives'
import {
  ClientBadge, DueDate, OverdueBadge, PriorityBadge, RecurringBadge,
} from '@/components/ops/badges'
import { updateTask } from '@/lib/server/ops/actions'
import { STATUS, STATUSES, priorityStyle } from '@/lib/ops/constants'
import { cn, formatDateShort, isOverdue } from '@/lib/ops/utils'
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
  const router = useRouter()
  const [, start] = useTransition()
  const [dragging, setDragging] = useState<TaskRow | null>(null)
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({})

  // A small activation distance keeps clicks from becoming drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const shown = useMemo(
    () => tasks.map((t) => (moved[t.id] ? { ...t, status: moved[t.id] } : t)),
    [tasks, moved],
  )

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const id = String(e.active.id)
    const to = e.over?.id ? (String(e.over.id) as TaskStatus) : null
    const task = shown.find((t) => t.id === id)
    if (!to || !task || task.status === to || !STATUSES.includes(to)) return

    setMoved((m) => ({ ...m, [id]: to }))
    start(async () => {
      const r = await updateTask(id, { status: to })
      if (!r.ok) {
        setMoved((m) => { const n = { ...m }; delete n[id]; return n })
      }
      router.refresh()
    })
  }

  return (
    <DndContext
      id="project-board"
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragging(shown.find((t) => t.id === e.active.id) ?? null)}
      onDragEnd={onDragEnd}
    >
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

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-64 rotate-2 opacity-90">
            <Card task={dragging} onOpen={() => {}} clientFor={clientFor}
                  showProject={showProject} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
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
  const { setNodeRef, isOver } = useDroppable({ id: status })

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

      <div
        ref={setNodeRef}
        className={cn(
          'scrollbar-thin min-h-24 flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--surface)] p-1.5',
          'transition-colors',
          isOver && 'drop-target',
        )}
      >
        {tasks.map((t) => (
          <Draggable key={t.id} task={t} onOpen={onOpen} clientFor={clientFor}
                     showProject={showProject} />
        ))}
        {!tasks.length && (
          <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">Empty</p>
        )}
      </div>
    </div>
  )
}

function Draggable({
  task, onOpen, clientFor, showProject,
}: {
  task: TaskRow
  onOpen: (t: TaskRow) => void
  clientFor?: Map<string, string>
  showProject: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && 'dragging')}>
      <Card task={task} onOpen={onOpen} clientFor={clientFor} showProject={showProject} />
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
            : <DueDate date={task.due_date} />}
        </div>
      </div>
    </article>
  )
}
