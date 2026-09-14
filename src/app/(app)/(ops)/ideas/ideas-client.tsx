'use client'

/**
 * Ideas, and what happened to them.
 *
 * Suggestions arrive in Slack and vanish, not rejected, just lost. Somebody
 * who watches three of theirs disappear stops offering a fourth, so the point
 * of this page is less the capture than the visible answer: planned, shipped,
 * or not going ahead and why.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, Lightbulb, Plus, Star } from 'lucide-react'
import {
  Button, EmptyState, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import { createIdea, toggleIdeaVote, updateIdea } from '@/lib/server/ops/actions'
import { atLeast } from '@/lib/ops/constants'
import { cn, relative } from '@/lib/ops/utils'
import type { Person } from '@/types/ops'

interface Idea {
  id: string
  title: string
  problem: string | null
  proposal: string | null
  category: string | null
  impact: string
  status: string
  is_priority: boolean
  owner_id: string | null
  submitted_by_name: string | null
  owner_name: string | null
  outcome_note: string | null
  votes: number
  created_at: string
}

const STATUS: Record<string, { label: string; chip: string }> = {
  new:         { label: 'New',         chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  reviewing:   { label: 'Reviewing',   chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  planned:     { label: 'Planned',     chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  in_progress: { label: 'In progress', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  implemented: { label: 'Shipped',     chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  declined:    { label: 'Not doing',   chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

const CATEGORIES = [
  'Mission Control', 'GTM', 'Recruiting', 'Delivery',
  'Marketing', 'Process', 'Other',
]

export function IdeasClient({
  me, people, ideas, myVotes,
}: {
  me: Person
  people: Person[]
  ideas: Idea[]
  myVotes: string[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('open')
  const [error, setError] = useState<string | null>(null)
  const canDecide = atLeast(me.role, 'admin')

  const [f, setF] = useState({
    title: '', problem: '', proposal: '', category: '', impact: 'medium',
  })

  const shown = useMemo(() => {
    const rows = ideas.filter((i) => {
      if (filter === 'open') return !['implemented', 'declined'].includes(i.status)
      if (filter === 'mine') return i.submitted_by_name === me.name
      if (filter === 'all') return true
      return i.status === filter
    })
    // Priority first, then what the team wants most, then newest.
    return [...rows].sort((a, b) =>
      Number(b.is_priority) - Number(a.is_priority)
      || b.votes - a.votes
      || b.created_at.localeCompare(a.created_at))
  }, [ideas, filter, me.name])

  const submit = () => start(async () => {
    setError(null)
    const r = await createIdea(f)
    if (!r.ok) { setError(r.error); return }
    setF({ title: '', problem: '', proposal: '', category: '', impact: 'medium' })
    setAdding(false)
    router.refresh()
  })

  const counts = {
    open: ideas.filter((i) => !['implemented', 'declined'].includes(i.status)).length,
    shipped: ideas.filter((i) => i.status === 'implemented').length,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ideas</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {counts.open} open · {counts.shipped} shipped
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select className="h-7 text-[11px]" value={filter}
                  onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open</option>
            <option value="mine">Mine</option>
            <option value="implemented">Shipped</option>
            <option value="declined">Not doing</option>
            <option value="all">All</option>
          </Select>
          <Button size="xs" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3 w-3" /> Add idea
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert"
           className="rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      {adding && (
        <Panel>
          <PanelHeader title="What could work better?" />
          <div className="space-y-2.5 p-4">
            {error && (
              <p role="alert" className="rounded-[3px] bg-rose-50 px-2 py-1 text-[11px] text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                {error}
              </p>
            )}
            <div>
              <Label htmlFor="idea-title">Idea</Label>
              <Input id="idea-title" autoFocus className="w-full" value={f.title}
                     placeholder="Requisitions should show time since last client contact"
                     onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="idea-problem">What is the problem?</Label>
              <Textarea id="idea-problem" rows={2} className="w-full" value={f.problem}
                        placeholder="Optional, what makes this worth changing"
                        onChange={(e) => setF({ ...f, problem: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="idea-proposal">What would you do?</Label>
              <Textarea id="idea-proposal" rows={2} className="w-full" value={f.proposal}
                        placeholder="Optional"
                        onChange={(e) => setF({ ...f, proposal: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label>Area</Label>
                <Select className="w-full" value={f.category}
                        onChange={(e) => setF({ ...f, category: e.target.value })}>
                  <option value="">Unspecified</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <Label>Impact</Label>
                <Select className="w-full" value={f.impact}
                        onChange={(e) => setF({ ...f, impact: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={submit} disabled={!f.title.trim()}>Submit</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        </Panel>
      )}

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Lightbulb}
            title={filter === 'open' ? 'No open ideas' : 'Nothing here'}
            description="Anything that would make the work easier is worth writing down."
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {shown.map((i) => (
            <Panel key={i.id}>
              <div className="flex items-start gap-3 p-3">
                <button
                  onClick={() => start(async () => {
                    await toggleIdeaVote(i.id); router.refresh()
                  })}
                  title={myVotes.includes(i.id) ? 'Remove your vote' : 'Vote for this'}
                  className={cn(
                    'flex w-9 shrink-0 flex-col items-center rounded-[3px] border py-1 transition-colors',
                    myVotes.includes(i.id)
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
                  )}
                >
                  <ChevronUp className="h-3 w-3" />
                  <span className="text-[11px] tabular">{i.votes}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {i.is_priority && (
                      <Star className="h-3 w-3 fill-current text-amber-500" aria-label="Leadership priority" />
                    )}
                    <span className="text-xs font-medium">{i.title}</span>
                    <span className={cn('rounded-[3px] px-1.5 py-0.5 text-[10px]',
                                        STATUS[i.status]?.chip)}>
                      {STATUS[i.status]?.label ?? i.status}
                    </span>
                    {i.category && (
                      <span className="text-[10px] text-[var(--text-muted)]">{i.category}</span>
                    )}
                  </div>

                  {i.problem && (
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{i.problem}</p>
                  )}
                  {i.proposal && (
                    <p className="mt-0.5 text-[11px] italic text-[var(--text-muted)]">
                      {i.proposal}
                    </p>
                  )}
                  {i.outcome_note && (
                    <p className="mt-1 rounded-[3px] bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {i.outcome_note}
                    </p>
                  )}

                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {i.submitted_by_name ?? 'Someone'} · {relative(i.created_at)}
                    {i.owner_name && ` · ${i.owner_name} owns it`}
                  </p>

                  {canDecide && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Select
                        className="h-6 text-[10px]"
                        value={i.status}
                        onChange={(e) => start(async () => {
                          const r = await updateIdea(i.id, { status: e.target.value })
                          if (!r.ok) { setError(r.error); return }
                          router.refresh()
                        })}
                      >
                        {Object.entries(STATUS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </Select>
                      <Select
                        className="h-6 text-[10px]"
                        value={i.owner_id ?? ''}
                        onChange={(e) => start(async () => {
                          const r = await updateIdea(i.id, { owner_id: e.target.value || null })
                          if (!r.ok) { setError(r.error); return }
                          router.refresh()
                        })}
                      >
                        <option value="">Nobody yet</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                      <button
                        onClick={() => start(async () => {
                          const r = await updateIdea(i.id, { is_priority: !i.is_priority })
                          if (!r.ok) { setError(r.error); return }
                          router.refresh()
                        })}
                        className="rounded-[3px] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                      >
                        {i.is_priority ? 'Unpin' : 'Mark priority'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
