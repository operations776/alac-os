'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Panel, ProgressBar, Select,
} from '@/components/ops/ui/primitives'
import { HealthBadge, ProjectStatusBadge } from '@/components/ops/badges'
import { DEPARTMENT, DEPARTMENTS, HEALTH, HEALTHS } from '@/lib/ops/constants'
import { cn, daysAway, formatDateShort, percent, plural } from '@/lib/ops/utils'
import type { Department, Person, ProjectRow } from '@/types/ops'

export function ProjectsClient({
  projects, people,
}: {
  projects: ProjectRow[]
  people: Person[]
}) {
  const [q, setQ] = useState('')
  const [health, setHealth] = useState('')
  const [owner, setOwner] = useState('')
  const [showDone, setShowDone] = useState(false)

  const shown = useMemo(() => projects.filter((p) => {
    if (!showDone && (p.status === 'done' || p.status === 'archived')) return false
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) &&
        !(p.client?.name.toLowerCase().includes(q.toLowerCase()) ?? false)) return false
    if (health && p.health !== health) return false
    if (owner && p.owner_id !== owner) return false
    return true
  }), [projects, q, health, owner, showDone])

  // Group by department so the list reads like the org chart.
  const grouped = useMemo(() => {
    const m = new Map<Department, ProjectRow[]>()
    for (const p of shown) m.set(p.department, [...(m.get(p.department) ?? []), p])
    return DEPARTMENTS.filter((d) => m.has(d)).map((d) => [d, m.get(d)!] as const)
  }, [shown])

  return (
    <div className="mx-auto max-w-5xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {shown.length} {plural(shown.length, 'project')}
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="sm" variant="primary">
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
               className="h-7 w-44 text-xs" />
        <Select className="h-7 text-xs" value={health} onChange={(e) => setHealth(e.target.value)}>
          <option value="">Any health</option>
          {HEALTHS.map((h) => (
            <option key={h} value={h}>{HEALTH[h].label}</option>
          ))}
        </Select>
        <Select className="h-7 text-xs" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
          <input type="checkbox" checked={showDone}
                 onChange={(e) => setShowDone(e.target.checked)}
                 className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-brand-600" />
          Show finished
        </label>
      </div>

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FolderKanban}
            title="No projects match"
            action={
              <Link href="/projects/new">
                <Button size="sm" variant="primary">New project</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dept, list]) => (
            <div key={dept}>
              <h2 className="section-label mb-1.5 flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', DEPARTMENT[dept].dot)} />
                {DEPARTMENT[dept].label}
              </h2>
              <Panel className="overflow-hidden">
                {list.map((p) => {
                  const days = daysAway(p.due_date)
                  const late = days !== null && days < 0 && p.status === 'active'
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 last:border-0 hover:bg-[var(--surface-hover)]"
                    >
                      <HealthBadge h={p.health} dotOnly />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{p.name}</p>
                        {p.client && (
                          <p className="truncate text-[10px] text-teal-700 dark:text-teal-400">
                            {p.client.name}
                          </p>
                        )}
                      </div>

                      {p.status !== 'active' && <ProjectStatusBadge s={p.status} />}

                      {(p.overdue_count ?? 0) > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold tabular text-rose-600">
                          {p.overdue_count} late
                        </span>
                      )}

                      <div className="hidden w-28 shrink-0 items-center gap-1.5 sm:flex">
                        <ProgressBar value={percent(p.done_count, p.task_count)} />
                        <span className="w-16 shrink-0 text-right text-[10px] tabular text-[var(--text-muted)]">
                          {p.done_count}/{p.task_count}
                        </span>
                      </div>

                      <span className={cn('w-14 shrink-0 text-right text-[10px] tabular',
                        late ? 'font-semibold text-rose-600' : 'text-[var(--text-muted)]')}>
                        {p.due_date ? formatDateShort(p.due_date) : '-'}
                      </span>

                      <div className="w-6 shrink-0">
                        {p.owner && (
                          <Avatar id={p.owner.id} name={p.owner.name}
                                  src={p.owner.avatar_url} size="sm" />
                        )}
                      </div>
                    </Link>
                  )
                })}
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
