/**
 * The founder review gate (§57).
 *
 * Everything needed to make one decision, on one screen: why this company,
 * what evidence supports it, who we would approach and why, and in what
 * order. Three outcomes, approve, hold, decline, and nothing happens
 * without one of them (§65).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, ExternalLink, PauseCircle, ShieldCheck, ShieldAlert, XCircle,
} from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Panel, PanelHeader,
} from '@/components/ops/ui/primitives'
import { PriorityBadge } from '@/components/ops/badges'
import {
  approveGtmAccount, holdGtmAccount, rejectGtmAccount,
} from '@/lib/server/ops/actions'
import { cn, formatDate } from '@/lib/ops/utils'
import type { GtmAccountRow, GtmContact, GtmEvidence, Person } from '@/types/ops'

type Account = GtmAccountRow & { contacts: GtmContact[]; evidence: GtmEvidence[] }

export function ReviewClient({
  accounts,
}: {
  me: Person
  accounts: Account[]
}) {
  return (
    <div className="p-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Pending review</h1>
        <p className="text-xs text-[var(--text-muted)]">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} waiting
          on a decision. Nothing is contacted until you approve and launch.
        </p>
      </div>

      {accounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting"
            description="Accounts appear here when research is complete and someone submits them."
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => <ReviewCard key={a.id} account={a} />)}
        </div>
      )}
    </div>
  )
}

function ReviewCard({ account: a }: { account: Account }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'none' | 'hold' | 'reject'>('none')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const unverified = a.evidence.filter((e) => !e.verified_at).length

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setMode('none'); setNote(''); setError(null)
      router.refresh()
    })

  return (
    <Panel>
      <PanelHeader
        title={a.company}
        action={
          <div className="flex items-center gap-2">
            <PriorityBadge p={a.priority} />
            {a.website && (
              <a href={`https://${a.website.replace(/^https?:\/\//, '')}`}
                 target="_blank" rel="noreferrer"
                 className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        }
      />

      <div className="space-y-4 p-4">
        {/* Why now, the reason this company is worth a campaign. */}
        <div>
          <h3 className="section-label mb-1">Why now</h3>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {a.why_now || a.signal_note || (
              <span className="text-[var(--text-muted)]">No signal recorded.</span>
            )}
          </p>
        </div>

        {/* Evidence. §59: a claim in outreach must be defensible. */}
        <div>
          <h3 className="section-label mb-1">
            Evidence
            {unverified > 0 && (
              <span className="ml-2 rounded-[3px] bg-amber-100 px-1.5 py-px text-[9px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                {unverified} unverified
              </span>
            )}
          </h3>
          {a.evidence.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              No sources recorded yet. Copy cannot go out with unverified claims.
            </p>
          ) : (
            <ul className="space-y-1">
              {a.evidence.map((e) => (
                <li key={e.id}
                    className="flex items-start gap-2 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5">
                  {e.verified_at
                    ? <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                    : <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px]">{e.claim}</p>
                    {e.source_url && (
                      <a href={e.source_url} target="_blank" rel="noreferrer"
                         className="text-[10px] text-[var(--accent)] hover:underline">
                        {e.source_title || e.source_url}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Who we would approach, in order (§53). */}
        <div>
          <h3 className="section-label mb-1">
            Decision makers · {a.contacts.length}
          </h3>
          {a.contacts.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              Nobody identified yet.
            </p>
          ) : (
            <ol className="space-y-1">
              {a.contacts.map((c, i) => (
                <li key={c.id}
                    className="flex items-start gap-2 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium">
                      {c.name}
                      {c.title && (
                        <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                          {c.title}
                        </span>
                      )}
                    </p>
                    {c.why_this_person && (
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {c.why_this_person}
                      </p>
                    )}
                  </div>
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                       className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {a.researcher && (
          <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            Researched by
            <Avatar id={a.researcher.id} name={a.researcher.name}
                    src={a.researcher.avatar_url} size="xs" />
            {a.researcher.name} · {formatDate(a.assigned_on)}
          </p>
        )}

        {error && (
          <p className="rounded-[3px] bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        )}

        {mode !== 'none' && (
          <Input
            autoFocus value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'hold'
              ? 'Why hold it? (optional)'
              : 'Why are we not pursuing this?'}
            className="text-xs"
          />
        )}

        <div className="flex items-center gap-2">
          {mode === 'none' ? (
            <>
              <Button size="sm" variant="primary" disabled={pending}
                      onClick={() => act(() => approveGtmAccount(a.id))}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve for SourceWhale
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode('hold')}>
                <PauseCircle className="h-3.5 w-3.5" /> Hold
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('reject')}>
                <XCircle className="h-3.5 w-3.5" /> Not pursuing
              </Button>
              <Link href={`/gtm/${a.id}`}
                    className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                Open account
              </Link>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={mode === 'reject' ? 'danger' : 'primary'}
                disabled={pending || (mode === 'reject' && !note.trim())}
                onClick={() => act(() => mode === 'hold'
                  ? holdGtmAccount(a.id, note || undefined)
                  : rejectGtmAccount(a.id, note))}
              >
                {mode === 'hold' ? 'Hold this account' : 'Confirm, not pursuing'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setMode('none'); setNote('') }}>
                Cancel
              </Button>
            </>
          )}
        </div>

        <p className={cn('text-[10px] text-[var(--text-muted)]')}>
          Approving prepares the account for SourceWhale. Nothing is sent until
          you launch outreach separately.
        </p>
      </div>
    </Panel>
  )
}
