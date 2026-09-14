'use client'

/**
 * Describe the work, check the drafts, create them.
 *
 * Plans get said out loud or typed as a paragraph, not entered field by field,
 * so the input is a description, written or dictated, and the model does the
 * filing. With no OpenAI key the pattern parser drafts instead and the banner
 * says so.
 *
 * The review step is not ceremony: prose read by a model will sometimes get a
 * name, a Friday or a function wrong, and fixing one row before creating is
 * cheaper than finding it on the board. Nothing is written until Create.
 */
import { useEffect, useState, useTransition } from 'react'
import { Mic, Plus, Sparkles, X } from 'lucide-react'
import { Button, Input, Label, Select, Textarea } from '@/components/ops/ui/primitives'
import { createDraftedTasks, draftTasks, type DraftTask } from '@/lib/server/ops/actions'
import { useDictation } from '@/components/ops/use-dictation'
import { PRIORITIES, PRIORITY } from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person, Priority, Project } from '@/types/ops'

interface Fn { id: string; key: string; name: string }

const MAX_CHARS = 4000

const PLACEHOLDER = `Describe the work. One task or a whole plan: who, what, by when.

e.g. Darwin, finish the Program Manager research by Friday. I need the candidate campaign built before the 3pm call tomorrow, it's urgent.`

const BLANK: DraftTask = {
  title: '', notes: null, assignee_id: null, function_id: null, project_id: null,
  priority: 'normal', due_date: null, due_time: null, problems: [],
}

