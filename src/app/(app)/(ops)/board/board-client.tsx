/**
 * Company board.
 *
 * Every open task in the company on one drag-and-drop surface. Filter by
 * function to see just Marketing or just Ops; swimlane by function to see
 * how the whole org is moving at once.
 */
'use client'

import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FolderKanban, LayoutGrid, Plus, Rows3 } from 'lucide-react'
import { Avatar, Button, Select } from '@/components/ops/ui/primitives'
import { DueDate, OverdueBadge, PriorityBadge, RecurringBadge } from '@/components/ops/badges'
import { TaskDrawer } from '@/components/ops/tasks/task-drawer'
import { useDrawer } from '@/components/ops/tasks/use-drawer'
import { NewTask } from '@/components/ops/new-task'
import { BulkBar, SelectBox, useSelection } from '@/components/ops/board-selection'
import { BoardDnd, DragCard, DropColumn, MoveError } from '@/components/ops/dnd'
import { moveTasks, updateTask } from '@/lib/server/ops/actions'
import { STATUS, STATUSES } from '@/lib/ops/constants'
import { useKanban } from '@/lib/ops/kanban'
import { ProjectLane } from './project-lane'
import { cn, formatTime, isOverdue } from '@/lib/ops/utils'
import type {
  OrgFunction, Person, ProjectRow, TaskRow, TaskStatus,
} from '@/types/ops'

type Lane = 'none' | 'department' | 'person' | 'project'

