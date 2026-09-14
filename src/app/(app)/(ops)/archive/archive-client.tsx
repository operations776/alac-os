/**
 * The Archive.
 *
 * Completed work leaves the active boards but is never deleted (§8). This is
 * where it lives: searchable, filterable, and reopenable when something turns
 * out not to have been finished after all.
 */
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive as ArchiveIcon, RotateCcw, Search } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Panel, PanelHeader, Select,
} from '@/components/ops/ui/primitives'
import { reopenTask } from '@/lib/server/ops/actions'
import { cn, formatDate } from '@/lib/ops/utils'
import type { ArchiveItem, OrgFunction, Person } from '@/types/ops'

type Range = 'all' | 'week' | 'month' | 'quarter'

export function ArchiveClient({
  items, people, functions,
}: {
  me: Person
  items: ArchiveItem[]
  people: Person[]
  functions: OrgFunction[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [now] = useState(() => Date.now())

  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [fn, setFn] = useState('')
  const [owner, setOwner] = useState('')
  const [range, setRange] = useState<Range>('all')

  const nameOf = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p.name])), [people])
  const fnOf = useMemo(
    () => Object.fromEntries(functions.map((f) => [f.id, f])), [functions])

  const rows = useMemo(() => {
    const cutoff = range === 'all' ? 0
      : now - { week: 7, month: 30, quarter: 90 }[range] * 864e5
    return items.filter((i) => {
      if (kind && i.kind !== kind) return false
      if (fn && i.function_id !== fn) return false
      if (owner && i.owner_id !== owner) return false
      if (cutoff && +new Date(i.archived_at) < cutoff) return false
      if (q && !i.title.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [items, kind, fn, owner, range, q, now])

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Archive</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {items.length} completed {items.length === 1 ? 'item' : 'items'}.
            Nothing here was deleted.
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search titles…" className="h-7 w-56 pl-7 text-xs" />
        </div>
        <Select className="h-7 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option value="task">Tasks</option>
          <option value="content">Content</option>
        </Select>
        <Select className="h-7 text-xs" value={fn} onChange={(e) => setFn(e.target.value)}>
          <option value="">All functions</option>
          {functions.filter((f) => f.is_active !== false).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select className="h-7 text-xs" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select className="h-7 text-xs" value={range}
                onChange={(e) => setRange(e.target.value as Range)}>
          <option value="all">All time</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="quarter">Last 90 days</option>
        </Select>
      </div>

      <Panel>
        <PanelHeader
          title={`${rows.length} ${rows.length === 1 ? 'item' : 'items'}`}
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={ArchiveIcon}
            title={items.length ? 'Nothing matches' : 'Nothing archived yet'}
            description={items.length
              ? undefined
              : 'Completed work lands here automatically.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Completed</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Function</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={`${i.kind}-${i.id}`}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                    <td className="whitespace-nowrap px-4 py-2 tabular text-[var(--text-secondary)]">
                      {formatDate(i.archived_at)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{i.title}</span>
                      {i.reopen_count > 0 && (
                        <span className="ml-2 rounded-[3px] bg-[var(--surface-hover)] px-1 text-[9px] text-[var(--text-muted)]">
                          reopened {i.reopen_count}×
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize text-[var(--text-secondary)]">
                      {i.kind}
                    </td>
                    <td className="px-4 py-2">
                      {i.function_id && fnOf[i.function_id] ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: fnOf[i.function_id].color }} />
                          {fnOf[i.function_id].name}
                        </span>
                      ) : <span className="text-[var(--text-muted)]">-</span>}
                    </td>
                    <td className="px-4 py-2">
                      {i.owner_id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar id={i.owner_id} name={nameOf[i.owner_id] ?? '?'} size="xs" />
                          {nameOf[i.owner_id] ?? 'Unknown'}
                        </span>
                      ) : <span className="text-[var(--text-muted)]">-</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {i.kind === 'task' ? (
                        <Button
                          size="xs" variant="ghost" disabled={pending}
                          onClick={() => start(async () => {
                            await reopenTask(i.id, 'todo')
                            router.refresh()
                          })}
                          title="Return this to the board. The completion history is kept."
                        >
                          <RotateCcw className="h-3 w-3" /> Reopen
                        </Button>
                      ) : (
                        <Link href="/content"
                              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className={cn('mt-4 rounded-[3px] border border-[var(--border)] p-3',
                       'text-[11px] text-[var(--text-secondary)]')}>
        Completed work is preserved here permanently. Reopening returns an item
        to its board and keeps the record that it was finished once.
      </p>
    </div>
  )
}
