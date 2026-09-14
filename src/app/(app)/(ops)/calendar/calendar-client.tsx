'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Flag, Video } from 'lucide-react'
import { Button, Panel, Select } from '@/components/ops/ui/primitives'
import { TaskDrawer } from '@/components/ops/tasks/task-drawer'
import { useDrawer } from '@/components/ops/tasks/use-drawer'
import { PriorityDot } from '@/components/ops/badges'
import { addDays, cn, toDateString, today } from '@/lib/ops/utils'
import type {
  Calendar, CalendarEvent, Person, ProjectRow, TaskRow,
} from '@/types/ops'

/** A meeting with a join link is worth a different affordance to a reminder. */
function isMeeting(e: CalendarEvent): boolean {
  return !!e.location && /https?:\/\//.test(e.location)
}

/** Local wall-clock time for an event, formatted short. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  }).replace(':00', '')
}

export function CalendarClient({
  me, tasks, projects, people, calendars, events,
}: {
  me: Person
  tasks: TaskRow[]
  projects: ProjectRow[]
  people: Person[]
  calendars: Calendar[]
  events: CalendarEvent[]
}) {
  const [cursor, setCursor] = useState(() => today())
  const [who, setWho] = useState('')
  const [showEvents, setShowEvents] = useState(true)
  const drawer = useDrawer()

  const calById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c])), [calendars],
  )

  // Index everything dated by day, so each cell is a lookup.
  const byDay = useMemo(() => {
    const m = new Map<string, {
      tasks: TaskRow[]; due: ProjectRow[]; events: CalendarEvent[]
    }>()
    const at = (k: string) => {
      if (!m.has(k)) m.set(k, { tasks: [], due: [], events: [] })
      return m.get(k)!
    }

    for (const t of tasks) {
      if (!t.due_date || t.status === 'done') continue
      if (who && t.assignee_id !== who) continue
      at(t.due_date.slice(0, 10)).tasks.push(t)
    }
    for (const p of projects) {
      if (!p.due_date || p.status !== 'active') continue
      at(p.due_date.slice(0, 10)).due.push(p)
    }
    if (showEvents) {
      for (const e of events) {
        // Group by the event's local day.
        at(toDateString(new Date(e.starts_at))).events.push(e)
      }
    }
    return m
  }, [tasks, projects, events, who, showEvents])

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = addDays(first, -first.getDay())
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const end = addDays(last, 6 - last.getDay())
    const out: Date[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
    return out
  }, [cursor])

  const todayKey = toDateString(today())

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {calendars.length > 0 && ` · ${events.length} calendar events`}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={showEvents}
                   onChange={(e) => setShowEvents(e.target.checked)}
                   className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-brand-600" />
            Meetings
          </label>
          <Select className="h-7 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === me.id ? 'Me' : p.name}</option>
            ))}
          </Select>
          <Button size="icon" variant="secondary" aria-label="Previous month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCursor(today())}>Today</Button>
          <Button size="icon" variant="secondary" aria-label="Next month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Which calendars are feeding this view. */}
      {calendars.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {calendars.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.label}
              {!c.last_synced_at && (
                <span className="text-[10px] text-[var(--text-muted)]">, not synced</span>
              )}
            </span>
          ))}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}
                 className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = toDateString(day)
            const e = byDay.get(key)
            const otherMonth = day.getMonth() !== cursor.getMonth()
            const isToday = key === todayKey

            return (
              <div key={key}
                   className={cn('min-h-32 border-b border-r border-[var(--border)] p-1.5',
                                 otherMonth && 'bg-[var(--surface-sunken)]')}>
                <span className={cn(
                  'mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] tabular',
                  isToday ? 'bg-brand-600 font-semibold text-white'
                          : otherMonth ? 'text-[var(--text-muted)]'
                                       : 'text-[var(--text-secondary)]',
                )}>
                  {day.getDate()}
                </span>

                <div className="space-y-0.5">
                  {/* Project deadlines rank first, they're the commitment. */}
                  {e?.due.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`}
                          className="flex items-center gap-1 truncate rounded bg-brand-50 px-1 py-0.5 text-[10px] font-medium text-brand-800 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-200">
                      <Flag className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  ))}

                  {/* Real meetings, tinted by whose calendar they came from. */}
                  {e?.events.slice(0, 3).map((ev) => {
                    const cal = calById.get(ev.calendar_id)
                    return (
                      <a
                        key={ev.id}
                        href={ev.web_link ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${timeOf(ev.starts_at)} · ${ev.subject}${ev.location ? ` · ${ev.location}` : ''}`}
                        /* Whose calendar it is shows in the left bar and the
                           icon, never in the text colour: a calendar colour
                           dark enough to identify someone (navy, violet) is
                           unreadable as text on the near-black canvas. */
                        className="flex items-center gap-1 truncate rounded-[3px] border-l-2 py-0.5 pl-1 pr-1 text-[10px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        style={{
                          backgroundColor: `${cal?.color ?? '#6B8AFF'}1F`,
                          borderLeftColor: cal?.color ?? '#6B8AFF',
                        }}
                      >
                        {isMeeting(ev)
                          ? <Video className="h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]" />
                          : <CalendarClock className="h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]" />}
                        <span className="shrink-0 tabular text-[var(--text-secondary)]">{timeOf(ev.starts_at)}</span>
                        <span className="truncate">{ev.subject}</span>
                      </a>
                    )
                  })}
                  {e && e.events.length > 3 && (
                    <span className="block px-1 text-[10px] text-[var(--text-muted)]">
                      +{e.events.length - 3} more meetings
                    </span>
                  )}

                  {e?.tasks.slice(0, 3).map((t) => (
                    <button key={t.id} onClick={() => drawer.open(t)}
                            className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-[var(--surface-hover)]">
                      <PriorityDot p={t.priority} />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                  {e && e.tasks.length > 3 && (
                    <span className="block px-1 text-[10px] text-[var(--text-muted)]">
                      +{e.tasks.length - 3} more tasks
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <TaskDrawer task={drawer.task} data={drawer.data} people={people}
                  projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                  onReload={drawer.reload} onClose={drawer.close} />
    </div>
  )
}
