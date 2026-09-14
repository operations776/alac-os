/**
 * Task detail. Opens centered over the current view so you keep your place, and every
 * field saves on its own, no save button to forget.
 */
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen, Check, ExternalLink, History, ListChecks, MessageSquare, Trash2, X,
} from 'lucide-react'
import {
  Avatar, Button, Checkbox, Input, Label, Select, Textarea,
} from '@/components/ops/ui/primitives'
import {
  addChecklistItem, addComment, deleteChecklistItem, deleteTask,
  toggleChecklistItem, updateTask,
} from '@/lib/server/ops/actions'
import { ActivityFeed } from '@/components/ops/activity-feed'
import { PRIORITIES, PRIORITY, STATUS, STATUSES } from '@/lib/ops/constants'
import { useSave } from '@/lib/ops/use-save'
import { cn, formatDate, relative, toDateInput } from '@/lib/ops/utils'
import type {
  ActivityEntry, ChecklistItem, Comment, Person, Priority, Project, TaskRow,
  TaskStatus,
} from '@/types/ops'

export interface DrawerData {
  checklist: ChecklistItem[]
  comments: (Comment & { author?: Pick<Person, 'id' | 'name' | 'avatar_url'> | null })[]
  activity: ActivityEntry[]
  collaborators: Pick<Person, 'id' | 'name' | 'avatar_url'>[]
}

export function TaskDrawer(props: {
  task: TaskRow | null
  data: DrawerData | null
  people: Person[]
  projects: Pick<Project, 'id' | 'name'>[]
  /** Re-reads the checklist and comments after they change. */
  onReload?: () => void
  onClose: () => void
}) {
  // Remount per task so the local field mirrors start from the right values
  // instead of being synced in an effect.
  const { task, ...rest } = props
  if (!task) return null
  return <Body key={task.id} task={task} {...rest} />
}

