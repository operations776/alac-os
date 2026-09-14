'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, MessageSquare, PenLine, Users } from 'lucide-react'
import {
  Avatar, Button, Input, Label, Panel, PanelHeader,
} from '@/components/ops/ui/primitives'
import { updateProfile } from '@/lib/server/ops/actions'
import { signOutAction } from '@/app/signin/actions'
import { changePassword as changePasswordAction } from './actions'
import { DEPARTMENT } from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person } from '@/types/ops'

export function SettingsClient({
  me, people,
}: {
  me: Person
  people: Person[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [name, setName] = useState(me.name)
  const [title, setTitle] = useState(me.title ?? '')
  const [saved, setSaved] = useState(false)

  const [pw0, setPw0] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /**
   * Change the signed-in person's password.
   *
   * The server checks the current password, stores only a salted hash, and
   * signs out every other session. The length check is repeated there; this
   * one only saves a round trip.
   */
  async function changePassword() {
    setPwMsg(null)
    if (!pw0) {
      setPwMsg({ ok: false, text: 'Enter your current password.' }); return
    }
    if (pw1.length < 10) {
      setPwMsg({ ok: false, text: 'Use at least 10 characters.' }); return
    }
    if (pw1 !== pw2) {
      setPwMsg({ ok: false, text: 'Those do not match.' }); return
    }
    setPwBusy(true)
    const res = await changePasswordAction(pw0, pw1)
    setPwBusy(false)
    if (!res.ok) { setPwMsg({ ok: false, text: res.error }); return }
    setPw0(''); setPw1(''); setPw2('')
    setPwMsg({ ok: true, text: 'Password updated. Other devices have been signed out.' })
  }


  function saveProfile() {
    start(async () => {
      await updateProfile({ name, title: title || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  async function signOut() {
    // Deletes the session row server side, then redirects to /signin.
    await signOutAction()
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Settings</h1>

      <Panel className="mb-4">
        <PanelHeader title="You" />
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                     placeholder="Head of Marketing" />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input value={me.email} disabled />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={saveProfile}>Save</Button>
            {saved && <span className="text-[10px] text-emerald-600">Saved</span>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="mb-4">
        <PanelHeader title="Password" />
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            Everyone starts on a shared temporary password. Change yours to
            something only you know.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Current password</Label>
              <Input
                type="password"
                value={pw0}
                onChange={(e) => setPw0(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label>New password</Label>
              <Input
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="At least 10 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label>Confirm</Label>
              <Input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') changePassword() }}
                placeholder="Type it again"
                autoComplete="new-password"
              />
            </div>
          </div>
          {pwMsg && (
            <p className={cn('text-xs',
              pwMsg.ok ? 'text-emerald-600'
                       : 'text-rose-600 dark:text-rose-400')}>
              {pwMsg.text}
            </p>
          )}
          <Button size="sm" variant="primary"
                  onClick={changePassword} disabled={pwBusy}>
            {pwBusy ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </Panel>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Link href="/settings/team" className="panel p-3 hover:border-brand-400">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold">Team</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            Invite people and set roles.
          </p>
        </Link>
        <Link href="/settings/notifications" className="panel p-3 hover:border-brand-400">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold">Notifications</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            What reaches you, and where.
          </p>
        </Link>
        <Link href="/settings/integrations" className="panel p-3 hover:border-brand-400">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold">Integrations</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            Outlook, Drive, and Slack.
          </p>
        </Link>
        <Link href="/content/voice" className="panel p-3 hover:border-brand-400">
          <div className="flex items-center gap-2">
            <PenLine className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold">Voice</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            How drafts should sound.
          </p>
        </Link>
      </div>

      <Panel className="mb-4">
        <PanelHeader title={`Team · ${people.length}`} />
        <div>
          {people.map((p) => (
            <div key={p.id}
                 className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
              <Avatar id={p.id} name={p.name} src={p.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {p.name}
                  {p.id === me.id && (
                    <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">you</span>
                  )}
                </p>
                <p className="truncate text-[10px] text-[var(--text-muted)]">
                  {p.title ?? p.email}
                </p>
              </div>
              {p.department && (
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    DEPARTMENT[p.department].chip)}>
                  {DEPARTMENT[p.department].label}
                </span>
              )}
              {p.is_admin && (
                <span className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                  Admin
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="px-4 py-2.5 text-[10px] text-[var(--text-muted)]">
          Everyone sees and edits everything. Admins can archive projects.
        </p>
      </Panel>

    </div>
  )
}
