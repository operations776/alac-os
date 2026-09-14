/**
 * GTM Analytics, closed campaigns and what came of them.
 *
 * The board answers "which accounts are we working?"; this answers "what
 * happened to the ones we finished?". Deliberately operational: enough to spot
 * a bottleneck or a messaging problem, not a BI tool.
 */
'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, ArrowUpRight, RotateCcw } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Panel, PanelHeader, Select,
} from '@/components/ops/ui/primitives'
import { GTM_OUTCOME, GTM_OUTCOMES, GTM_STAGE, GTM_STAGES } from '@/lib/ops/constants'
import { archiveRecords, reopenRecords } from '@/lib/server/ops/actions'
import { cn, formatDate } from '@/lib/ops/utils'
import type { GtmAccountRow, GtmOutcome, Person } from '@/types/ops'

export function GtmAnalyticsClient({
  accounts, people,
}: {
  me: Person
  accounts: GtmAccountRow[]
  people: Person[]
}) {
  const [now] = useState(() => Date.now())
  const [owner, setOwner] = useState('')
  const router = useRouter()
  const [, start] = useTransition()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // Where a revived account belongs depends on how much of the old research
  // still holds, so the stage is chosen rather than assumed.
  const [reopenTo, setReopenTo] = useState<string>('researching')
  const [outcome, setOutcome] = useState('')

  const active = useMemo(
    () => accounts.filter((a) => a.stage !== 'complete'), [accounts])
  const done = useMemo(
    () => accounts.filter((a) => a.stage === 'complete'), [accounts])

  const kpis = useMemo(() => {
    const wk = new Date(now); wk.setHours(0, 0, 0, 0)
    wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7))
    const mo = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1)

    const completedThisMonth = done.filter(
      (a) => a.completed_at && new Date(a.completed_at) >= mo).length
    const newThisWeek = accounts.filter(
      (a) => new Date(a.assigned_on) >= wk).length

    const byOutcome = (o: GtmOutcome) => done.filter((a) => a.outcome === o).length

    // Average contacts actually approached, across closed campaigns.
    const attempts = done.map((a) => a.attempt_count ?? 0)
    const avgAttempts = attempts.length
      ? (attempts.reduce((s, n) => s + n, 0) / attempts.length).toFixed(1)
      : '0'

    // Average days a closed campaign stayed open.
    const spans = done
      .filter((a) => a.completed_at)
      .map((a) => (+new Date(a.completed_at!) - +new Date(a.assigned_on)) / 864e5)
    const avgDays = spans.length
      ? Math.round(spans.reduce((s, n) => s + n, 0) / spans.length)
      : 0

    return {
      active: active.length,
      newThisWeek,
      completedThisMonth,
      engaged: active.filter((a) => a.stage === 'engaged').length,
      meetings: byOutcome('meeting'),
      nurture: byOutcome('nurture'),
      noResponse: byOutcome('no_response'),
      avgAttempts,
      avgDays,
    }
  }, [accounts, active, done, now])

  const breakdown = useMemo(
    () => GTM_OUTCOMES.map((o) => ({
      key: o, n: done.filter((a) => a.outcome === o).length,
    })).filter((r) => r.n > 0),
    [done])

  const rows = useMemo(() => done
    .filter((a) => !owner || a.researcher?.id === owner)
    .filter((a) => !outcome || a.outcome === outcome)
    .sort((a, b) => +new Date(b.completed_at ?? 0) - +new Date(a.completed_at ?? 0)),
    [done, owner, outcome])

  const peak = Math.max(1, ...breakdown.map((b) => b.n))

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">GTM Analytics</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Closed campaigns and what came of them.
          </p>
        </div>
        <Link
          href="/gtm"
          className="flex h-7 items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
        >
          GTM board <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Active accounts', value: kpis.active },
          { label: 'New this week', value: kpis.newThisWeek },
          { label: 'Completed this month', value: kpis.completedThisMonth },
          { label: 'Engaged now', value: kpis.engaged },
        ].map((k) => (
          <div key={k.label}
               className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {k.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Panel className="col-span-2">
          <PanelHeader title="How campaigns ended" />
          <div className="space-y-2 p-4">
            {breakdown.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                No completed campaigns yet.
              </p>
            ) : breakdown.map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-xs">{GTM_OUTCOME[b.key].label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--surface-sunken)]">
                  <div
                    className={cn('h-full rounded',
                      b.key === 'meeting' ? 'bg-emerald-500'
                        : b.key === 'nurture' ? 'bg-sky-500'
                        : b.key === 'not_interested' ? 'bg-rose-400'
                        : 'bg-slate-400')}
                    style={{ width: `${(b.n / peak) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-medium tabular">{b.n}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Efficiency" />
          <div className="space-y-3 p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Avg contacts per account
              </p>
              <p className="text-xl font-semibold tabular">{kpis.avgAttempts}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Avg days a campaign runs
              </p>
              <p className="text-xl font-semibold tabular">{kpis.avgDays}</p>
            </div>
            <div className="border-t border-[var(--border)] pt-3">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Meetings generated
              </p>
              <p className="text-xl font-semibold tabular text-emerald-600">
                {kpis.meetings}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Campaign history"
          action={
            <div className="flex items-center gap-1.5">
              {picked.size > 0 ? (
                <>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {picked.size} selected
                  </span>
                  {/* A campaign that ended does not stay ended: a company
                      re-opens a req, or a contact resurfaces. */}
                  <Select
                    className="h-7 text-[11px]"
                    value={reopenTo}
                    onChange={(e) => setReopenTo(e.target.value)}
                  >
                    {GTM_STAGES.map((st) => (
                      <option key={st} value={st}>
                        Back to {GTM_STAGE[st].label}
                      </option>
                    ))}
                  </Select>
                  <Button size="xs" onClick={() => start(async () => {
                    await reopenRecords('gtm_account', [...picked], reopenTo)
                    setPicked(new Set())
                    router.refresh()
                  })}>
                    <RotateCcw className="h-3 w-3" /> Put back on the board
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => start(async () => {
                    await archiveRecords('gtm_account', [...picked])
                    setPicked(new Set())
                    router.refresh()
                  })}>
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>
                    Cancel
                  </Button>
                </>
              ) : rows.length > 0 ? (
                <Button size="xs" variant="ghost"
                        onClick={() => setPicked(new Set(rows.map((r) => r.id)))}>
                  Select all {rows.length}
                </Button>
              ) : null}
              <Select className="h-7 text-[11px]" value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}>
                <option value="">All outcomes</option>
                {GTM_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{GTM_OUTCOME[o].label}</option>
                ))}
              </Select>
              <Select className="h-7 text-[11px]" value={owner}
                      onChange={(e) => setOwner(e.target.value)}>
                <option value="">Anyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No completed campaigns"
            description="Close an account with an outcome and it lands here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="w-8 px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select every campaign"
                      checked={picked.size > 0 && picked.size === rows.length}
                      onChange={(e) => setPicked(
                        e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Completed</th>
                  <th className="px-4 py-2 font-medium">Contacts</th>
                  <th className="px-4 py-2 font-medium">Outcome</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.company}`}
                        checked={picked.has(a.id)}
                        onChange={() => setPicked((p) => {
                          const next = new Set(p)
                          if (next.has(a.id)) next.delete(a.id); else next.add(a.id)
                          return next
                        })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/gtm/${a.id}`} className="font-medium hover:underline">
                        {a.company}
                      </Link>
                      {a.signal_note && (
                        <p className="truncate text-[10px] text-[var(--text-muted)]">
                          {a.signal_note}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular text-[var(--text-secondary)]">
                      {formatDate(a.assigned_on)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular text-[var(--text-secondary)]">
                      {a.completed_at ? formatDate(a.completed_at) : '-'}
                    </td>
                    <td className="px-4 py-2 tabular">{a.attempt_count ?? 0}</td>
                    <td className="px-4 py-2">
                      {a.outcome && (
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                                            GTM_OUTCOME[a.outcome].chip)}>
                          {GTM_OUTCOME[a.outcome].label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {a.researcher ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar id={a.researcher.id} name={a.researcher.name}
                                  src={a.researcher.avatar_url} size="xs" />
                          {a.researcher.name}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