function Body({
  task, data, people, projects, onReload, onClose,
}: {
  task: TaskRow
  data: DrawerData | null
  people: Person[]
  projects: Pick<Project, 'id' | 'name'>[]
  onReload?: () => void
  onClose: () => void
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [comment, setComment] = useState('')
  const [newItem, setNewItem] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Everything saves on change or blur, through the one hook that reports
  // what the server actually said. The previous version awaited the write,
  // discarded its result and flashed "Saved" either way, so a field could
  // claim success while holding nothing.
  // What the server currently holds for the free-text fields. Comparing a
  // blur against the `task` prop instead compares against the row as it was
  // when the drawer opened, which goes stale the moment anything saves, and
  // a stale match skips the write, losing the edit.
  const initialTime = task.due_time?.slice(0, 5) ?? ''
  const [dueTime, setDueTime] = useState(initialTime)
  const lastSaved = useRef({ title: task.title, notes: task.notes ?? '', dueTime: initialTime })

  const persist = useSave({ onSaved: onReload })
  const { saved } = persist

  const save = (patch: Parameters<typeof updateTask>[1]) =>
    void persist.save(() => updateTask(task.id, patch))

  return (
    <>
      <div className="anim-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        className="anim-pop fixed inset-0 z-50 m-auto flex h-fit max-h-[88dvh] w-[calc(100%-32px)] max-w-xl flex-col overflow-hidden rounded-[var(--alac-radius)] border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        role="dialog"
        aria-label="Task"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-[10px] text-[var(--text-muted)]">
            {task.project?.name ?? 'No project'}
          </span>
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-2.5 w-2.5" />
              Saved
            </span>
          )}
          {persist.saving && (
            <span className="text-[10px] text-[var(--text-muted)]">Saving…</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon-sm" variant="ghost" title="Delete task"
              onClick={() => {
                if (!confirm('Delete this task?')) return
                start(async () => {
                  await deleteTask(task.id)
                  onClose()
                  router.refresh()
                })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onClose} title="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {persist.error && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <span>{persist.error}</span>
                <button
                  type="button" onClick={persist.clearError}
                  className="shrink-0 rounded-[3px] px-1 font-medium hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim()
                if (!next || next === lastSaved.current.title) return
                void persist.save(() => updateTask(task.id, { title: next }))
                  .then((ok) => { if (ok) lastSaved.current.title = next })
              }}
              rows={2}
              className="w-full resize-none bg-transparent text-base font-semibold leading-snug outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  className="w-full"
                  value={task.status}
                  onChange={(e) => save({ status: e.target.value as TaskStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS[s].label}</option>
                  ))}
                </Select>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {STATUS[task.status].hint}
                </p>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  className="w-full"
                  value={task.priority}
                  onChange={(e) => save({ priority: e.target.value as Priority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p].label}, {PRIORITY[p].turnaround}
                    </option>
                  ))}
                </Select>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  Target: {PRIORITY[task.priority].turnaround}
                </p>
              </div>
              <div>
                <Label>Assigned to</Label>
                <Select
                  className="w-full"
                  value={task.assignee_id ?? ''}
                  onChange={(e) => save({ assignee_id: e.target.value || null })}
                >
                  <option value="">Nobody yet</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                {task.creator && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <Avatar id={task.creator.id} name={task.creator.name}
                            src={task.creator.avatar_url} size="xs" />
                    Asked by {task.creator.name}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <Label>Due</Label>
                <div className="flex gap-1">
                  <Input
                    className="min-w-0 flex-1"
                    type="date"
                    value={toDateInput(task.due_date)}
                    onChange={(e) => {
                      // Clearing the date clears the time, here and in the database.
                      if (!e.target.value) { setDueTime(''); lastSaved.current.dueTime = '' }
                      save({ due_date: e.target.value || null })
                    }}
                  />
                  <Input
                    className="w-32"
                    type="time"
                    value={dueTime}
                    disabled={!task.due_date}
                    aria-label="Due time, optional"
                    title={task.due_date ? 'Optional time' : 'Pick a date first'}
                    onChange={(e) => setDueTime(e.target.value)}
                    // Saved on blur: the native input fires a change per segment typed.
                    onBlur={() => {
                      if (dueTime === lastSaved.current.dueTime) return
                      const next = dueTime
                      void persist.save(() => updateTask(task.id, { due_time: next || null }))
                        .then((ok) => { if (ok) lastSaved.current.dueTime = next })
                    }}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <Label>Project</Label>
                <Select
                  className="w-full"
                  value={task.project_id ?? ''}
                  onChange={(e) => save({ project_id: e.target.value || null })}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            {task.status === 'blocked' && (
              <div className="rounded border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <Label>What is blocking this?</Label>
                <Input
                  autoFocus={!task.blocked_reason}
                  defaultValue={task.blocked_reason ?? ''}
                  onBlur={(e) => e.target.value !== (task.blocked_reason ?? '') &&
                                 save({ blocked_reason: e.target.value || null })}
                  placeholder="Waiting on footage from the shoot"
                />
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  This goes out with the notification, so make it specific.
                </p>
              </div>
            )}

            {/* Collaborators, people who hear about it without owning it. */}
            {(data?.collaborators?.length ?? 0) > 0 && (
              <div>
                <Label>Also watching</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {data!.collaborators.map((c) => (
                    <span key={c.id}
                          className="flex items-center gap-1 rounded-full bg-[var(--surface-hover)] py-0.5 pl-0.5 pr-2 text-[10px]">
                      <Avatar id={c.id} name={c.name} src={c.avatar_url} size="xs" />
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes === lastSaved.current.notes) return
                  const attempted = notes
                  void persist.save(() => updateTask(task.id, { notes: attempted }))
                    .then((ok) => { if (ok) lastSaved.current.notes = attempted })
                }}
                placeholder="Context, links, anything useful…"
              />
            </div>

            {/* The procedure this task follows.
                Sits directly above the checklist because that is the moment
                somebody needs it: they are about to work the steps. */}
            {task.sop && (
              <a
                href={task.sop.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-[3px] border border-brand-200 bg-brand-50 px-2.5 py-2 text-[11px] font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-100 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-200 dark:hover:bg-brand-950"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{task.sop.title}</span>
                <ExternalLink className="ml-auto h-3 w-3 shrink-0" />
              </a>
            )}

            {/* Checklist */}
            <div className="border-t border-[var(--border)] pt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="text-[11px] font-semibold">Checklist</span>
                {data?.checklist.length ? (
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    {data.checklist.filter((c) => c.is_done).length} of {data.checklist.length}
                  </span>
                ) : null}
              </div>

              <ul className="space-y-0.5">
                {data?.checklist.map((item) => (
                  <li key={item.id} className="group/i flex items-center gap-2 py-0.5">
                    <Checkbox
                      checked={item.is_done}
                      onChange={(e) => void persist.save(
                        () => toggleChecklistItem(item.id, e.target.checked))}
                    />
                    <span className={cn('flex-1 text-[11px]',
                      item.is_done && 'text-[var(--text-muted)] line-through')}>
                      {item.content}
                    </span>
                    <button
                      onClick={() => void persist.save(
                        () => deleteChecklistItem(item.id))}
                      className="opacity-0 transition-opacity group-hover/i:opacity-100"
                      aria-label="Remove step"
                    >
                      <X className="h-3 w-3 text-[var(--text-muted)] hover:text-rose-600" />
                    </button>
                  </li>
                ))}
              </ul>

              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim()) {
                    // Kept in the box until the write is confirmed: clearing
                    // first loses the text if the save fails.
                    void persist.save(() => addChecklistItem(task.id, newItem))
                      .then((ok) => { if (ok) setNewItem('') })
                  }
                }}
                placeholder="Add a step…"
                className="mt-1.5 h-7 text-[11px]"
              />
            </div>

            {/* Comments */}
            <div className="border-t border-[var(--border)] pt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="text-[11px] font-semibold">Comments</span>
              </div>

              <ul className="space-y-2.5">
                {data?.comments.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <Avatar id={c.author_id} name={c.author?.name}
                            src={c.author?.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px]">
                        <span className="font-medium">{c.author?.name ?? 'Someone'}</span>
                        <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                          {relative(c.created_at)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">
                        {c.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <Textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && comment.trim()) {
                    void persist.save(() => addComment(task.id, comment))
                      .then((ok) => { if (ok) setComment('') })
                  }
                }}
                placeholder="Add a comment, Ctrl or Cmd + Enter to send"
                className="mt-2 text-[11px]"
              />
              {/* The shortcut alone left touch and pointer users with no way to send. */}
              <div className="mt-1.5 flex justify-end">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={!comment.trim()}
                  onClick={() => void persist.save(() => addComment(task.id, comment))
                    .then((ok) => { if (ok) setComment('') })}
                >
                  Send
                </Button>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="text-[11px] font-semibold">History</span>
              </div>
              <ActivityFeed entries={data?.activity ?? []} limit={20} />
            </div>

            <p className="border-t border-[var(--border)] pt-3 text-[10px] text-[var(--text-muted)]">
              Created {formatDate(task.created_at)}
              {task.done_at && ` · Done ${formatDate(task.done_at)}`}
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
