'use client'

/**
 * Paste a plan, review it, save it.
 *
 * Breaking a project into tasks happens in a chat window, and retyping
 * fifteen of them by hand is enough friction that people keep the plan in
 * the chat instead. So the paste is the input.
 *
 * The review step is not ceremony: a parser reading somebody's prose will
 * get names, dates and functions wrong sometimes, and finding that out after
 * fifteen tasks exist is worse than fixing one row before saving. Nothing is
 * written until Save all.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button, Input, Label, Select, Textarea } from '@/components/ops/ui/primitives'
import { parseTasks, type ParsedTask } from '@/lib/ops/task-parse'
import { createTask } from '@/lib/server/ops/actions'
import { PRIORITIES, PRIORITY } from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person, Project } from '@/types/ops'

interface Fn { id: string; key: string; name: string }

const EXAMPLE = `Task: Build candidate campaign
Function: Delivery
Project: Director of Operations Search
Who: Adrian
Priority: High
Due: Today
Notes: Complete talent mapping before campaign creation

Task: Research Program Manager
Function: Business Development
Who: Darwin
Priority: High`

export function BulkTasks({
  open, onClose, people, projects, functions, me,
}: {
  open: boolean
  onClose: () => void
  people: Person[]
  projects: Project[]
  functions: Fn[]
  me: Person
}) {
  const router = useRouter()
  const [saving, start] = useTransition()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ParsedTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const parse = () => {
    const parsed = parseTasks(text)
    if (!parsed.length) {
      setError('Nothing recognisable in that. Each task needs at least a title.')
      return
    }
    setError(null)
    setRows(parsed)
  }

  const edit = (i: number, patch: Partial<ParsedTask>) =>
    setRows((r) => r!.map((row, n) => (n === i ? { ...row, ...patch } : row)))

  const drop = (i: number) => setRows((r) => r!.filter((_, n) => n !== i))

  // Resolved once, here, so a name that matches nobody is visible in the
  // review rather than silently becoming unassigned on save.
  const resolve = useMemo(() => ({
    person: (name?: string) => name
      ? people.find((p) => p.name.toLowerCase().startsWith(name.trim().toLowerCase()))?.id
      : undefined,
    project: (name?: string) => name
      ? projects.find((p) => p.name.toLowerCase().includes(name.trim().toLowerCase()))?.id
      : undefined,
    fn: (key?: string) => key
      ? functions.find((f) => f.key === key)?.id
      : undefined,
  }), [people, projects, functions])

  const saveAll = () => start(async () => {
    setError(null)
    const usable = (rows ?? []).filter((r) => r.title.trim())
    if (!usable.length) { setError('Nothing left to save.'); return }

    let made = 0
    for (const r of usable) {
      const res = await createTask({
        title: r.title.trim(),
        project_id: resolve.project(r.project),
        function_id: resolve.fn(r.function_key),
        assignee_id: resolve.person(r.who) ?? me.id,
        priority: r.priority ?? 'normal',
        due_date: r.due ?? undefined,
        notes: r.notes ?? undefined,
      })
      if (res.ok) made++
    }
    setSaved(made)
    setRows(null)
    setText('')
    router.refresh()
    // Left open briefly so the count is seen, then closed.
    setTimeout(() => { setSaved(null); onClose() }, 1600)
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6"
         onClick={onClose}>
      <div className="w-full max-w-4xl rounded-md bg-[var(--surface-raised)] shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Add several tasks</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Paste a plan, check what it read, then save.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="rounded-[3px] p-1 hover:bg-[var(--surface-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error && (
            <p role="alert"
               className="rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </p>
          )}
          {saved !== null && (
            <p className="rounded-[3px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              {saved} task{saved === 1 ? '' : 's'} added.
            </p>
          )}

          {!rows ? (
            <>
              <Label htmlFor="bulk-paste">Paste your tasks</Label>
              <Textarea
                id="bulk-paste"
                rows={12}
                className="w-full font-mono text-[11px]"
                value={text}
                placeholder={EXAMPLE}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={parse} disabled={!text.trim()}>
                  Read these
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {rows.length} task{rows.length === 1 ? '' : 's'} read. Fix anything
                  wrong before saving.
                </p>
                <Button size="xs" variant="ghost" onClick={() => setRows(null)}>
                  Back to the paste
                </Button>
              </div>

              <div className="max-h-[52vh] space-y-2 overflow-y-auto">
                {rows.map((r, i) => (
                  <div key={i}
                       className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Label>Task</Label>
                        <Input className="w-full" value={r.title}
                               onChange={(e) => edit(i, { title: e.target.value })} />
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Function</Label>
                        <Select className="w-full" value={r.function_key ?? ''}
                                onChange={(e) => edit(i, { function_key: e.target.value || undefined })}>
                          <option value="">None</option>
                          {functions.map((f) => (
                            <option key={f.id} value={f.key}>{f.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Who</Label>
                        <Select
                          className="w-full"
                          value={resolve.person(r.who) ?? ''}
                          onChange={(e) => edit(i, {
                            who: people.find((p) => p.id === e.target.value)?.name,
                          })}
                        >
                          <option value="">{me.name}</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Priority</Label>
                        <Select className="w-full" value={r.priority ?? 'normal'}
                                onChange={(e) => edit(i, {
                                  priority: e.target.value as ParsedTask['priority'],
                                })}>
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{PRIORITY[p].label}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-4">
                        <Label>Project</Label>
                        <Select
                          className="w-full"
                          value={resolve.project(r.project) ?? ''}
                          onChange={(e) => edit(i, {
                            project: projects.find((p) => p.id === e.target.value)?.name,
                          })}
                        >
                          <option value="">None</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Due</Label>
                        <Input type="date" className="w-full" value={r.due ?? ''}
                               onChange={(e) => edit(i, { due: e.target.value || undefined })} />
                      </div>
                      <div className="sm:col-span-5">
                        <Label>Notes</Label>
                        <Input className="w-full" value={r.notes ?? ''}
                               onChange={(e) => edit(i, { notes: e.target.value || undefined })} />
                      </div>
                      <div className="flex items-end sm:col-span-1">
                        <button onClick={() => drop(i)}
                                title="Drop this one"
                                className="rounded-[3px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-rose-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* What the parser could not read, on the row it affects. */}
                    {(r.problems.length > 0 || (r.who && !resolve.person(r.who))) && (
                      <p className={cn(
                        'mt-1.5 text-[10px]',
                        'text-amber-700 dark:text-amber-400',
                      )}>
                        {[...r.problems,
                          r.who && !resolve.person(r.who)
                            ? `No "${r.who}" on the team, it will go to you`
                            : '',
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                <Button size="sm" onClick={saveAll} disabled={saving || !rows.length}>
                  {saving ? 'Saving…' : `Save all ${rows.length}`}
                </Button>
                <Button size="sm" variant="ghost"
                        onClick={() => setRows([...rows, { title: '', problems: [] }])}>
                  <Plus className="h-3 w-3" /> Add a row
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
