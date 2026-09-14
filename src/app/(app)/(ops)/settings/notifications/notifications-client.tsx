'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ops/ui/primitives'
import { setNotificationPreference } from '@/lib/server/ops/actions'
import { NOTIFY, NOTIFY_GROUPS } from '@/lib/ops/constants'
import type { NotificationPreference, NotifyKind } from '@/types/ops'

export function NotificationSettings({ prefs }: { prefs: NotificationPreference[] }) {
  const router = useRouter()
  const [, start] = useTransition()

  // Absent row means "on", the default is to be told.
  const get = (kind: NotifyKind, channel: 'in_app' | 'slack') =>
    prefs.find((p) => p.kind === kind)?.[channel] ?? true

  const toggle = (kind: NotifyKind, channel: 'in_app' | 'slack', on: boolean) =>
    start(async () => {
      await setNotificationPreference(kind, channel, on)
      router.refresh()
    })

  return (
    <div className="mx-auto max-w-2xl p-5">
      <Link href="/settings"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        Settings
      </Link>

      <h1 className="text-lg font-semibold tracking-tight">Notifications</h1>
      <p className="mb-4 mt-0.5 text-xs text-[var(--text-muted)]">
        Turn off what you do not need. You are never told about your own actions.
      </p>

      <div className="space-y-4">
        {NOTIFY_GROUPS.map((group) => {
          const kinds = (Object.keys(NOTIFY) as NotifyKind[])
            .filter((k) => NOTIFY[k].group === group)
          if (!kinds.length) return null

          return (
            <Panel key={group}>
              <PanelHeader
                title={group}
                action={
                  <div className="flex gap-6 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    <span className="w-10 text-center">In app</span>
                    <span className="w-10 text-center">Slack</span>
                  </div>
                }
              />
              {kinds.map((kind) => (
                <div key={kind}
                     className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                  <span className="min-w-0 flex-1 text-xs">{NOTIFY[kind].label}</span>
                  <div className="flex gap-6">
                    <span className="flex w-10 justify-center">
                      <input
                        type="checkbox"
                        checked={get(kind, 'in_app')}
                        onChange={(e) => toggle(kind, 'in_app', e.target.checked)}
                        aria-label={`${NOTIFY[kind].label} in app`}
                        className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-brand-600"
                      />
                    </span>
                    <span className="flex w-10 justify-center">
                      <input
                        type="checkbox"
                        checked={get(kind, 'slack')}
                        onChange={(e) => toggle(kind, 'slack', e.target.checked)}
                        aria-label={`${NOTIFY[kind].label} in Slack`}
                        className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-brand-600"
                      />
                    </span>
                  </div>
                </div>
              ))}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