export function CompanyBoard({
  me, tasks, projects, people, functions,
}: {
  me: Person
  tasks: TaskRow[]
  projects: ProjectRow[]
  people: Person[]
  functions: OrgFunction[]
}) {
  const router = useRouter()
  const drawer = useDrawer()

  // Notifications link to /board?task=<id>. Tasks live in a drawer rather
  // than their own page, so the deep link opens the drawer once the board
  // has the row. Runs once per id so closing the drawer does not reopen it.
  const params = useSearchParams()
  const wanted = params.get('task')
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!wanted || opened.current === wanted) return
    const found = tasks.find((t) => t.id === wanted)
    if (found) {
      opened.current = wanted
      drawer.open(found)
    }
  }, [wanted, tasks, drawer])

  // A single function at a time, or all of them. This is a lens on one
  // board, not a separate board per function.
  const [fn, setFn] = useState<string>('')

  // Retired functions still own historical tasks, but they are not lenses.
  const activeFunctions = useMemo(
    () => functions.filter((f) => f.is_active !== false), [functions])

  const fnColors = useMemo(
    () => Object.fromEntries(functions.map((f) => [f.id, f.color])), [functions])
  const [who, setWho] = useState('')
  // Read from the URL so a link, a redirect and back/forward all agree.
  const urlLane = params.get('view') === 'project' ? 'project' : null
  const [ownLane, setOwnLane] = useState<Lane | null>(null)
  // A choice made here wins until the URL changes under it.
  const lane: Lane = ownLane ?? urlLane ?? 'none'
  const [seenUrlLane, setSeenUrlLane] = useState(urlLane)
  if (seenUrlLane !== urlLane) { setSeenUrlLane(urlLane); setOwnLane(null) }
  const setLane = (l: Lane) => setOwnLane(l)
  const [adding, setAdding] = useState(false)
  // One shared implementation across every board (Phase 25): the same
  // validation, the same optimistic lifecycle, the same failure handling.
  const selection = useSelection()

  const kanban = useKanban<TaskRow, TaskStatus>({
    rows: tasks,
    field: 'status',
    stages: STATUSES,
    save: (id, stage) => updateTask(id, { status: stage }),
    saveMany: (ids, stage) => moveTasks(ids, stage),
    // Drag one card of a selection and the whole selection travels with it.
    selectedIds: selection.ids,
    onMovedSelection: () => selection.clear(),
  })

  // Work somebody planned, which is what this board is for.
  const boardTasks = useMemo(() => tasks.filter((t) => !t.source_kind), [tasks])

  const visible = useMemo(() => {
    // Generated reviews are not board work. A review exists because
    // something else reached a stage that needs a decision, and it already
    // appears under "Waiting on your review" in Command Center and My Work.
    // Showing it here as well made the board read as two competing kinds of
    // thing: work somebody planned, and work the system raised.
    let out = kanban.view.filter((t) => !t.source_kind)
    // The function filter was listed as a dependency but never applied, so
    // picking Marketing showed every card and the filter looked broken.
    if (fn) out = out.filter((t) => t.function_id === fn)
    if (who) out = out.filter((t) => t.assignee_id === who)
    return out
  }, [kanban.view, fn, who])


  const lanes = useMemo(() => {
    if (lane === 'department') {
      return activeFunctions
        .map((f) => ({
          key: f.id,
          label: f.name,
          accent: '',
          color: f.color,
          tasks: visible.filter((t) => t.function_id === f.id),
        }))
        .filter((l) => l.tasks.length > 0)
    }
    if (lane === 'person') {
      const rows = people.map((p) => ({
        key: p.id,
        label: p.name,
        accent: 'bg-slate-300 dark:bg-slate-600',
        tasks: visible.filter((t) => t.assignee_id === p.id),
      }))
      const none = visible.filter((t) => !t.assignee_id)
      if (none.length) {
        rows.push({ key: 'none', label: 'Unassigned',
                    accent: 'bg-slate-300 dark:bg-slate-600', tasks: none })
      }
      return rows.filter((l) => l.tasks.length > 0)
    }
    return [{ key: 'all', label: '', accent: '', tasks: visible }]
  }, [lane, visible, people, activeFunctions])

  const open = visible.filter((t) => t.status !== 'done').length
  const late = visible.filter((t) => isOverdue(t.due_date) && t.status !== 'done').length

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Company Board</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {open} open
            {late > 0 && <span className="font-medium text-rose-600"> · {late} late</span>}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Select className="h-7 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === me.id ? 'Me' : p.name}</option>
            ))}
          </Select>

          <div className="flex overflow-hidden rounded-md border border-[var(--border-strong)]">
            <button onClick={() => setLane('department')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                lane === 'department' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}
              title="Swimlane by function">
              <Rows3 className="h-3.5 w-3.5" /> By function
            </button>
            <button onClick={() => setLane('project')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                lane === 'project' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}
              title="Group by project">
              <FolderKanban className="h-3.5 w-3.5" /> By project
            </button>
            <button onClick={() => setLane('person')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                lane === 'person' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}
              title="Swimlane by person">
              <Rows3 className="h-3.5 w-3.5" /> By person
            </button>
            <button onClick={() => setLane('none')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                lane === 'none' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}
              title="One board">
              <LayoutGrid className="h-3.5 w-3.5" /> Flat
            </button>
          </div>

          <Button size="sm" variant="secondary" onClick={selection.toggleMode}>
            {selection.active ? 'Cancel select' : 'Select'}
          </Button>

          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            New task
          </Button>
        </div>
      </div>

      {/* Function filter, one board, seen through one lens at a time. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFn('')}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
            fn === ''
              ? 'border-transparent bg-[var(--text-primary)] text-[var(--surface)]'
              : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
          )}
        >
          All functions
          <span className={cn('tabular text-[10px]',
                              fn === '' ? 'opacity-70' : 'text-[var(--text-muted)]')}>
            {boardTasks.filter((t) => t.status !== 'done').length}
          </span>
        </button>

        {activeFunctions.map((f) => {
          const on = fn === f.id
          const n = boardTasks.filter(
            (t) => t.function_id === f.id && t.status !== 'done').length
          return (
            <button
              key={f.id}
              onClick={() => setFn(on ? '' : f.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                on
                  ? 'border-transparent text-white'
                  : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
              )}
              style={on ? { backgroundColor: f.color } : undefined}
            >
              {!on && (
                <span className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: f.color }} />
              )}
              {f.name}
              <span className={cn('tabular text-[10px]',
                                  on ? 'text-white/80' : 'text-[var(--text-muted)]')}>
                {n}
              </span>
            </button>
          )
        })}
      </div>

      <BulkBar
        kind="task"
        selection={selection}
        me={me}
        allIds={visible.map((t) => t.id)}
      />

      <Selection.Provider value={selection}>
      <FnColors.Provider value={fnColors}>
      {/* A refused move must say why. Without this the card simply springs
          back to its old column and the board looks broken. */}
      <MoveError message={kanban.error} onDismiss={kanban.dismissError} />

      {/* Projects group the same tasks rather than holding their own, so
          this is a view of the board, not a separate place. */}
      {lane === 'project' ? (
        <ProjectLane
          projects={projects}
          tasks={visible}
          people={people}
          functions={activeFunctions}
          fn={fn}
          who={who}
          onOpen={(p) => router.push(`/projects/${p.id}`)}
          onNew={() => router.push('/projects?new=1')}
        />
      ) : (
      <BoardDnd
        id="company-board"
        onDragEnd={kanban.onDragEnd}
        overlay={(id) => {
          const t = visible.find((x) => x.id === id)
          return t && <Card task={t} onOpen={() => {}} />
        }}
      >
        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {lanes.length === 0 ? (
            <p className="py-16 text-center text-xs text-[var(--text-muted)]">
              Nothing matches these filters.
            </p>
          ) : lanes.map((l) => (
            <div key={l.key}>
              {l.label && (
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={cn('h-3 w-1 rounded-full', l.accent)} />
                  <h2 className="text-xs font-semibold">{l.label}</h2>
                  <span className="text-[10px] tabular text-[var(--text-muted)]">
                    {l.tasks.filter((t) => t.status !== 'done').length} open
                  </span>
                </div>
              )}

              <div className="grid grid-cols-5 gap-2.5">
                {STATUSES.map((s) => (
                  <Column
                    key={s}
                    id={`${l.key}::${s}`}
                    status={s}
                    tasks={l.tasks.filter((t) => t.status === s)}
                    onOpen={drawer.open}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

      </BoardDnd>
      )}
      </FnColors.Provider>
      </Selection.Provider>

      <TaskDrawer
        task={drawer.task}
        data={drawer.data}
        people={people}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        onReload={drawer.reload}
        onClose={drawer.close}
      />

      <NewTask
        key={adding ? 'open' : 'closed'}
        open={adding}
        onClose={() => setAdding(false)}
        people={people}
        projects={projects.map((p) => ({
          id: p.id, name: p.name, department: p.department,
        }))}
        clients={[]}
        functions={functions}
        me={me}
      />
    </div>
  )
}

function Column({
  id, status, tasks, onOpen,
}: {
  id: string
  status: TaskStatus
  tasks: TaskRow[]
  onOpen: (t: TaskRow) => void
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS[status].dot)} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]"
              title={STATUS[status].hint}>
          {STATUS[status].label}
        </span>
        <span className="text-[10px] tabular text-[var(--text-muted)]">{tasks.length}</span>
      </div>

      {/* A tall column must not push its own cards below the fold: capped to
          the viewport and scrolled internally, every card stays reachable to
          drag. min-h keeps an empty column a full-size drop target. */}
      <DropColumn
        id={id}
        className="scrollbar-thin min-h-[60vh] max-h-[calc(100vh-13rem)] flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--surface)] p-1.5"
      >
        {tasks.map((t) => (
          <DragCard key={t.id} id={t.id}>
            <Card task={t} onOpen={onOpen} />
          </DragCard>
        ))}
        {!tasks.length && (
          <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">-</p>
        )}
      </DropColumn>
    </div>
  )
}

/** Card carries a department stripe, since this board mixes all of them. */
/**
 * Function colour by id, for the card stripe.
 *
 * Context rather than props: the colour is needed only by the leaf Card, and
 * threading it through Column and Draggable for a 4px bar is noise.
 */
const FnColors = createContext<Record<string, string>>({})

/** Selection state, read by the leaf card. */
const Selection = createContext<{
  active: boolean
  has: (id: string) => boolean
  toggle: (id: string) => void
} | null>(null)

function Card({ task, onOpen }: { task: TaskRow; onOpen: (t: TaskRow) => void }) {
  const fnColors = useContext(FnColors)
  const sel = useContext(Selection)
  const done = task.status === 'done'
  const late = isOverdue(task.due_date, done)

  return (
    <article
      onClick={() => onOpen(task)}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-md border border-[var(--border)]',
        'bg-[var(--surface-raised)] transition-shadow hover:shadow-sm',
        done && 'opacity-60',
      )}
    >
      <div className="flex">
        <span
          className="w-1 shrink-0"
          style={{
            backgroundColor: done
              ? 'transparent'
              : (fnColors[task.function_id ?? ''] ?? 'var(--border-strong)'),
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 p-2">
          {(sel?.active
            || (!done && (task.priority === 'high' || late || task.recurring_id))) && (
            <div className="mb-1 flex items-center gap-1">
              {sel?.active && (
                <SelectBox checked={sel.has(task.id)}
                           onChange={() => sel.toggle(task.id)} />
              )}
              {!done && (
                <>
                  <PriorityBadge p={task.priority} />
                  {late && <OverdueBadge />}
                  {task.recurring_id && <RecurringBadge />}
                </>
              )}
            </div>
          )}

          <p className={cn('mb-1 line-clamp-2 text-[11px] leading-snug',
                           done ? 'text-[var(--text-secondary)]' : 'font-medium')}>
            {task.title}
          </p>

          {task.project && (
            <p className="mb-1 truncate text-[10px] text-[var(--text-muted)]">
              {task.project.name}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            {task.assignee
              ? <Avatar id={task.assignee.id} name={task.assignee.name}
                        src={task.assignee.avatar_url} size="xs" />
              : <span className="text-[10px] text-[var(--text-muted)]">-</span>}
            <div className="ml-auto">
              {!done && <DueDate date={task.due_date} icon={false} />}
              {!done && task.due_time && (
                <span className="ml-1 text-[10px] tabular text-[var(--text-muted)]">{formatTime(task.due_time)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
