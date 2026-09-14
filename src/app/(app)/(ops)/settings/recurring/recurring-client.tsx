/**
 * Recurring work.
 *
 * A recurring task is a template, not a task: it describes when work should
 * appear and who owes it, and the scheduler turns that into real tasks. The
 * list therefore has to answer "what repeats, when, and whose is it" at a
 * glance, the old single line of grey text answered none of those.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import {
  createRecurring, deleteRecurring, duplicateRecurring, toggleRecurring,
  updateRecurring,
} from '@/lib/server/ops/actions'
import { describeSchedule, type Rule } from '@/lib/ops/recurrence'
import { cn, formatDate } from '@/lib/ops/utils'
import {
  emptySchedule, rulesFor, ScheduleEditor, storedFrequency,
  type FreqChoice, type ScheduleState,
} from './schedule-editor'
import type { Person, Priority, Project, RecurringTask } from '@/types/ops'

/** A saved task's schedule, back in the shape the editor works with. */
function stateFrom(r: RecurringTask): ScheduleState {
  const rules = r.rules ?? []
  const weekdayRules = rules.filter((x) => x.kind === 'weekday')
  const isEveryWeekday = r.frequency === 'weekly'
    && weekdayRules.length === 5
    && [1, 2, 3, 4, 5].every((d) => weekdayRules.some((x) => x.day_of_week === d))

  return {
    freq: (isEveryWeekday ? 'every_weekday' : r.frequency) as FreqChoice,
    weekdays: weekdayRules.map((x) => x.day_of_week!).sort(),
    monthRules: rules
      .filter((x) => x.kind !== 'weekday')
      .map((x) => ({
        kind: x.kind,
        day_of_month: x.day_of_month,
        week_of_month: x.week_of_month,
        day_of_week: x.day_of_week,
      })),
    intervalN: r.interval_n ?? 1,
    customUnit: rules.some((x) => x.kind === 'weekday') ? 'weeks' : 'months',
    startsOn: (r.starts_on ?? '').slice(0, 10),
    endsMode: r.ends_on ? 'on' : r.ends_after ? 'after' : 'never',
    endsOn: (r.ends_on ?? '').slice(0, 10),
    endsAfter: r.ends_after ?? 12,
  }
}

