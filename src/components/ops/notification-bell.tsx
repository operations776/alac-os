/**
 * Notification center.
 *
 * Unread first, deep-linked, and dismissible in bulk. The badge is the only
 * thing that should ever pull someone's eye here.
 */
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check } from 'lucide-react'
import { markNotificationsRead } from '@/lib/server/ops/actions'
import { cn, relative } from '@/lib/ops/utils'
import type { Notification } from '@/types/ops'

export function NotificationBell({ notifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read_at)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length ? `${unread.length} unread notifications` : 'Notifications'}
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
      >
        <Bell className="h-4 w-4" />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-bold tabular text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button
                onClick={() => start(async () => {
                  await markNotificationsRead()
                  router.refresh()
                })}
                className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                Nothing new.
              </p>
            ) : notifications.map((n) => (
              <Link
                key={n.id}
                href={n.url ?? '/'}
                onClick={() => {
                  setOpen(false)
                  if (!n.read_at) {
                    start(async () => { await markNotificationsRead([n.id]) })
                  }
                }}
                className={cn(
                  'flex gap-2 border-b border-[var(--border)] px-3 py-2.5 last:border-0',
                  'hover:bg-[var(--surface-hover)]',
                  !n.read_at && 'bg-brand-50/50 dark:bg-brand-950/30',
                )}
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                    n.read_at ? 'bg-transparent' : 'bg-brand-600')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {relative(n.created_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <Link
            href="/settings/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--border)] px-3 py-2 text-center text-[10px] text-[var(--text-muted)] hover:text-brand-600"
          >
            Notification settings
          </Link>
        </div>
      )}
    </div>
  )
}
