'use client'

import Link from 'next/link'
import {
  AlertCircle, ArrowLeft, CalendarDays, Check, FolderOpen, MessageSquare, Radio,
} from 'lucide-react'
import { Avatar, Panel, PanelHeader } from '@/components/ops/ui/primitives'
import { cn, relative } from '@/lib/ops/utils'
import type { Calendar, Integration, Person } from '@/types/ops'

const ICONS = {
  outlook: CalendarDays,
  drive: FolderOpen,
  slack: MessageSquare,
  sourcewhale: Radio,
  metricool: Radio,
  intelligence: Radio,
} as Record<string, typeof CalendarDays>

const NOTES: Record<string, string> = {
  outlook: 'Meetings appear on the calendar alongside task due dates.',
  drive: 'Files are indexed and can be linked to a project.',
  slack: 'Task updates post to #alac_main and @-mention the person who has to act.',
  sourcewhale: 'Where approved outreach goes to be sent.',
  metricool: 'Where content is scheduled when native publishing is not an option.',
  intelligence: 'Accounts and signals arriving from the GTM Intelligence Hub.',
}

export function IntegrationsClient({
  integrations, calendars, people,
}: {
  integrations: Integration[]
  calendars: Calendar[]
  people: Person[]
}) {
  return (
    <div className="mx-auto max-w-2xl p-5">
      <Link href="/settings"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        Settings
      </Link>

      <h1 className="text-lg font-semibold tracking-tight">Integrations</h1>
      <p className="mb-4 mt-0.5 text-xs text-[var(--text-muted)]">
        Outlook, Drive and Slack are connected through Claude. Ask Claude to
        refresh, then run <code className="text-[10px]">npm run sync</code>.
      </p>

      <Panel className="mb-4">
        <PanelHeader title="Connected" />
        <div>
          {integrations.map((i) => {
            const Icon = ICONS[i.key] ?? Radio
            return (
              <div key={i.key}
                   className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0',
                  i.is_connected ? 'text-brand-600' : 'text-[var(--text-muted)]')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{i.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{NOTES[i.key]}</p>
                  {i.last_error && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-600">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {i.last_error}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                    i.is_connected
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-[var(--surface-hover)] text-[var(--text-muted)]')}>
                    {i.is_connected ? 'Synced' : 'Waiting'}
                  </span>
                  {i.last_synced_at && (
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {relative(i.last_synced_at)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel className="mb-4">
        <PanelHeader title="Calendars" />
        <div>
          {calendars.length === 0 ? (
            <p className="px-4 py-4 text-center text-[11px] text-[var(--text-muted)]">
              No calendars yet.
            </p>
          ) : calendars.map((c) => {
            const person = people.find((p) => p.id === c.person_id)
            return (
              <div key={c.id}
                   className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{c.label}</p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">{c.email}</p>
                </div>
                {person && (
                  <Avatar id={person.id} name={person.name}
                          src={person.avatar_url} size="sm" />
                )}
                {c.last_synced_at ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <Check className="h-3 w-3" />
                    {relative(c.last_synced_at)}
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-600">needs access</span>
                )}
              </div>
            )
          })}
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]">
          A calendar marked <span className="text-amber-600">needs access</span> is
          in the tenant but not shared. In Outlook: Calendar → Share → add
          the mailbox the sync reads with <em>Can view all details</em>.
        </p>
      </Panel>

      <Panel>
        <PanelHeader title="Slack mentions" />
        <div>
          {people.map((p) => (
            <div key={p.id}
                 className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2 last:border-0">
              <Avatar id={p.id} name={p.name} src={p.avatar_url} size="sm" />
              <span className="flex-1 truncate text-xs">{p.name}</span>
              {p.slack_user_id ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <Check className="h-3 w-3" />
                  linked
                </span>
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">not linked</span>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
