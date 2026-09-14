'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Archive, Columns3, List, Plus } from 'lucide-react'
import { Board } from '@/components/ops/tasks/board'
import { TaskGroup } from '@/components/ops/tasks/task-row'
import { TaskDrawer } from '@/components/ops/tasks/task-drawer'
import { useDrawer } from '@/components/ops/tasks/use-drawer'
import { NewTask } from '@/components/ops/new-task'
import { DriveFileRow } from '@/components/ops/drive-file'
import {
  Button, Input, Panel, PanelHeader, ProgressBar, Select,
} from '@/components/ops/ui/primitives'
import { archiveProject, updateProject, updateSearch } from '@/lib/server/ops/actions'
import { DEPARTMENT, HEALTH, HEALTHS, PROJECT_STATUS, PROJECT_STATUSES } from '@/lib/ops/constants'
import { cn, daysAway, percent, toDateInput } from '@/lib/ops/utils'
import type {
  Client, DriveFile, Health, OrgFunction, Person, Project, ProjectRow,
  ProjectStatus, TaskRow,
} from '@/types/ops'

export function ProjectClient({
  project, tasks, people, clients, projects, files, functions, canDelete,
}: {
  project: ProjectRow
  tasks: TaskRow[]
  people: Person[]
  clients: Client[]
  projects: Pick<Project, 'id' | 'name'>[]
  files: DriveFile[]
  functions: OrgFunction[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [view, setView] = useState<'list' | 'board'>('board')
  const [adding, setAdding] = useState(false)
  const drawer = useDrawer()

  const save = (patch: Parameters<typeof updateProject>[1]) =>
    start(async () => { await updateProject(project.id, patch); router.refresh() })

  const open = tasks.filter((t) => t.status !== 'done')
  const days = daysAway(project.due_date)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <Link href="/projects"
              className="mb-2 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
          <ArrowLeft className="h-3 w-3" />
          Projects
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  DEPARTMENT[project.department].chip)}>
                {DEPARTMENT[project.department].label}
              </span>
              {project.client && (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                  {project.client.name}
                </span>
              )}
            </div>
            {project.description && (
              <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add task
            </Button>
            {canDelete && (
              <Button
                size="sm" variant="ghost" title="Archive project"
                onClick={() => {
                  if (!confirm('Archive this project?')) return
                  start(async () => {
                    await archiveProject(project.id)
                    router.push('/projects')
                  })
                }}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Everything here is editable in place. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Meta label="Owner">
            <Select className="h-6 py-0 text-xs" value={project.owner_id}
                    onChange={(e) => save({ owner_id: e.target.value })}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Meta>

          <Meta label="Status">
            <Select className="h-6 py-0 text-xs" value={project.status}
                    onChange={(e) => save({ status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>
              ))}
            </Select>
          </Meta>

          <Meta label="Health">
            <Select className="h-6 py-0 text-xs" value={project.health}
                    onChange={(e) => save({ health: e.target.value as Health })}>
              {HEALTHS.map((h) => (
                <option key={h} value={h}>{HEALTH[h].label}</option>
              ))}
            </Select>
          </Meta>

          <Meta label="Due">
            <div className="flex items-center gap-1.5">
              <Input type="date" className="h-6 py-0 text-xs w-32"
                     value={toDateInput(project.due_date)}
                     onChange={(e) => save({ due_date: e.target.value || null })} />
              {days !== null && (
                <span className={cn('text-[10px] tabular',
                  days < 0 ? 'font-semibold text-rose-600' : 'text-[var(--text-muted)]')}>
                  {days < 0 ? `${Math.abs(days)}d late` : `${days}d left`}
                </span>
              )}
            </div>
          </Meta>

          <Meta label="Progress">
            <div className="flex items-center gap-2">
              <ProgressBar value={percent(project.done_count, project.task_count)}
                           className="w-24" />
              <span className="text-xs tabular font-medium">
                {project.done_count}/{project.task_count}
              </span>
            </div>
          </Meta>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {project.search && (
            <SearchPanel search={project.search} projectId={project.id} />
          )}

          {files.length > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader
                title={`Files · ${files.length}`}
                action={
                  <Link href="/files" className="text-[10px] text-brand-600 hover:underline">
                    All files
                  </Link>
                }
              />
              {files.map((f) => <DriveFileRow key={f.id} file={f} showFolder={false} />)}
            </Panel>
          )}
        </div>

        <div className="mb-3 flex justify-end">
          <div className="flex overflow-hidden rounded-md border border-[var(--border-strong)]">
            <button onClick={() => setView('board')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                view === 'board' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}>
              <Columns3 className="h-3.5 w-3.5" /> Board
            </button>
            <button onClick={() => setView('list')}
              className={cn('flex h-7 items-center gap-1 px-2 text-xs',
                view === 'list' ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]')}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>

        {view === 'board' ? (
          <div className="h-[calc(100vh-24rem)] min-h-96">
            <Board tasks={tasks} onOpen={drawer.open} onAdd={() => setAdding(true)}
                   showProject={false} />
          </div>
        ) : (
          <div className="space-y-3">
            <TaskGroup title="Open" tasks={open} onOpen={drawer.open}
                       showProject={false} empty="No open tasks." accent="bg-indigo-500" />
            <TaskGroup title="Done"
                       tasks={tasks.filter((t) => t.status === 'done')}
                       onOpen={drawer.open} showProject={false} accent="bg-emerald-500" />
          </div>
        )}
      </div>

      <TaskDrawer task={drawer.task} data={drawer.data} people={people}
                  projects={projects} onReload={drawer.reload} onClose={drawer.close} />

      <NewTask
        key={adding ? 'open' : 'closed'}
        open={adding}
        onClose={() => setAdding(false)}
        people={people}
        projects={projects.map((p) => ({ id: p.id, name: p.name, department: project.department }))}
        clients={clients}
        functions={functions}
        me={people[0]}
        defaultProjectId={project.id}
      />
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  )
}

/**
 * Search delivery. Are we on pace? Two bars, time spent against candidates
 * delivered, say it faster than any number.
 */
function SearchPanel({
  search, projectId,
}: {
  search: NonNullable<ProjectRow['search']>
  projectId: string
}) {
  const router = useRouter()
  const [, start] = useTransition()

  const elapsed = Math.abs(daysAway(search.opened_on) ?? 0)
  const pace = percent(elapsed, search.target_days)
  const delivered = percent(search.submitted, search.target_count)

  // Behind by more than 20 points with the clock still running is a problem.
  const behind = delivered < pace - 20

  const save = (k: string, v: number) =>
    start(async () => { await updateSearch(projectId, { [k]: v }); router.refresh() })

  return (
    <Panel>
      <PanelHeader
        title="Search delivery"
        action={
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
            search.placements > 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : behind
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300')}>
            {search.placements > 0 ? 'Placed' : behind ? 'Behind' : 'On pace'}
          </span>
        }
      />
      <div className="space-y-3 p-4">
        <p className="text-xs font-medium">{search.role_title}</p>

        <div className="space-y-2 rounded-md bg-[var(--surface-sunken)] p-3">
          <div>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">Time used</span>
              <span className="font-medium tabular">
                Day {elapsed} of {search.target_days}
              </span>
            </div>
            <ProgressBar value={pace}
              barClassName={pace > 100 ? 'bg-rose-500' : 'bg-slate-400'} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">Submitted</span>
              <span className="font-medium tabular">
                {search.submitted} of {search.target_count}
              </span>
            </div>
            <ProgressBar value={delivered}
              barClassName={behind ? 'bg-amber-500' : 'bg-emerald-500'} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            ['submitted', 'Submitted'],
            ['interviews', 'Interviews'],
            ['placements', 'Placements'],
          ] as const).map(([key, label]) => (
            <div key={key} className="rounded border border-[var(--border)] p-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {label}
              </p>
              <input
                type="number" min={0} defaultValue={search[key]}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v !== search[key]) save(key, v)
                }}
                className="w-full bg-transparent text-base font-semibold tabular outline-none focus:text-brand-600"
              />
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[var(--text-muted)]">
          Counts only. Candidates live in Recruiterflow.
        </p>
      </div>
    </Panel>
  )
}
