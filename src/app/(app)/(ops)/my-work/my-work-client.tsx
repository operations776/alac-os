'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { TaskGroup } from '@/components/ops/tasks/task-row'
import { TaskDrawer } from '@/components/ops/tasks/task-drawer'
import { useDrawer } from '@/components/ops/tasks/use-drawer'
import { EmptyState, Panel, Select, Tabs } from '@/components/ops/ui/primitives'
import { daysAway, firstName, isOverdue, isToday, plural } from '@/lib/ops/utils'
import type { Person, Project, TaskRow } from '@/types/ops'

type Tab = 'now' | 'soon' | 'overdue' | 'waiting' | 'done'

/**
 * Tasks finished in the last N days, newest first. Reading the clock lives
 * here so the render body stays free of impure calls.
 */
function doneSince(tasks: TaskRow[], days: number): TaskRow[] {
  const cutoff = Date.now() - days * 86_400_000
  return tasks
    .filter((t) => t.status === 'done' && t.done_at &&
                   new Date(t.done_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.done_at!).getTime() - new Date(a.done_at!).getTime())
}

export function MyWorkClient({
  me, tasks, people, projects,
}: {
  me: Person
  tasks: TaskRow[]
  people: Person[]
  projects: Pick<Project, 'id' | 'name'>[]
}) {
  const params = useSearchParams()
  const drawer = useDrawer()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'now')
  // The dashboard links here with ?who=, so you can check on a teammate.
  const [who, setWho] = useState(params.get('who') ?? me.id)

  const person = people.find((p) => p.id === who) ?? me
  const isMe = who === me.id

  const groups = useMemo(() => {
    const mine = tasks.filter((t) => t.assignee_id === who)
    const open = mine.filter((t) => t.status !== 'done')

    return {
      // Generated because somebody is waiting on a decision. These carry
      // status 'todo' like any other task, so grouping on status alone buries
      // them among ordinary work when they are what is blocking someone else.
      reviews: open.filter((t) => t.source_kind !== null),
      overdue: open.filter((t) => isOverdue(t.due_date)),
      today: open.filter((t) => isToday(t.due_date)),
      // Priority work with no imminent date, the stuff that quietly slips.
      priority: open.filter((t) =>
        t.priority === 'high' && !isOverdue(t.due_date) && !isToday(t.due_date)),
      soon: open.filter((t) => {
        const d = daysAway(t.due_date)
        return d !== null && d >= 1 && d <= 7
      }),
      later: open.filter((t) => {
        const d = daysAway(t.due_date)
        return d === null || d > 7
      }),
      waiting: open.filter((t) => t.status === 'review' || t.status === 'blocked'),
      done: doneSince(mine, 7),
    }
  }, [tasks, who])

  const openCount =
    groups.overdue.length + groups.today.length + groups.soon.length + groups.later.length

  return (
    <div className="rise mx-auto max-w-4xl p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {isMe ? 'My Work' : `${firstName(person.name)}'s Work`}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {openCount === 0
              ? 'Nothing open.'
              : `${openCount} open ${plural(openCount, 'item')}`}
          </p>
        </div>

        <Select className="h-7 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === me.id ? 'Me' : p.name}
            </option>
          ))}
        </Select>
      </div>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: 'now',     label: 'Now',     count: groups.overdue.length + groups.today.length + groups.priority.length },
          { key: 'soon',    label: 'Soon',    count: groups.soon.length },
          { key: 'overdue', label: 'Overdue', count: groups.overdue.length },
          { key: 'waiting', label: 'Stuck',   count: groups.waiting.length },
          { key: 'done',    label: 'Done',    count: groups.done.length },
        ]}
      />

      <div className="space-y-3">
        {tab === 'now' && (
          <>
            {groups.reviews.length > 0 && (
              <TaskGroup title="Waiting on your review" tasks={groups.reviews}
                         onOpen={drawer.open} accent="bg-violet-500" />
            )}
            <TaskGroup title="Overdue" tasks={groups.overdue}
                       onOpen={drawer.open} accent="bg-rose-500" />
            <TaskGroup title="Due today" tasks={groups.today}
                       onOpen={drawer.open} accent="bg-amber-500" />
            <TaskGroup title="High priority" tasks={groups.priority}
                       onOpen={drawer.open} accent="bg-rose-400" />
            {groups.overdue.length + groups.today.length + groups.priority.length === 0 && (
              <Panel>
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing urgent"
                  description="Nothing overdue, nothing due today, no high-priority work waiting."
                />
              </Panel>
            )}
          </>
        )}

        {tab === 'soon' && (
          <>
            <TaskGroup title="Next 7 days" tasks={groups.soon}
                       onOpen={drawer.open} empty="Nothing due this week."
                       accent="bg-sky-500" />
            <TaskGroup title="Later / no date" tasks={groups.later}
                       onOpen={drawer.open} accent="bg-slate-400" />
          </>
        )}

        {tab === 'overdue' && (
          <TaskGroup title="Overdue" tasks={groups.overdue} onOpen={drawer.open}
                     empty="Nothing overdue." accent="bg-rose-500" />
        )}

        {tab === 'waiting' && (
          <TaskGroup title="In review or blocked" tasks={groups.waiting} onOpen={drawer.open}
                     empty="Nothing is stuck." accent="bg-amber-400" />
        )}

        {tab === 'done' && (
          <TaskGroup title="Done this week" tasks={groups.done} onOpen={drawer.open}
                     empty="Nothing finished in the last seven days."
                     accent="bg-emerald-500" />
        )}
      </div>

      <TaskDrawer
        task={drawer.task}
        data={drawer.data}
        people={people}
        projects={projects}
        onReload={drawer.reload}
        onClose={drawer.close}
      />
    </div>
  )
}
