/**
 * Notification center.
 *
 * Unread first, deep-linked, and dismissible in bulk. The badge is the only
 * thing that should ever pull someone's eye here.
 *
 * Live: it polls /api/notifications every minute while the tab is visible, so
 * a reminder or an assignment arrives without a navigation, and the badge
 * pops when the unread count rises. Desktop alerts only when the browser has
 * already granted permission; the panel offers the prompt, it never fires it.
 */
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check } from 'lucide-react'
import { markNotificationsRead } from '@/lib/server/ops/actions'
import { cn, relative } from '@/lib/ops/utils'
import type { Notification as OpsNotification } from '@/types/ops'

const POLL_MS = 60_000

type Live = { list: OpsNotification[]; unread: number }

export function NotificationBell({ notifications }: { notifications: OpsNotification[] }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // What the last poll or local action said. A server render (new props after
  // router.refresh) is fresher, so it drops back to the props.
  const [live, setLive] = useState<Live | null>(null)
  const [propsSeen, setPropsSeen] = useState(notifications)
  if (propsSeen !== notifications) {
    setPropsSeen(notifications)
    setLive(null)
  }
  const list = live?.list ?? notifications
  const unread = live?.unread ?? notifications.filter((n) => !n.read_at).length

  // Bumped when the unread count rises; the key change replays the pop.
  const [bump, setBump] = useState(0)
  const unreadRef = useRef(unread)
  useEffect(() => { unreadRef.current = unread }, [unread])
  const seen = useRef(new Set(notifications.map((n) => n.id)))
  // Re-render after the permission prompt resolves.
  const [, setPermission] = useState<string>('')

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    let cancelled = false

    function alertNew(items: OpsNotification[]) {
      const fresh = items.filter((n) => !n.read_at && !seen.current.has(n.id))
      for (const n of items) seen.current.add(n.id)
      if (!('Notification' in window) || window.Notification.permission !== 'granted') return
      for (const n of fresh.slice(0, 3)) {
        const alert = new window.Notification(n.title, { body: n.body ?? undefined, tag: n.id })
        alert.onclick = () => {
          window.focus()
          if (n.url) router.push(n.url)
          alert.close()
        }
      }
    }

    async function poll() {
      if (document.hidden) return
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { notifications: OpsNotification[]; unread: number }
        if (cancelled) return
        if (data.unread > unreadRef.current) setBump((b) => b + 1)
        alertNew(data.notifications)
        setLive({ list: data.notifications, unread: data.unread })
      } catch {
        // Offline or a deploy in flight. The next tick tries again.
      }
    }

    const timer = setInterval(poll, POLL_MS)
    const onVisible = () => { if (!document.hidden) void poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  // Only read while the panel is open, which never happens on the server.
  const canAskDesktop = open && typeof window !== 'undefined' && 'Notification' in window
    && window.Notification.permission === 'default'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            key={bump}
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-bold tabular text-white',
              bump > 0 && 'anim-pop',
            )}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => start(async () => {
                  const now = new Date().toISOString()
                  setLive({ list: list.map((n) => ({ ...n, read_at: n.read_at ?? now })), unread: 0 })
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
            {list.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                Nothing new.
              </p>
            ) : list.map((n) => (
              <Link
                key={n.id}
                href={n.url ?? '/'}
                onClick={() => {
                  setOpen(false)
                  if (!n.read_at) {
                    const now = new Date().toISOString()
                    setLive({
                      list: list.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)),
                      unread: Math.max(unread - 1, 0),
                    })
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

          <div className="flex items-center justify-center gap-3 border-t border-[var(--border)] px-3 py-2">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-[10px] text-[var(--text-muted)] hover:text-brand-600"
            >
              Notification settings
            </Link>
            {canAskDesktop && (
              <button
                onClick={() => {
                  void window.Notification.requestPermission().then(setPermission)
                }}
                className="text-[10px] text-[var(--text-muted)] hover:text-brand-600"
              >
                Enable desktop alerts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
