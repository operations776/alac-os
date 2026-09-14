/**
 * Requisition Intelligence.
 *
 * Not an ATS. It holds no candidates, resumes, or interview schedules. It
 * answers one question: which of these searches deserve the team's time?
 *
 * Every number here is derived from facts someone entered (§13). Nobody is
 * asked whether a search is urgent or difficult; they give a target date and
 * a requirements list, and the system decides.
 */
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Plus } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Panel, PanelHeader, Select,
} from '@/components/ops/ui/primitives'
import { NewRequisition } from './new-requisition'
import { RequisitionDrawer } from './req-drawer'
import { InlineNumber } from '@/components/ops/inline-number'
import { updateRequisition } from '@/lib/server/ops/actions'
import {
  BEST_STAGE, DELIVERY_NEED, REQ_ACTION, REQ_GRADE,
} from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person, RequisitionRow } from '@/types/ops'

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`

/** One place a cell edit goes, so every column behaves the same. */
export function RequisitionsClient({
  me, reqs, portfolio, people,
}: {
  me: Person
  reqs: RequisitionRow[]
  portfolio: {
    activeCount: number; theoretical: number; weighted: number
    highConfidence: number; concentration: number
    needsAttention: number; calibrating: number
  }
  people: Person[]
}) {
  const router = useRouter()
  const [, start] = useTransition()

  /**
   * One place a cell edit goes.
   *
   * The row refreshes from the server afterwards rather than being patched
   * locally: target, next action and sourcing state are all computed there,
   * and a local guess would disagree with them.
   */
  const save = async (id: string, patch: Record<string, unknown>) => {
    const r = await updateRequisition(id, patch)
    if (r.ok) router.refresh()
    return r
  }

  const [openReq, setOpenReq] = useState<RequisitionRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [grade, setGrade] = useState('')
  const [need, setNeed] = useState('')
  const [owner, setOwner] = useState('')
  const [q, setQ] = useState('')
  // Active searches by default: a closed requisition is history, and history
  // in the working list makes the working list longer without making it
  // more useful. Everything stays reachable through the filter.
  const [scope, setScope] = useState<'open' | 'closed' | 'all'>('open')

  const CLOSED = ['filled', 'closed_lost', 'withdrawn']

  const rows = useMemo(() => reqs.filter((r) => {
    if (grade && r.live_grade !== grade) return false
    if (need && r.delivery_need !== need) return false
    if (owner && r.owner_id !== owner) return false
    if (scope === 'open' && CLOSED.includes(r.status ?? '')) return false
    if (scope === 'closed' && !CLOSED.includes(r.status ?? '')) return false
    if (q.trim()) {
      // One box across role and account: with a handful of clients, two
      // separate filters is two decisions to reach one row.
      const hay = `${r.role_title ?? ''} ${r.company ?? ''}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  }), [reqs, grade, need, owner, q, scope])

  const active = [
    grade && { label: `Grade ${grade}`, clear: () => setGrade('') },
    need && { label: `Need: ${need}`, clear: () => setNeed('') },
    owner && {
      label: `Owner: ${people.find((p) => p.id === owner)?.name ?? 'someone'}`,
      clear: () => setOwner(''),
    },
    q.trim() && { label: `"${q.trim()}"`, clear: () => setQ('') },
    scope !== 'open' && {
      label: scope === 'closed' ? 'Closed only' : 'All searches',
      clear: () => setScope('open'),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  const clearAll = () => {
    setGrade(''); setNeed(''); setOwner(''); setQ(''); setScope('open')
  }

  const feeOf = (r: RequisitionRow) =>
    (Number(r.comp_target ?? 0) * Number(r.fee_percent ?? 0) / 100) * r.openings

  // §34: one client carrying most of the pipeline is a risk worth naming.
  const conc = portfolio.concentration
  const concTone = conc > 60 ? 'text-rose-500'
    : conc > 40 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Requisitions</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {portfolio.activeCount} active ·{' '}
            {portfolio.needsAttention} need sourcing
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5" />
          Add requisition
        </Button>
      </div>

      {openReq && (
        <RequisitionDrawer
          req={openReq}
          people={people}
          onClose={() => setOpenReq(null)}
        />
      )}

      {adding && (
        <NewRequisition
          people={people} me={me}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* §33 portfolio roll-up. Weighted is the number that matters:
          theoretical assumes every search closes, and none of them do. */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Theoretical fee', value: money(portfolio.theoretical),
            hint: 'If every search closed' },
          { label: 'Weighted pipeline', value: money(portfolio.weighted),
            hint: 'Fee × close probability' },
          { label: 'High confidence', value: money(portfolio.highConfidence),
            hint: '60% or better' },
          { label: 'Client concentration', value: `${Math.round(conc)}%`,
            hint: 'Largest client share', tone: concTone },
        ].map((k) => (
          <div key={k.label}
               className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {k.label}
            </p>
            <p className={cn('mt-1 text-2xl font-semibold tabular', k.tone)}>{k.value}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{k.hint}</p>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title={scope === 'open' ? 'Active searches'
                 : scope === 'closed' ? 'Closed searches' : 'All searches'}
          action={
            <div className="flex items-center gap-1.5">
              <Input
                className="h-7 w-40 text-[11px]"
                placeholder="Role or account…"
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              />
              <Select className="h-7 text-[11px]" value={owner}
                      onChange={(e) => setOwner(e.target.value)}>
                <option value="">Anyone</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select className="h-7 text-[11px]" value={scope}
                      onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="open">Active</option>
                <option value="closed">Closed</option>
                <option value="all">All</option>
              </Select>
              <Select className="h-7 text-[11px]" value={grade}
                      onChange={(e) => setGrade(e.target.value)}>
                <option value="">All grades</option>
                {['A','B','C','D','F'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
              <Select className="h-7 text-[11px]" value={need}
                      onChange={(e) => setNeed(e.target.value)}>
                <option value="">All delivery needs</option>
                {Object.entries(DELIVERY_NEED).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </div>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={reqs.length ? 'Nothing matches' : 'No requisitions yet'}
            description={reqs.length
              ? undefined
              : 'Add a search and the system grades it, estimates close probability, and tells you what it needs.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Grade</th>
                  <th className="px-4 py-2 font-medium">Role / Account</th>
                  <th className="px-4 py-2 font-medium">Open</th>
                  <th className="px-4 py-2 font-medium">Search</th>
                  <th className="px-4 py-2 font-medium">Pipeline</th>
                  <th className="px-4 py-2 font-medium">Fee</th>
                  <th className="px-4 py-2 font-medium">Close</th>
                  <th className="px-4 py-2 font-medium">Weighted</th>
                  <th className="px-4 py-2 font-medium">Delivery need</th>
                  <th className="px-4 py-2 font-medium">Next</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = REQ_GRADE[r.live_grade ?? 'C']
                  const fee = feeOf(r)
                  const close = Number(r.live_close_pct ?? 0)
                  return (
                    <tr key={r.id}
                        onClick={() => setOpenReq(r)}
                        className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                      <td className="px-4 py-2">
                        <span className={cn('rounded-[3px] px-2 py-0.5 font-semibold', g.chip)}
                              title={g.meaning}>
                          {g.label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-[13px] font-semibold leading-tight">
                          {r.role_title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {r.company}
                          {r.best_stage !== 'none' && ` · ${BEST_STAGE[r.best_stage]}`}
                        </div>
                        {r.guardrail_note && (
                          <div className="mt-0.5 text-[10px] text-amber-500">
                            {r.guardrail_note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <InlineNumber
                          value={r.openings}
                          min={1}
                          title="How many seats are open"
                          onSave={(n) => save(r.id, { openings: n })}
                        />
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={r.search_difficulty ?? 'medium'}
                          onChange={(e) => start(async () => {
                            await save(r.id, { search_difficulty: e.target.value })
                            router.refresh()
                          })}
                          title="Difficulty sets the sourcing target: easy 5, medium 4, hard 3"
                          className="rounded-[3px] border border-[var(--border)] bg-transparent px-1 py-0.5 text-[11px] capitalize"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                        <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                          {r.sprint_target} target
                        </span>
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <InlineNumber
                          value={r.active_candidates ?? 0}
                          title="Candidates genuinely in play"
                          onSave={(n) => save(r.id, { viable_candidates: n })}
                          className={cn(
                            (r.active_candidates ?? 0) >= (r.sprint_target ?? 0)
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[var(--text)]',
                          )}
                        />
                        <span className="text-[10px] text-[var(--text-muted)]">
                          /{r.sprint_target}
                        </span>
                      </td>
                      <td className="px-4 py-2 tabular">{money(fee)}</td>
                      <td className="px-4 py-2 tabular">{Math.round(close)}%</td>
                      <td className="px-4 py-2 tabular font-medium">
                        {money(fee * close / 100)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn('rounded-[3px] px-1.5 py-0.5 text-[10px]',
                          DELIVERY_NEED[r.delivery_need ?? 'none'].chip)}>
                          {DELIVERY_NEED[r.delivery_need ?? 'none'].label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span title={`${r.sourcing_state ?? ''} · from the pipeline, target and stage`}>
                          {r.next_action ?? REQ_ACTION[r.recommended_action ?? 'hold'].label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {r.owner ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar id={r.owner.id} name={r.owner.name}
                                    src={r.owner.avatar_url} size="xs" />
                            {r.owner.name}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
