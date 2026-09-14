/**
 * The SOP library.
 *
 * The problem this solves is not "we have no SOPs", there are sixteen in
 * Drive. It is that a person with a job in front of them has to know which of
 * the sixteen explains it. So this leads with the two documents everybody
 * reads, then groups the rest by the same functions the boards use, and lets
 * someone type three letters to find the one they mean.
 *
 * Drive stays the source of truth for content. This owns the pointers.
 */
'use client'

import { useMemo, useState } from 'react'
import { BookOpen, ExternalLink, Search, Star } from 'lucide-react'
import { EmptyState, Input, Panel } from '@/components/ops/ui/primitives'
import { SOURCE_LINKS } from '@/lib/ops/constants'
import { SourceLink } from '@/components/ops/source-link'
import { cn } from '@/lib/ops/utils'
import type { OrgFunction, Person, Sop } from '@/types/ops'

export function SopsClient({
  sops, functions,
}: {
  sops: Sop[]
  functions: OrgFunction[]
  me: Person
}) {
  const [q, setQ] = useState('')
  const [fn, setFn] = useState('')

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sops.filter((s) => {
      if (fn && s.function_id !== fn) return false
      if (!needle) return true
      return `${s.title} ${s.summary ?? ''}`.toLowerCase().includes(needle)
    })
  }, [sops, q, fn])

  // Read-me-first material sits above the functional folders, but only when
  // it survives the current filter, a search for "intake" should not still
  // be showing the playbook.
  const essential = matches.filter((s) => s.is_essential)
  const rest = matches.filter((s) => !s.is_essential)

  const groups = useMemo(() => {
    const byFn = new Map<string, Sop[]>()
    for (const s of rest) {
      const key = s.function_id ?? 'other'
      const list = byFn.get(key)
      if (list) list.push(s); else byFn.set(key, [s])
    }
    // Ordered by the org's own function order, so this page and the boards
    // list departments the same way.
    const ordered = functions
      .filter((f) => byFn.has(f.key))
      .map((f) => ({ key: f.key, label: f.name, color: f.color, items: byFn.get(f.key)! }))
    if (byFn.has('other')) {
      ordered.push({
        key: 'other', label: 'Everything else', color: '',
        items: byFn.get('other')!,
      })
    }
    return ordered
  }, [rest, functions])

  // Only offer a filter for functions that actually have a procedure behind
  // them; an empty category is a dead end.
  const usable = functions.filter((f) => sops.some((s) => s.function_id === f.key))

  return (
    <div className="mx-auto max-w-4xl p-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">SOPs</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          How the work is done. Start with the two below, then find the
          procedure for your job.
        </p>
        <SourceLink className="mt-1.5" {...SOURCE_LINKS.sops} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            className="pl-7" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search procedures"
          />
        </div>

        <button
          onClick={() => setFn('')}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            fn === ''
              ? 'border-transparent bg-[var(--text-primary)] text-[var(--surface)]'
              : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
          )}
        >
          All
        </button>
        {usable.map((f) => {
          const on = fn === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFn(on ? '' : f.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                on
                  ? 'border-transparent text-white'
                  : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
              )}
              style={on ? { backgroundColor: f.color } : undefined}
            >
              {!on && (
                <span className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: f.color }} />
              )}
              {f.name}
            </button>
          )
        })}
      </div>

      {matches.length === 0 ? (
        <Panel>
          <EmptyState
            icon={BookOpen}
            title="No procedure matches that"
            description="Try a different word, or clear the filter."
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {essential.length > 0 && (
            <div>
              <h2 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <Star className="h-3 w-3 text-amber-500" />
                Start here
              </h2>
              <Panel>
                {essential.map((s) => <Row key={s.id} sop={s} />)}
              </Panel>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.key}>
              <h2 className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {g.color && (
                  <span className="h-2.5 w-1 rounded-full"
                        style={{ backgroundColor: g.color }} />
                )}
                {g.label}
              </h2>
              <Panel>
                {g.items.map((s) => <Row key={s.id} sop={s} />)}
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One procedure.
 *
 * The whole row is the link. Somebody looking for a document should not have
 * to find a small target inside it.
 */
function Row({ sop }: { sop: Sop }) {
  return (
    <a
      href={sop.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 transition-colors last:border-0 hover:bg-[var(--surface-hover)]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium group-hover:text-brand-600">
          {sop.title}
        </p>
        {sop.summary && (
          <p className="truncate text-[10px] text-[var(--text-muted)]">
            {sop.summary}
          </p>
        )}
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] group-hover:text-brand-600" />
    </a>
  )
}
