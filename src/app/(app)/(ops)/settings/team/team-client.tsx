'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, UserPlus, X } from 'lucide-react'
import {
  Avatar, Button, Input, Label, Panel, PanelHeader, Select,
} from '@/components/ops/ui/primitives'
import { invitePerson, revokeInvitation, updatePerson } from '@/lib/server/ops/actions'
import { ROLE, ROLES, USER_STATE, atLeast } from '@/lib/ops/constants'
import { cn, relative } from '@/lib/ops/utils'
import type { Invitation, OrgFunction, Person, UserRole } from '@/types/ops'

export function TeamClient({
  me, people, functions, invitations,
}: {
  me: Person
  people: Person[]
  functions: OrgFunction[]
  invitations: Invitation[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [fnId, setFnId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const canManage = atLeast(me.role, 'admin')

  function invite() {
    if (!email.trim() || !name.trim()) { setError('Name and email are required'); return }
    setError(null)
    start(async () => {
      const r = await invitePerson({
        email, name, role, function_id: fnId || null,
      })
      if (!r.ok) { setError(r.error); return }
      // There is no invite email: the login exists now, and this is the only
      // time its temporary password is shown. So it stays until dismissed.
      setSent(r.data?.tempPassword
        ? `${name} can sign in now as ${email.trim().toLowerCase()} with the temporary password ${r.data.tempPassword}. Send it to them privately; it is not shown again. They change it in Settings.`
        : `${name} invited.`)
      setEmail(''); setName(''); setInviting(false)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl p-5">
      <Link href="/settings"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        Settings
      </Link>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Team</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {people.length} people. Roles decide what someone can change.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="primary" onClick={() => setInviting((v) => !v)}>
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </div>

      {inviting && (
        <Panel className="mb-4">
          <PanelHeader title="Invite a teammate" />
          <div className="grid grid-cols-2 gap-3 p-4">
            <div>
              <Label>Name</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Work email</Label>
              <Input type="email" value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="name@company.com" />
            </div>
            <div>
              <Label>Role</Label>
              <Select className="w-full" value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE[r].label}</option>
                ))}
              </Select>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {ROLE[role].hint}
              </p>
            </div>
            <div>
              <Label>Function</Label>
              <Select className="w-full" value={fnId}
                      onChange={(e) => setFnId(e.target.value)}>
                <option value="">None</option>
                {functions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>

            {error && (
              <p className="col-span-2 rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                {error}
              </p>
            )}

            <div className="col-span-2 flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={invite}>Create login</Button>
              <Button size="sm" variant="ghost" onClick={() => setInviting(false)}>Cancel</Button>
              <p className="ml-auto flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Mail className="h-3 w-3" />
                A temporary password is shown once. Nothing is emailed.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {sent && (
        <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {sent}{' '}
          <button type="button" className="ml-1 underline" onClick={() => setSent(null)}>Dismiss</button>
        </p>
      )}

      {invitations.length > 0 && (
        <Panel className="mb-4">
          <PanelHeader title={`Pending invitations · ${invitations.length}`} />
          {invitations.map((inv) => {
            const fn = functions.find((f) => f.id === inv.function_id)
            const expired = new Date(inv.expires_at) < new Date()
            return (
              <div key={inv.id}
                   className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <Mail className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{inv.name}</p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">{inv.email}</p>
                </div>
                <span className="w-28 text-xs">{ROLE[inv.role].label}</span>
                <span className="w-32 truncate text-xs text-[var(--text-muted)]">
                  {fn?.name ?? '-'}
                </span>
                <span className={cn('w-20 text-right text-[10px]',
                  expired ? 'text-rose-600' : 'text-[var(--text-muted)]')}>
                  {expired ? 'Expired' : `Sent ${relative(inv.invited_at)}`}
                </span>
                {canManage && (
                  <button
                    onClick={() => start(async () => {
                      await revokeInvitation(inv.id); router.refresh()
                    })}
                    className="text-[var(--text-muted)] hover:text-rose-600"
                    aria-label="Revoke invitation"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
            An invitation left from before the merge. Invite them again to create
            their login; the role and function here carry over.
          </p>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          <span className="flex-1">Person</span>
          <span className="w-28">Role</span>
          <span className="w-32">Function</span>
          <span className="w-20 text-right">State</span>
        </div>

        {people.map((p) => {
          const fn = functions.find((f) => f.id === p.function_id)
          // Nobody can demote themselves out of the ability to manage the team.
          const editable = canManage && p.id !== me.id

          return (
            <div key={p.id}
                 className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar id={p.id} name={p.name} src={p.avatar_url} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {p.name}
                    {p.id === me.id && (
                      <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">you</span>
                    )}
                  </p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">
                    {p.job_title ?? p.title ?? p.email}
                  </p>
                </div>
              </div>

              {editable ? (
                <Select
                  className="h-7 w-28 text-xs"
                  value={p.role}
                  onChange={(e) => start(async () => {
                    await updatePerson(p.id, { role: e.target.value as UserRole })
                    router.refresh()
                  })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE[r].label}</option>
                  ))}
                </Select>
              ) : (
                <span className="w-28 text-xs">{ROLE[p.role].label}</span>
              )}

              {editable ? (
                <Select
                  className="h-7 w-32 text-xs"
                  value={p.function_id ?? ''}
                  onChange={(e) => start(async () => {
                    await updatePerson(p.id, { function_id: e.target.value || null })
                    router.refresh()
                  })}
                >
                  <option value="">None</option>
                  {functions.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
              ) : (
                <span className="w-32 truncate text-xs text-[var(--text-muted)]">
                  {fn?.name ?? '-'}
                </span>
              )}

              <div className="w-20 text-right">
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    USER_STATE[p.state].chip)}>
                  {USER_STATE[p.state].label}
                </span>
                {p.state === 'invited' && p.invited_at && (
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {relative(p.invited_at)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </Panel>

      {!canManage && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Only admins and owners can invite people or change roles.
        </p>
      )}
    </div>
  )
}
