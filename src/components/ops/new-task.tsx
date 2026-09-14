/**
 * New task. One dialog, four fields, Ctrl or Cmd + Enter to save.
 *
 * Creating work must never cost more than a keystroke and a sentence, or
 * people stop recording it.
 */
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button, Input, Kbd, Label, Select, Textarea } from '@/components/ops/ui/primitives'
import { createTask } from '@/lib/server/ops/actions'
import { PRIORITIES, PRIORITY } from '@/lib/ops/constants'
import { toDateString } from '@/lib/ops/utils'
import type { Client, OrgFunction, Person, Priority, Project } from '@/types/ops'

export function NewTask({
  open, onClose, people, projects, functions, me, defaultProjectId,
  defaultFunctionId,
}: {
  open: boolean
  onClose: () => void
  people: Person[]
  projects: Pick<Project, 'id' | 'name' | 'department'>[]
  clients: Client[]
  functions: OrgFunction[]
  me: Person
  defaultProjectId?: string
  /** Prefilled when adding from a specific functional board. */
  defaultFunctionId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  // Function is required, this is what puts the task on a board even when
  // there is no project.
  const [functionId, setFunctionId] = useState(
    defaultFunctionId ?? me.function_id ?? functions[0]?.id ?? '')
  const [who, setWho] = useState(me?.id ?? '')
  const [priority, setPriority] = useState<Priority>('normal')
  const [due, setDue] = useState('')
  const [dueTime, setDueTime] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function submit() {
    if (!title.trim()) { setError('Give it a title'); return }
    setError(null)
    start(async () => {
      const r = await createTask({
        title,
        notes: notes || null,
        project_id: projectId || null,
        function_id: functionId,
        assignee_id: who || null,
        priority,
        due_date: due || null,
        due_time: (due && dueTime) || null,
      })
      if (!r.ok) { setError(r.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <div
      className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New task"
    >
      <div
        className="anim-pop w-full max-w-lg overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-xs font-semibold">New task</span>
          <button onClick={onClose} aria-label="Close"
                  className="ml-auto rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
            placeholder="What needs to happen?"
            className="h-9 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Function</Label>
              <Select className="w-full" value={functionId}
                      onChange={(e) => setFunctionId(e.target.value)}>
                {functions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Project</Label>
              <Select className="w-full" value={projectId}
                      onChange={(e) => {
                        setProjectId(e.target.value)
                        // Adopt the project's function so the task lands with
                        // its project rather than wherever the form opened.
                        const proj = projects.find((p) => p.id === e.target.value)
                        const match = proj && functions.find(
                          (f) => f.name.toLowerCase().includes(
                            String(proj.department).toLowerCase()))
                        if (match) setFunctionId(match.id)
                      }}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Who</Label>
              <Select className="w-full" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Nobody yet</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select className="w-full" value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}, {PRIORITY[p].turnaround}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Due</Label>
              <div className="flex gap-1">
                <Input className="min-w-0 flex-1" type="date" value={due} onChange={(e) => {
                  setDue(e.target.value)
                  // A time means nothing without its date.
                  if (!e.target.value) setDueTime('')
                }} />
                <Input className="w-32" type="time" value={dueTime} disabled={!due}
                       aria-label="Due time, optional"
                       title={due ? 'Optional time' : 'Pick a date first'}
                       onChange={(e) => setDueTime(e.target.value)} />
                <Button size="sm" variant="subtle"
                        onClick={() => setDue(toDateString(new Date()))}>
                  Today
                </Button>
              </div>
              {!due && (
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  Leave blank and it gets {PRIORITY[priority].turnaround}.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
              placeholder="Optional"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5">
          <span className="text-[10px] text-[var(--text-muted)]">
            <Kbd k="↵" /> to save
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={submit} disabled={pending}>
              {pending ? 'Adding…' : 'Add task'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
