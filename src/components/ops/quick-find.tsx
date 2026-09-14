/** Ctrl K (⌘K on a Mac). Jump to a project, or to one of the six pages. */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, FolderKanban, LayoutDashboard, ListTodo, Repeat, Search, Settings,
} from 'lucide-react'
import { cn } from '@/lib/ops/utils'
import { Kbd } from '@/components/ops/ui/primitives'
import { DEPARTMENT } from '@/lib/ops/constants'
import type { Project } from '@/types/ops'

const PAGES = [
  { href: '/ops',                label: 'Dashboard', icon: LayoutDashboard },
  { href: '/my-work',            label: 'My Work',   icon: ListTodo },
  { href: '/projects',           label: 'Projects',  icon: FolderKanban },
  { href: '/calendar',           label: 'Calendar',  icon: CalendarDays },
  { href: '/settings/recurring', label: 'Recurring', icon: Repeat },
  { href: '/settings',           label: 'Settings',  icon: Settings },
]

export function QuickFind({
  open, onClose, projects,
}: {
  open: boolean
  onClose: () => void
  projects: Pick<Project, 'id' | 'name' | 'department'>[]
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages = PAGES
      .filter((p) => !needle || p.label.toLowerCase().includes(needle))
      .map((p) => ({ kind: 'page' as const, href: p.href, label: p.label, icon: p.icon }))
    const projs = projects
      .filter((p) => !needle ||
        p.name.toLowerCase().includes(needle) ||
        DEPARTMENT[p.department].label.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((p) => ({
        kind: 'project' as const, href: `/projects/${p.id}`,
        label: p.name, sub: DEPARTMENT[p.department].label,
      }))
    // Projects first when searching; pages first when browsing.
    return needle ? [...projs, ...pages] : [...pages, ...projs]
  }, [q, projects])

  if (!open) return null

  const active = Math.min(cursor, Math.max(rows.length - 1, 0))

  function go(href: string) { onClose(); router.push(href) }

  return (
    <div
      className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Find"
    >
      <div
        className="anim-pop w-full max-w-lg overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault(); setCursor(Math.min(active + 1, rows.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault(); setCursor(Math.max(active - 1, 0))
              } else if (e.key === 'Enter' && rows[active]) {
                e.preventDefault(); go(rows[active].href)
              }
            }}
            placeholder="Find a project or page…"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <Kbd k="Esc" mod={false} />
        </div>

        <div className="scrollbar-thin max-h-80 overflow-y-auto py-1">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              Nothing matches “{q}”.
            </p>
          )}
          {rows.map((r, i) => (
            <button
              key={`${r.kind}-${r.href}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r.href)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs',
                i === active ? 'bg-brand-50 dark:bg-brand-950/60' : 'hover:bg-[var(--surface-hover)]',
              )}
            >
              {r.kind === 'page'
                ? <r.icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                : <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />}
              <span className="flex-1 truncate">{r.label}</span>
              {r.kind === 'project' && r.sub && (
                <span className="text-[10px] text-[var(--text-muted)]">{r.sub}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
