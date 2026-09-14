/**
 * Content Analytics, output, not work.
 *
 * The kanban answers "what are we working on?"; this answers "what did it do?".
 * One row per publication, so a piece that shipped to four platforms counts
 * four times, that is the unit performance attaches to, because the same
 * piece performs differently on LinkedIn than on Instagram and averaging them
 * hides the comparison worth making.
 *
 * Seven numbers stay visible at all times: impressions, engagements,
 * engagement rate, clicks, CTR, connections, leads. Everything else lives
 * behind Update Analytics. Forty KPIs that still cannot answer "which post is
 * working?" is the failure mode this is built to avoid.
 */
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, BarChart3, ExternalLink, Search } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Panel, PanelHeader, Select,
} from '@/components/ops/ui/primitives'
import { MetricsDrawer, num, rate } from '@/components/ops/content/metrics-drawer'
import { PlatformIcon } from '@/components/ops/platform-icon'
import { CONTENT_KIND, PLATFORM } from '@/lib/ops/constants'
import { cn, formatDate } from '@/lib/ops/utils'
import type {
  ContentKind, ContentPerformance, Person, Platform, PublicationRow,
} from '@/types/ops'

type Range = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_30' | 'all'

const RANGES: { key: Range; label: string }[] = [
  { key: 'this_week',  label: 'This week' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_30',    label: 'Last 30 days' },
  { key: 'all',        label: 'All time' },
]

/** Monday-based week start, since a publishing week runs Mon–Sun. */
function weekStart(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function rangeBounds(r: Range, at: number): { from: Date | null; to: Date | null } {
  const now = new Date(at)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  switch (r) {
    case 'this_week':  return { from: weekStart(now), to: null }
    case 'last_week': {
      const start = weekStart(now); start.setDate(start.getDate() - 7)
      const end = new Date(start); end.setDate(end.getDate() + 7)
      return { from: start, to: end }
    }
    case 'this_month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
    case 'last_month': return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to:   new Date(now.getFullYear(), now.getMonth(), 1),
    }
    case 'last_30': {
      const start = new Date(today); start.setDate(start.getDate() - 30)
      return { from: start, to: null }
    }
    default: return { from: null, to: null }
  }
}

/**
 * Add up one metric across a set of publications.
 *
 * Returns null when nobody reported it, so an untracked month shows an em
 * dash rather than a confident zero, a zero here reads as "we got no
 * impressions", which is a very different claim from "we have not entered
 * them yet".
 */
function total(rows: PublicationRow[], key: keyof ContentPerformance): number | null {
  let seen = false
  let sum = 0
  for (const r of rows) {
    const v = r.metrics?.[key]
    if (typeof v === 'number') { seen = true; sum += v }
  }
  return seen ? sum : null
}

/** The metrics the chart and the leaderboard can be ranked by. */
const VIEWS: { key: string; label: string }[] = [
  { key: 'posts',           label: 'Posts published' },
  { key: 'impressions',     label: 'Impressions' },
  { key: 'engagements',     label: 'Engagements' },
  { key: 'engagement_rate', label: 'Engagement rate' },
  { key: 'clicks',          label: 'Clicks' },
  { key: 'ctr',             label: 'CTR' },
  { key: 'new_connections', label: 'Connections' },
  { key: 'leads',           label: 'Leads' },
]

export function AnalyticsClient({
  publications, people,
}: {
  me: Person
  publications: PublicationRow[]
  people: Person[]
}) {
  // One clock for the whole view. Reading Date.now() during render is impure
  // and would let the week/month boundaries shift between re-renders.
  const [now] = useState(() => Date.now())
  const [range, setRange] = useState<Range>('this_month')
  const [platform, setPlatform] = useState('')
  const [kind, setKind] = useState('')
  const [owner, setOwner] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useState('posts')
  const [rank, setRank] = useState('impressions')
  // The publication whose numbers are being entered, if any.
  const [editing, setEditing] = useState<PublicationRow | null>(null)

  const inRange = useMemo(() => {
    const { from, to } = rangeBounds(range, now)
    return publications.filter((p) => {
      const at = new Date(p.published_at)
      if (from && at < from) return false
      if (to && at >= to) return false
      return true
    })
  }, [publications, range, now])

  const rows = useMemo(() => inRange.filter((p) => {
    if (platform && p.platform !== platform) return false
    if (kind && p.content.kind !== kind) return false
    if (owner && p.content.owner?.id !== owner) return false
    if (q && !p.content.title.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [inRange, platform, kind, owner, q])

  /**
   * The seven core numbers, over the current filter.
   *
   * These DO follow the filters: "LinkedIn, this month" has to recalculate,
   * or the headline contradicts the table under it. Publishing volume below
   * stays global on purpose.
   */
  const perf = useMemo(() => {
    const impressions = total(rows, 'impressions')
    const engagements = total(rows, 'engagements')
    const clicks = total(rows, 'clicks')
    return {
      impressions,
      engagements,
      clicks,
      connections: total(rows, 'new_connections'),
      leads: total(rows, 'leads'),
      engagementRate: rate(engagements, impressions),
      ctr: rate(clicks, impressions),
      // How much of the filtered set has numbers at all. Without this a
      // dashboard built on two entered posts looks as authoritative as one
      // built on fifty.
      tracked: rows.filter((r) => r.metrics?.impressions != null).length,
    }
  }, [rows])

  // KPIs are computed against everything published, not the current filter, // "published this week" should not change because you filtered to LinkedIn.
  const kpis = useMemo(() => {
    const today = new Date(now)
    const wk = weekStart(today)
    const mo = new Date(today.getFullYear(), today.getMonth(), 1)
    const thisWeek = publications.filter((p) => new Date(p.published_at) >= wk).length
    const thisMonth = publications.filter((p) => new Date(p.published_at) >= mo).length

    // Average per week across the span we actually have data for.
    const dates = publications.map((p) => +new Date(p.published_at))
    const weeks = dates.length
      ? Math.max(1, (now - Math.min(...dates)) / (7 * 864e5))
      : 1
    return {
      total: publications.length,
      thisWeek,
      thisMonth,
      perWeek: publications.length ? (publications.length / weeks).toFixed(1) : '0',
    }
  }, [publications, now])

  /**
   * Twelve weeks, of whichever metric is selected.
   *
   * One chart rather than seven: the question is "how is this trending", and
   * seven static charts answer it worse than one you can point at something.
   * Plain CSS bars, this cannot mis-generate its own ticks.
   */
  const cadence = useMemo(() => {
    const buckets: { label: string; n: number; suffix: string }[] = []
    const start = weekStart(new Date(now))
    for (let i = 11; i >= 0; i--) {
      const from = new Date(start); from.setDate(from.getDate() - i * 7)
      const to = new Date(from); to.setDate(to.getDate() + 7)
      const inWeek = rows.filter((pub) => {
        const at = new Date(pub.published_at)
        return at >= from && at < to
      })

      let n = 0
      let suffix = ''
      if (view === 'posts') {
        n = inWeek.length
      } else if (view === 'engagement_rate' || view === 'ctr') {
        // A rate is not summable: recompute it from the week's totals, or a
        // quiet week with one good post would outrank a strong one.
        const imp = total(inWeek, 'impressions') ?? 0
        const top = total(inWeek,
          view === 'ctr' ? 'clicks' : 'engagements') ?? 0
        n = imp > 0 ? Number(((top / imp) * 100).toFixed(2)) : 0
        suffix = '%'
      } else {
        n = total(inWeek, view as keyof ContentPerformance) ?? 0
      }

      buckets.push({
        label: `${from.getMonth() + 1}/${from.getDate()}`,
        n, suffix,
      })
    }
    return buckets
  }, [rows, now, view])

  /** The best posts by whichever measure is selected. */
  const leaders = useMemo(() => {
    const measured = rows.filter((r) => r.metrics?.[rank as keyof ContentPerformance] != null)
    return [...measured]
      .sort((a, b) => Number(b.metrics?.[rank as keyof ContentPerformance] ?? 0)
                    - Number(a.metrics?.[rank as keyof ContentPerformance] ?? 0))
      .slice(0, 8)
  }, [rows, rank])

  const peak = Math.max(1, ...cadence.map((b) => b.n))

  /** Roll performance up by platform or by format. */
  const compare = useMemo(() => {
    const build = (keyOf: (r: PublicationRow) => string) => {
      const groups = new Map<string, PublicationRow[]>()
      for (const r of rows) {
        const k = keyOf(r)
        const list = groups.get(k)
        if (list) list.push(r); else groups.set(k, [r])
      }
      return [...groups.entries()].map(([key, list]) => {
        const impressions = total(list, 'impressions')
        const engagements = total(list, 'engagements')
        const clicks = total(list, 'clicks')
        return {
          key,
          posts: list.length,
          impressions,
          engagementRate: rate(engagements, impressions),
          ctr: rate(clicks, impressions),
          connections: total(list, 'new_connections'),
          leads: total(list, 'leads'),
        }
      }).sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0) || b.posts - a.posts)
    }
    return {
      platforms: build((r) => r.platform),
      formats: build((r) => r.content.kind),
    }
  }, [rows])

  const byPlatform = useMemo(() => {
    const c = new Map<string, number>()
    inRange.forEach((p) => c.set(p.platform, (c.get(p.platform) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  const byKind = useMemo(() => {
    const c = new Map<string, number>()
    inRange.forEach((p) => c.set(p.content.kind, (c.get(p.content.kind) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Content Analytics</h1>
          <p className="text-xs text-[var(--text-muted)]">
            What we published, when, and where.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Select className="h-7 text-xs" value={range}
                  onChange={(e) => setRange(e.target.value as Range)}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </Select>
          <Link
            href="/content"
            className="flex h-7 items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            Content board <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Volume, what we put out, regardless of the filter. */}
      <div className="mb-3 grid grid-cols-4 gap-3">
        {[
          { label: 'Total published', value: kpis.total },
          { label: 'This week', value: kpis.thisWeek },
          { label: 'This month', value: kpis.thisMonth },
          { label: 'Avg / week', value: kpis.perWeek },
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

      {/* Performance, the seven, over whatever is filtered. */}
      <div className="mb-2 grid grid-cols-7 gap-2">
        {[
          { label: 'Impressions', value: num(perf.impressions) },
          { label: 'Engagements', value: num(perf.engagements) },
          { label: 'Eng. rate', value: perf.engagementRate },
          { label: 'Clicks', value: num(perf.clicks) },
          { label: 'CTR', value: perf.ctr },
          { label: 'Connections', value: num(perf.connections) },
          { label: 'Leads', value: num(perf.leads) },
        ].map((k) => (
          <div key={k.label}
               className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 dark:border-brand-900 dark:bg-brand-950/40">
            <p className="text-[9px] uppercase tracking-wide text-brand-600 dark:text-brand-300">
              {k.label}
            </p>
            <p className="mt-0.5 truncate text-lg font-semibold tabular text-brand-900 dark:text-brand-100">
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* How much of this is actually measured. A dashboard built on two
          entered posts should not look as authoritative as one built on
          fifty, so it says which it is. */}
      <p className="mb-4 text-[10px] text-[var(--text-muted)]">
        {perf.tracked} of {rows.length} publications in view have analytics entered.
        {perf.tracked < rows.length && ' Use Update Analytics on a row to add the rest.'}
      </p>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {/* Cadence */}
        <Panel className="col-span-2">
          <PanelHeader
            title="By week"
            action={
              <Select className="h-6 text-[11px]" value={view}
                      onChange={(e) => setView(e.target.value)}>
                {VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </Select>
            }
          />
          <div className="p-4">
            {publications.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                Nothing published yet.
              </p>
            ) : (
              <div className="flex h-32 items-end gap-1.5">
                {cadence.map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className={cn('text-[10px] tabular',
                      b.n ? 'text-[var(--text-secondary)]' : 'text-transparent')}>
                      {b.n ? b.n.toLocaleString() + b.suffix : ''}
                    </span>
                    <div
                      className="w-full rounded-t bg-[var(--brand-600,#1A1F71)]"
                      style={{
                        height: `${Math.max(b.n ? 6 : 2, (b.n / peak) * 92)}px`,
                        opacity: b.n ? 1 : 0.15,
                      }}
                      title={`Week of ${b.label}: ${b.n.toLocaleString()}${b.suffix}`}
                    />
                    <span className="text-[9px] text-[var(--text-muted)]">{b.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* Where it went, counts only. The comparison tables below carry
            the performance, because a narrow column cannot hold seven
            numbers legibly. */}
        <Panel>
          <PanelHeader title="Where it went" />
          <div className="space-y-2 p-4">
            {byPlatform.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">No publications in range.</p>
            )}
            {byPlatform.map(([pf, n]) => (
              <div key={pf} className="flex items-center gap-2">
                <PlatformIcon platform={pf as Platform} color className="h-3.5 w-3.5" />
                <span className="flex-1 text-xs">{PLATFORM[pf as Platform]?.label ?? pf}</span>
                <span className="text-xs font-medium tabular">{n}</span>
              </div>
            ))}

            {byKind.length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  By format
                </p>
                {byKind.map(([k, n]) => (
                  <div key={k} className="flex items-center gap-2 py-0.5">
                    <span className="flex-1 text-xs">
                      {CONTENT_KIND[k as ContentKind]?.label ?? k}
                    </span>
                    <span className="text-xs font-medium tabular">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Is short-form actually beating LinkedIn text? These answer it. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Comparison
          title="By platform"
          rows={compare.platforms}
          label={(k) => PLATFORM[k as Platform]?.label ?? k}
          icon={(k) => <PlatformIcon platform={k as Platform} color className="h-3 w-3" />}
        />
        <Comparison
          title="By format"
          rows={compare.formats}
          label={(k) => CONTENT_KIND[k as ContentKind]?.label ?? k}
        />
      </div>

      {/* Publication history */}
      <Panel>
        <PanelHeader
          title="Published content"
          action={
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Search titles…"
                       className="h-7 w-44 pl-7 text-[11px]" />
              </div>
              <Select className="h-7 text-[11px]" value={platform}
                      onChange={(e) => setPlatform(e.target.value)}>
                <option value="">All platforms</option>
                {byPlatform.map(([p]) => (
                  <option key={p} value={p}>{PLATFORM[p as Platform]?.label ?? p}</option>
                ))}
              </Select>
              <Select className="h-7 text-[11px]" value={kind}
                      onChange={(e) => setKind(e.target.value)}>
                <option value="">All formats</option>
                {byKind.map(([k]) => (
                  <option key={k} value={k}>{CONTENT_KIND[k as ContentKind]?.label ?? k}</option>
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
            title="Nothing here yet"
            description="Publish something on the content board and it lands here automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Content</th>
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 text-right font-medium">Impr.</th>
                  <th className="px-4 py-2 text-right font-medium">Eng.</th>
                  <th className="px-4 py-2 text-right font-medium">Eng. rate</th>
                  <th className="px-4 py-2 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2 text-right font-medium">CTR</th>
                  <th className="px-4 py-2 text-right font-medium">Conn.</th>
                  <th className="px-4 py-2 text-right font-medium">Leads</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={`${p.content.id}-${p.platform}`}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--text-secondary)] tabular">
                      {formatDate(p.published_at)}
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/content?open=${p.content.id}`}
                            className="font-medium hover:underline">
                        {p.content.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformIcon platform={p.platform} color className="h-3 w-3" />
                        {PLATFORM[p.platform]?.label ?? p.platform}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {CONTENT_KIND[p.content.kind]?.label ?? p.content.kind}
                    </td>
                    <td className="px-4 py-2">
                      {p.content.owner ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={p.content.owner.name}
                                  src={p.content.owner.avatar_url} size="xs" />
                          {p.content.owner.name}
                        </span>
                      ) : '-'}
                    </td>
                    <Perf value={p.metrics?.impressions} />
                    <Perf value={p.metrics?.engagements} />
                    <Perf value={p.metrics?.engagement_rate} pct />
                    <Perf value={p.metrics?.clicks} />
                    <Perf value={p.metrics?.ctr} pct />
                    <Perf value={p.metrics?.new_connections} />
                    <Perf value={p.metrics?.leads} />
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.published_url && (
                          <a href={p.published_url} target="_blank" rel="noreferrer"
                             className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                             title="View post">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <Button size="xs" variant="secondary"
                                onClick={() => setEditing(p)}>
                          <BarChart3 className="h-3 w-3" />
                          {p.metrics ? 'Update' : 'Add numbers'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* What is actually working. The whole point of the page. */}
      <Panel className="mt-4">
        <PanelHeader
          title="Top performing content"
          action={
            <Select className="h-6 text-[11px]" value={rank}
                    onChange={(e) => setRank(e.target.value)}>
              {VIEWS.filter((v) => v.key !== 'posts').map((v) => (
                <option key={v.key} value={v.key}>{v.label}</option>
              ))}
            </Select>
          }
        />
        {leaders.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            No analytics entered yet for this selection. Add numbers to a
            published post and it will rank here.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {leaders.map((pub, i) => {
              const v = pub.metrics?.[rank as keyof ContentPerformance]
              const pct = rank === 'engagement_rate' || rank === 'ctr'
              return (
                <div key={`${pub.content.id}-${pub.platform}`}
                     className="flex items-center gap-3 px-4 py-2">
                  <span className="w-4 text-[10px] tabular text-[var(--text-muted)]">
                    {i + 1}
                  </span>
                  <PlatformIcon platform={pub.platform} color className="h-3 w-3 shrink-0" />
                  <Link href={`/content?open=${pub.content.id}`}
                        className="min-w-0 flex-1 truncate text-xs font-medium hover:underline">
                    {pub.content.title}
                  </Link>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    {formatDate(pub.published_at)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs font-semibold tabular">
                    {typeof v === 'number'
                      ? pct ? `${v.toFixed(2)}%` : v.toLocaleString()
                      : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {editing && (
        <MetricsDrawer
          key={`${editing.content.id}-${editing.platform}`}
          publication={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/**
 * A performance breakdown, by platform or by format.
 *
 * Deliberately not hard-coded to LinkedIn, Instagram and YouTube: it groups
 * whatever is in the data, so a platform added next year appears without a
 * code change.
 */
function Comparison({
  title, rows, label, icon,
}: {
  title: string
  rows: {
    key: string; posts: number; impressions: number | null
    engagementRate: string; ctr: string
    connections: number | null; leads: number | null
  }[]
  label: (k: string) => string
  icon?: (k: string) => React.ReactNode
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
          Nothing in range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-1.5 font-medium">&nbsp;</th>
                <th className="px-2 py-1.5 text-right font-medium">Posts</th>
                <th className="px-2 py-1.5 text-right font-medium">Impr.</th>
                <th className="px-2 py-1.5 text-right font-medium">Eng.</th>
                <th className="px-2 py-1.5 text-right font-medium">CTR</th>
                <th className="px-2 py-1.5 text-right font-medium">Conn.</th>
                <th className="px-3 py-1.5 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {icon?.(r.key)}
                      {label(r.key)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">{r.posts}</td>
                  <td className="px-2 py-1.5 text-right tabular">{num(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right tabular">{r.engagementRate}</td>
                  <td className="px-2 py-1.5 text-right tabular">{r.ctr}</td>
                  <td className="px-2 py-1.5 text-right tabular">{num(r.connections)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{num(r.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/** One performance cell. A missing number is an em dash, never a zero. */
function Perf({ value, pct }: { value?: number | null; pct?: boolean }) {
  return (
    <td className="whitespace-nowrap px-4 py-2 text-right tabular">
      {typeof value === 'number'
        ? pct ? `${value.toFixed(2)}%` : value.toLocaleString()
        : <span className="text-[var(--text-muted)]">, </span>}
    </td>
  )
}