export function BulkTasks({
  open, onClose, people, projects, functions,
}: {
  open: boolean
  onClose: () => void
  people: Person[]
  projects: Project[]
  functions: Fn[]
  me: Person
}) {
  const [drafting, startDraft] = useTransition()
  const [creating, startCreate] = useTransition()
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<DraftTask[] | null>(null)
  const [source, setSource] = useState<{ kind: 'ai' | 'parser'; note?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const voice = useDictation(text, setText)

  const close = () => {
    voice.stop()
    setText(''); setDrafts(null); setSource(null); setError(null); setDone(null)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const draft = () => {
    if (!text.trim() || drafting) return
    voice.stop()
    setError(null)
    startDraft(async () => {
      const res = await draftTasks(text)
      if (!res.ok) { setError(res.error); return }
      if (!res.data?.tasks.length) {
        setError('Nothing to draft in that. Say what needs doing, and by whom.')
        return
      }
      setDrafts(res.data.tasks)
      setSource({ kind: res.data.source, note: res.data.note })
    })
  }

  const edit = (i: number, patch: Partial<DraftTask>) =>
    setDrafts((d) => d!.map((row, n) => (n === i ? { ...row, ...patch } : row)))

  const usable = (drafts ?? []).filter((d) => d.title.trim())

  const create = () => startCreate(async () => {
    setError(null)
    if (!usable.length) { setError('Every row needs a title.'); return }
    const res = await createDraftedTasks(usable)
    if (!res.ok) { setError(res.error); return }
    const created = res.data?.created ?? 0
    const skipped = res.data?.skipped ?? 0
    setDone(`Created ${created} task${created === 1 ? '' : 's'}.` +
      (skipped ? ` Skipped ${skipped} with no title.` : ''))
    if (created === usable.length) setTimeout(close, 1200)
  })

  if (!open) return null

  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6"
         onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="describe-tasks-title"
           className="anim-pop w-full max-w-4xl rounded-md border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <p id="describe-tasks-title" className="text-sm font-semibold">Describe tasks</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Write it or say it. Check the drafts, then create.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          {error && (
            <p role="alert"
               className="rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </p>
          )}
          {done && (
            <p role="status"
               className="rounded-[3px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              {done}
            </p>
          )}

          {drafting ? (
            <div className="space-y-2" aria-busy="true" aria-label="Drafting tasks">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-md border border-[var(--border)] p-2.5">
                  <div className="skeleton h-8 w-3/5 rounded-[3px]" />
                  <div className="mt-2 flex gap-2">
                    <div className="skeleton h-8 w-1/4 rounded-[3px]" />
                    <div className="skeleton h-8 w-1/5 rounded-[3px]" />
                    <div className="skeleton h-8 w-1/6 rounded-[3px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : !drafts ? (
            <>
              <Label htmlFor="describe-tasks">What needs doing</Label>
              <Textarea
                id="describe-tasks"
                autoFocus
                rows={9}
                maxLength={MAX_CHARS}
                className="w-full text-[13px] leading-relaxed"
                value={text}
                placeholder={PLACEHOLDER}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); draft() }
                }}
              />
              {voice.error && (
                <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-400">{voice.error}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={draft} disabled={!text.trim()}>
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> Draft tasks
                </Button>
                {/* A disabled button swallows hover, so the reason sits on its wrapper. */}
                <span title={voice.supported ? undefined : 'Voice needs Chrome or Edge'}>
                  <Button
                    size="sm"
                    variant={voice.listening ? 'danger' : 'secondary'}
                    disabled={!voice.supported}
                    aria-pressed={voice.listening}
                    aria-label={voice.listening ? 'Stop dictation' : 'Dictate'}
                    onClick={voice.listening ? voice.stop : voice.start}
                  >
                    <Mic className={cn('h-3.5 w-3.5', voice.listening && 'motion-safe:animate-pulse')}
                         strokeWidth={1.5} />
                    {voice.listening ? 'Listening' : 'Dictate'}
                  </Button>
                </span>
                <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                  {text.length}/{MAX_CHARS} · Ctrl+Enter to draft
                </span>
              </div>
            </>
          ) : (
            <>
              {source && (
                <p className={cn(
                  'rounded-[3px] border px-2.5 py-1.5 text-[11px]',
                  source.kind === 'ai'
                    ? 'border-[var(--border-strong)] text-[var(--text-secondary)]'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
                )}>
                  {source.kind === 'ai'
                    ? `Drafted by AI. Check every row before creating.${source.note ? ` ${source.note}` : ''}`
                    : source.note}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {drafts.length} draft{drafts.length === 1 ? '' : 's'}. Fix anything wrong before creating.
                </p>
                <Button size="xs" variant="ghost" onClick={() => { setDrafts(null); setSource(null) }}>
                  Back to the description
                </Button>
              </div>

              <div className="rise-list max-h-[52vh] space-y-2 overflow-y-auto">
                {drafts.map((d, i) => (
                  <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-6">
                        <Label>Task</Label>
                        <Input value={d.title} maxLength={200}
                               onChange={(e) => edit(i, { title: e.target.value })} />
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Who</Label>
                        <Select className="w-full" value={d.assignee_id ?? ''}
                                onChange={(e) => edit(i, { assignee_id: e.target.value || null })}>
                          <option value="">Unassigned</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Priority</Label>
                        <Select className="w-full" value={d.priority}
                                onChange={(e) => edit(i, { priority: e.target.value as Priority })}>
                          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Function</Label>
                        <Select className="w-full" value={d.function_id ?? ''}
                                onChange={(e) => edit(i, { function_id: e.target.value || null })}>
                          <option value="">Default</option>
                          {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Project</Label>
                        <Select className="w-full" value={d.project_id ?? ''}
                                onChange={(e) => edit(i, { project_id: e.target.value || null })}>
                          <option value="">None</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Due</Label>
                        <Input type="date" value={d.due_date ?? ''}
                               onChange={(e) => edit(i, { due_date: e.target.value || null })} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Time</Label>
                        <Input type="time" value={d.due_time ?? ''}
                               onChange={(e) => edit(i, { due_time: e.target.value || null })} />
                      </div>
                      <div className="flex items-end justify-end sm:col-span-1">
                        <Button variant="ghost" size="icon" title="Remove this row" aria-label="Remove this row"
                                onClick={() => setDrafts((r) => r!.filter((_, n) => n !== i))}>
                          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </div>
                    {d.notes && (
                      <p className="mt-1.5 whitespace-pre-line text-[11px] text-[var(--text-muted)]">{d.notes}</p>
                    )}
                    {d.problems.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                        {d.problems.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                <Button variant="primary" size="sm" onClick={create}
                        disabled={creating || !usable.length || Boolean(done)}>
                  {creating ? 'Creating...' : `Create ${usable.length} task${usable.length === 1 ? '' : 's'}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafts([...drafts, { ...BLANK }])}>
                  <Plus className="h-3 w-3" strokeWidth={1.5} /> Add a row
                </Button>
                <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
