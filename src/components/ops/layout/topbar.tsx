/** Search entry, quick add, and the current user. */
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Avatar, Button } from '@/components/ops/ui/primitives'
import { QuickFind } from '@/components/ops/quick-find'
import { NewTask } from '@/components/ops/new-task'
import { BulkTasks } from '@/components/ops/bulk-tasks'
import { NotificationBell } from '@/components/ops/notification-bell'
import type { Client, Notification, OrgFunction, Person, Project } from '@/types/ops'

export function Topbar({
  me, people, projects, clients, functions, notifications,
}: {
  me: Person
  people: Person[]
  projects: Pick<Project, 'id' | 'name' | 'department'>[]
  clients: Client[]
  functions: OrgFunction[]
  notifications: Notification[]
}) {
  const [findOpen, setFindOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  // ⌘K finds; "n" starts a new task without reaching for the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setFindOpen((v) => !v)
      }
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
         e.target.isContentEditable)
      if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setAddOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <button
          onClick={() => setFindOpen(true)}
          className="flex h-7 min-w-0 flex-1 items-center sm:max-w-72 gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-2.5 text-xs text-[var(--text-muted)] transition-colors hover:border-brand-400"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 truncate text-left">Find a project or task</span>
          <kbd className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1 text-[10px]">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New task
          </Button>
          {/* Pasting a whole plan is a different job from writing one task,
              so it gets its own entry rather than hiding inside the form. */}
          <Button size="sm" variant="ghost" onClick={() => setBulkOpen(true)}
                  title="Paste several tasks at once" className="hidden sm:inline-flex">
            Paste tasks
          </Button>
          <NotificationBell notifications={notifications} />
          <Link href="/settings" className="rounded-full hover:ring-2 hover:ring-brand-400">
            <Avatar id={me.id} name={me.name} src={me.avatar_url} size="md" />
          </Link>
        </div>
      </header>

      {/* Keyed so each open starts from a clean slate. */}
      <QuickFind
        key={findOpen ? 'find-open' : 'find-closed'}
        open={findOpen}
        onClose={() => setFindOpen(false)}
        projects={projects}
      />
      <BulkTasks
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        people={people}
        projects={projects as never}
        functions={functions}
        me={me}
      />

      <NewTask
        key={addOpen ? 'add-open' : 'add-closed'}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        people={people}
        projects={projects}
        clients={clients}
        functions={functions}
        me={me}
      />
    </>
  )
}