export function RecurringClient({
  rules, people, projects, sops, me,
}: {
  rules: RecurringTask[]
  sops: { id: string; title: string }[]
  people: Person[]
  projects: Pick<Project, 'id' | 'name'>[]
  me: Person
}) {
  const router = useRouter()
  const [, start] = useTransition()
  // null = closed, 'new' = creating, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-3xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Recurring work</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            The tasks that come back. Each one appears on its own schedule.
          </p>
        </div>
        <Button
          size="sm" variant="primary"
          onClick={() => setEditing(editing === 'new' ? null : 'new')}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {editing === 'new' && (
        <RecurringForm
          people={people} projects={projects} sops={sops} me={me}
          onDone={() => { setEditing(null); router.refresh() }}
          onCancel={() => setEditing(null)}
        />
      )}

      {rules.length === 0 && editing !== 'new' ? (
        <Panel>
          <EmptyState
            icon={Repeat}
            title="Nothing recurring yet"
            description="Weekly reviews, the Monday huddle, month-end invoicing."
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => editing === r.id ? (
            <RecurringForm
              key={r.id} existing={r}
              people={people} projects={projects} sops={sops} me={me}
              onDone={() => { setEditing(null); router.refresh() }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <RuleRow
              key={r.id} rule={r}
              onEdit={() => setEditing(r.id)}
              onToggle={() => start(async () => {
                await toggleRecurring(r.id, !r.is_active); router.refresh()
              })}
              onDuplicate={() => start(async () => {
                await duplicateRecurring(r.id); router.refresh()
              })}
              onDelete={() => {
                if (!confirm(`Delete "${r.title}"? Tasks already created stay.`)) return
                start(async () => { await deleteRecurring(r.id); router.refresh() })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** One template, said plainly enough to check without opening it. */
function RuleRow({
  rule, onEdit, onToggle, onDuplicate, onDelete,
}: {
  rule: RecurringTask
  onEdit: () => void
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const schedule = rule.rules?.length
    ? describeSchedule(rule.rules as Rule[], rule.frequency, rule.interval_n ?? 1)
    : 'No schedule set'

  return (
    <Panel className={cn(!rule.is_active && 'opacity-60')}>
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-xs font-medium hover:text-brand-600">
            {rule.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
            {schedule}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
            <span className="tabular">Next {formatDate(rule.next_due)}</span>
            {rule.assignee && (
              <span className="flex items-center gap-1">
                <Avatar id={rule.assignee.id} name={rule.assignee.name}
                        src={rule.assignee.avatar_url} size="xs" />
                {rule.assignee.name}
              </span>
            )}
            {rule.project && <span>{rule.project.name}</span>}
            {rule.checklist.length > 0 && (
              <span>{rule.checklist.length} steps</span>
            )}
            {rule.ends_after && (
              <span>{rule.occurrences_made ?? 0} of {rule.ends_after}</span>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggle}
            className={cn('rounded px-2 py-1 text-[10px] font-medium',
              rule.is_active
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-[var(--surface-hover)] text-[var(--text-muted)]')}
          >
            {rule.is_active ? 'Active' : 'Paused'}
          </button>
          <button onClick={onEdit} aria-label="Edit"
                  className="p-1 text-[var(--text-muted)] hover:text-brand-600">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDuplicate} aria-label="Duplicate"
                  className="p-1 text-[var(--text-muted)] hover:text-brand-600">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} aria-label="Delete"
                  className="p-1 text-[var(--text-muted)] hover:text-rose-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Panel>
  )
}

/** Create or edit, the same fields either way, so the form is shared. */
function RecurringForm({
  existing, people, projects, sops, me, onDone, onCancel,
}: {
  existing?: RecurringTask
  people: Person[]
  projects: Pick<Project, 'id' | 'name'>[]
  sops: { id: string; title: string }[]
  me: Person
  onDone: () => void
  onCancel: () => void
}) {
  const [saving, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [schedule, setSchedule] = useState<ScheduleState>(
    existing ? stateFrom(existing) : emptySchedule())
  const [projectId, setProjectId] = useState(existing?.project_id ?? '')
  const [who, setWho] = useState(existing?.assignee_id ?? me.id)
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'normal')
  const [sopId, setSopId] = useState(existing?.sop_id ?? '')
  const [checklist, setChecklist] = useState((existing?.checklist ?? []).join('\n'))
  const [notes, setNotes] = useState(existing?.notes ?? '')

  function save() {
    if (!title.trim()) { setError('Give it a name.'); return }
    const built = rulesFor(schedule)
    if (!built.length) { setError('Pick at least one day for this to repeat on.'); return }

    start(async () => {
      const payload = {
        title,
        frequency: storedFrequency(schedule.freq),
        interval_n: schedule.freq === 'custom' ? schedule.intervalN : 1,
        starts_on: schedule.startsOn || null,
        ends_on: schedule.endsMode === 'on' ? schedule.endsOn || null : null,
        ends_after: schedule.endsMode === 'after' ? schedule.endsAfter : null,
        project_id: projectId || null,
        assignee_id: who || null,
        priority,
        sop_id: sopId || null,
        notes: notes.trim() || null,
        checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean),
        rules: built,
      }
      const r = existing
        ? await updateRecurring(existing.id, payload)
        : await createRecurring(payload)
      if (!r.ok) { setError(r.error ?? 'That could not be saved.'); return }
      onDone()
    })
  }

  return (
    <Panel className="mb-3">
      <PanelHeader title={existing ? 'Edit recurring task' : 'New recurring task'} />
      <div className="space-y-3 p-4">
        <div>
          <Label>Task</Label>
          <Input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Weekly search review"
          />
        </div>

        <ScheduleEditor value={schedule} onChange={setSchedule} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Project</Label>
            <Select className="w-full" value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Who</Label>
            <Select className="w-full" value={who}
                    onChange={(e) => setWho(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select className="w-full" value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </div>
          <div>
            <Label>SOP (optional)</Label>
            <Select className="w-full" value={sopId}
                    onChange={(e) => setSopId(e.target.value)}>
              <option value="">No SOP</option>
              {sops.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Steps (one per line, optional)</Label>
          <Textarea
            rows={3} value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            placeholder={'Review activity\nCheck submissions\nUpdate client'}
          />
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the person doing this should know."
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-600">{error}</p>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Create recurring task'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Panel>
  )
}
