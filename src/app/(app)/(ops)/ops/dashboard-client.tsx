'use client'

import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CheckCircle2, PauseCircle } from 'lucide-react'
import { TaskGroup } from '@/components/ops/tasks/task-row'
import { TaskDrawer } from '@/components/ops/tasks/task-drawer'
import { useDrawer } from '@/components/ops/tasks/use-drawer'
import { Avatar, EmptyState, Panel, PanelHeader } from '@/components/ops/ui/primitives'
import { HealthBadge } from '@/components/ops/badges'
import {
  cn, daysAway, firstName, formatDateShort, greeting, isOverdue, isToday, 
} from '@/lib/ops/utils'
import { RallyLine } from '@/components/ops/rally-line'
import type {
  Person, ProjectRow, RallyLine as Line, TaskRow,
} from '@/types/ops'

export function DashboardClient({
  me, tasks, projects, people, rally,
}: {
  me: Person
  tasks: TaskRow[]
  projects: ProjectRow[]
  people: Person[]
  rally?: Line | null
}) {
  const drawer = useDrawer()

  const view = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done')
    const live = projects.filter((p) => p.status === 'active')

    return {
      overdue: open.filter((t) => isOverdue(t.due_date)),
      today: open.filter((t) => isToday(t.due_date)),
      // Both stages mean the task is not moving on its own.
      waiting: open.filter((t) => t.status === 'review' || t.status === 'blocked'),
      // Work generated because somebody is waiting on a decision, copy sent
      // for review, content ready, media needing approval. It carries status
      // 'todo' like any other task, so grouping on status alone would bury it
      // among ordinary work when it is the thing blocking someone else.
      reviews: open.filter((t) => t.source_kind !== null && t.assignee_id === me.id),
      unassigned: open.filter((t) => !t.assignee_id && t.due_date),
      live,
      trouble: live.filter((p) => p.health !== 'on_track'),
      // Who's carrying what, a headcount, not a utilization model.
      load: people.map((p) => {
        const mine = open.filter((t) => t.assignee_id === p.id)
        return {
          person: p,
          open: mine.length,
          late: mine.filter((t) => isOverdue(t.due_date)).length,
          today: mine.filter((t) => isToday(t.due_date)).length,
        }
      }).sort((a, b) => b.late - a.late || b.open - a.open),
    }
  }, [tasks, projects, people])

  const projectsForDrawer = projects.map((p) => ({ id: p.id, name: p.name }))
  // The greeting and date come from the viewer's clock, so the server cannot
  // know them, rendering them during SSR is a hydration mismatch (React #418).
  // useSyncExternalStore returns the server snapshot while rendering on the
  // server and the client one after hydration, which is exactly this case.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const clock = mounted
    ? {
        hello: greeting(),
        today: new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        }),
      }
    : null

  const clear = !view.overdue.length && !view.today.length && !view.waiting.length

  return (
    <div className="mx-auto max-w-6xl p-5">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          {clock?.hello ?? 'Hello'}, {firstName(me.name)}
        </h1>
        {/* Rendered empty on the server and filled after mount: the greeting
            and the date both depend on the viewer's clock, and a server/client
            disagreement is a hydration error. suppressHydrationWarning keeps
            the one-frame difference from being reported. */}
        <p className="mt-0.5 h-4 text-xs text-[var(--text-muted)]"
           suppressHydrationWarning>
          {clock?.today ?? ''}
        </p>
      </div>

      <RallyLine line={rally ?? null} />

      {/* Four numbers. Every one is a link. */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Overdue" n={view.overdue.length} tone="bad"
              icon={AlertTriangle} href="/my-work?tab=overdue" />
        <Stat label="Due today" n={view.today.length} tone="warn"
              icon={CalendarClock} href="/my-work" />
        <Stat label="Needs a nudge" n={view.waiting.length} tone="warn"
              icon={PauseCircle} href="/my-work?tab=waiting" />
        <Stat label="Projects at risk" n={view.trouble.length} tone="bad"
              icon={AlertTriangle} href="/projects" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {clear ? (
            <Panel>
              <EmptyState
                icon={CheckCircle2}
                title="Nothing on fire"
                description="Nothing overdue, nothing due today, nothing stuck."
              />
            </Panel>
          ) : (
            <>
              {view.reviews.length > 0 && (
                <TaskGroup title="Waiting on your review" tasks={view.reviews}
                           onOpen={drawer.open} accent="bg-violet-500" />
              )}
              <TaskGroup title="Overdue" tasks={view.overdue}
                         onOpen={drawer.open} accent="bg-rose-500" />
              <TaskGroup title="Due today" tasks={view.today}
                         onOpen={drawer.open} accent="bg-amber-500" />
              <TaskGroup title="In review or blocked" tasks={view.waiting}
                         onOpen={drawer.open} accent="bg-amber-400" />
            </>
          )}

          {view.unassigned.length > 0 && (
            <TaskGroup title="Nobody owns these" tasks={view.unassigned}
                       onOpen={drawer.open} accent="bg-slate-400" />
          )}
        </div>

        <div className="space-y-3">
          <Panel>
            <PanelHeader
              title="Projects"
              action={
                <Link href="/projects" className="text-[10px] text-brand-600 hover:underline">
                  All
                </Link>
              }
            />
            {view.live.length === 0 ? (
              <EmptyState title="No active projects" />
            ) : (
              <ul>
                {view.live.slice(0, 8).map((p) => {
                  const days = daysAway(p.due_date)
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 last:border-0 hover:bg-[var(--surface-hover)]"
                      >
                        <HealthBadge h={p.health} dotOnly />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {p.name}
                        </span>
                        {(p.overdue_count ?? 0) > 0 && (
                          <span className="shrink-0 text-[10px] font-semibold tabular text-rose-600">
                            {p.overdue_count} late
                          </span>
                        )}
                        <span className={cn(
                          'w-12 shrink-0 text-right text-[10px] tabular',
                          days !== null && days < 0
                            ? 'font-semibold text-rose-600'
                            : 'text-[var(--text-muted)]',
                        )}>
                          {p.due_date ? formatDateShort(p.due_date) : '-'}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Who's got what" />
            <ul className="p-2">
              {view.load.map((r) => (
                <li key={r.person.id}>
                  <Link
                    href={`/my-work?who=${r.person.id}`}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                  >
                    <Avatar id={r.person.id} name={r.person.name}
                            src={r.person.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs">{r.person.name}</span>
                    {r.late > 0 && (
                      <span className="text-[10px] font-semibold tabular text-rose-600">
                        {r.late} late
                      </span>
                    )}
                    <span className="w-14 text-right text-[10px] tabular text-[var(--text-muted)]">
                      {r.open} open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <TaskDrawer
        task={drawer.task}
        data={drawer.data}
        people={people}
        projects={projectsForDrawer}
        onReload={drawer.reload}
        onClose={drawer.close}
      />
    </div>
  )
}

function Stat({
  label, n, tone, icon: Icon, href,
}: {
  label: string
  n: number
  tone: 'bad' | 'warn'
  icon: React.ComponentType<{ className?: string }>
  href: string
}) {
  // A zero is good news and should recede; a non-zero should not.
  const loud = n > 0
  const styles = loud
    ? tone === 'bad'
      ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20'
      : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
    : 'border-[var(--border)]'
  const num = loud
    ? tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
    : 'text-[var(--text-muted)]'

  return (
    <Link
      href={href}
      className={cn('flex flex-col gap-1 rounded-lg border bg-[var(--surface-raised)] p-3',
                    'transition-colors hover:border-[var(--border-strong)]', styles)}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', loud ? num : 'text-[var(--text-muted)]')} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <span className={cn('text-2xl font-semibold leading-none tabular', num)}>{n}</span>
    </Link>
  )
}
