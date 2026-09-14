'use client'

import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragStartEvent,
} from '@dnd-kit/core'
import { AlertTriangle, Building2, ExternalLink, Plus, Target, Users } from 'lucide-react'
import {
  Avatar, Button, EmptyState, Input, Label, Panel, Select,
} from '@/components/ops/ui/primitives'
import { PriorityBadge } from '@/components/ops/badges'
import { WorkspaceTabs } from '@/components/ops/workspace-tabs'
import {
  checkDuplicates, createGtmAccount, moveGtmAccount, moveGtmAccounts,
  updateGtmAccount,
} from '@/lib/server/ops/actions'
import type { DuplicateHit } from '@/lib/server/ops/actions'
import { DuplicateWarning } from '@/components/ops/duplicate-warning'
import { BulkBar, SelectBox, useSelection } from '@/components/ops/board-selection'
import { atLeast, GTM_OUTCOME, GTM_STAGE, GTM_STAGES, PRIORITIES, PRIORITY, SOURCE_LINKS } from '@/lib/ops/constants'
import { useKanban } from '@/lib/ops/kanban'
import { SourceLink } from '@/components/ops/source-link'
import { cn, formatDateShort, plural } from '@/lib/ops/utils'
import type { GtmAccountRow, GtmStage, Person, Priority } from '@/types/ops'

/**
 * Stage limits, shown on the board.
 *
 * The database enforces these; this copy exists so a column can show 4/5
 * before anybody drags anything. It is a label, never the check, the server
 * is what refuses, which is what makes two people racing for the last slot
 * resolve correctly.
 */
const WIP_LIMITS: Partial<Record<GtmStage, number>> = {
  approved_build: 5,
  pending_outreach: 5,
}

export function GtmClient({
  me, accounts, people,
}: {
  me: Person
  accounts: GtmAccountRow[]
  people: Person[]
}) {
  const [now] = useState(() => Date.now())
  const [dupes, setDupes] = useState<DuplicateHit[]>([])
  const [createError, setCreateError] = useState<string | null>(null)
  const selection = useSelection()

  // What is sitting on the founder gate right now (§57).
  const pendingReview = useMemo(
    () => accounts.filter((a) => a.stage === 'pending_review').length, [accounts])
  const router = useRouter()
  const [, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [who, setWho] = useState('')
  const [dragging, setDragging] = useState<GtmAccountRow | null>(null)

  const [company, setCompany] = useState('')
  const [website, setWebsite] = useState('')
  const [researcher, setResearcher] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [signal, setSignal] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  // One shared implementation across every board (Phase 25): the same
  // validation, the same optimistic lifecycle, the same failure handling.
  const [capacityBlock, setCapacityBlock] = useState<
    { id: string; stage: GtmStage; message: string } | null>(null)

  const kanban = useKanban<GtmAccountRow, GtmStage>({
    rows: accounts,
    field: 'stage',
    stages: GTM_STAGES,
    save: async (id, stage) => {
      const r = await moveGtmAccount(id, stage)
      // A full stage is a decision to make, not an error to dismiss: the card
      // stays put and the dialog offers the ways forward.
      if (!r.ok && (r.data as { capacityReached?: boolean })?.capacityReached) {
        setCapacityBlock({ id, stage, message: r.error })
        return { ok: false, error: '' }   // handled here, not by the banner
      }
      return r
    },
    // A group move reports partial progress in the banner rather than opening
    // the capacity dialog, which only makes sense for a single card.
    saveMany: (ids, stage) => moveGtmAccounts(ids, stage),
    selectedIds: selection.ids,
    onMovedSelection: () => selection.clear(),
  })

  const visible = useMemo(() => {
    const out = kanban.view
    return out
  }, [kanban.view, who])


  /**
   * Check before creating (§5.1).
   *
   * The warning appears BEFORE the account exists, not after. It never blocks
   *, "create anyway" stays available, but the default is to look at what is
   * already there, because the cheapest duplicate is the one never made.
   */
  function create(force = false) {
    if (!company.trim()) return
    start(async () => {
      if (!force) {
        const hits = await checkDuplicates('gtm_account', company, website || null)
        if (hits.length) { setDupes(hits); return }
      }
      // §42: never clear the form on an unchecked result. A failed insert
      // that looks successful loses whatever the person typed and leaves
      // them believing the account exists.
      const r = await createGtmAccount({
        company, website: website || null,
        researcher_id: researcher || null, priority,
        signal_note: signal || null,
      })
      if (!r.ok) { setCreateError(r.error); return }

      setCompany(''); setWebsite(''); setSignal('')
      setDupes([]); setAdding(false); setCreateError(null)
      router.refresh()
    })
  }

  const inFlight = visible.filter((a) => a.stage !== 'complete').length
  const awaitingMe = visible.filter(
    (a) => a.stage === 'engaged' && a.owner_id === me.id).length

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">GTM Execution</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {inFlight} {plural(inFlight, 'account')} in flight
            {awaitingMe > 0 && (
              <span className="font-medium text-amber-600"> · {awaitingMe} waiting on you</span>
            )}
          </p>
          {/* The ranked universe stays in the workbook; this board works the
              handful that reached execution. */}
          <SourceLink className="mt-1.5" {...SOURCE_LINKS.gtm} />
        </div>

        <div className="flex items-center gap-1.5">
          <Select className="h-7 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === me.id ? 'Me' : p.name}</option>
            ))}
          </Select>
          <WorkspaceTabs tabs={[
            { href: '/gtm', label: 'Board' },
            { href: '/gtm/review', label: 'Review' },
            { href: '/gtm/analytics', label: 'Analytics' },
          ]} />
          {pendingReview > 0 && (
            <Link href="/gtm/review"
                  className="flex h-7 items-center gap-1 rounded-[3px] bg-amber-100 px-2 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300">
              {pendingReview} awaiting your review
            </Link>
          )}
          <Button size="sm" variant="secondary" onClick={selection.toggleMode}>
            {selection.active ? 'Cancel select' : 'Select'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3.5 w-3.5" />
            New account
          </Button>
        </div>
      </div>

      {adding && (
        <Panel className="mb-3">
          <div className="grid grid-cols-4 gap-3 p-4">
            <div>
              <Label>Company</Label>
              <Input autoFocus value={company} onChange={(e) => setCompany(e.target.value)}
                     placeholder="Acme Defense" />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)}
                     placeholder="acme.com" />
            </div>
            <div>
              <Label>Researcher</Label>
              <Select className="w-full" value={researcher}
                      onChange={(e) => setResearcher(e.target.value)}>
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select className="w-full" value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY[p].label}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-3">
              <Label>Why now? (the signal)</Label>
              <Input value={signal} onChange={(e) => setSignal(e.target.value)}
                     placeholder="Posted 3 BD roles this month" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="primary" onClick={() => create()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>

            {createError && (
              <p className="col-span-4 rounded-[3px] bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                {createError}
              </p>
            )}

            {dupes.length > 0 && (
              <div className="col-span-4">
                <DuplicateWarning
                  hits={dupes}
                  openHref={(id) => `/gtm/${id}`}
                  onCreateAnyway={() => create(true)}
                  onCancel={() => setDupes([])}
                />
              </div>
            )}
          </div>
        </Panel>
      )}

      {accounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Building2}
            title="No accounts yet"
            description="Add a company to start the research and outreach workflow."
            action={
              <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                New account
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
      <BulkBar
        kind="gtm_account"
        selection={selection}
        me={me}
        allIds={visible.map((a) => a.id)}
      />

      <Selection.Provider value={selection}>
      <Now.Provider value={now}>
        {/* A refused move must say why. Without this the card simply springs
            back to its old column and the board looks broken. */}
        {capacityBlock && (
        <div
          role="alertdialog"
          aria-label="Execution capacity reached"
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            Execution capacity reached
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {capacityBlock.message}
          </p>
          <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
            The card has not moved. Complete or move something out of that
            stage, or override if this one genuinely cannot wait.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {atLeast(me.role, 'admin') && (
              <Button size="xs" variant="secondary" onClick={() => start(async () => {
                const r = await moveGtmAccount(
                  capacityBlock.id, capacityBlock.stage,
                  { override: true, reason: 'Capacity override from the board' })
                setCapacityBlock(null)
                if (!r.ok) setCreateError(r.error)
                router.refresh()
              })}>
                Override capacity
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => setCapacityBlock(null)}>
              Leave it where it is
            </Button>
          </div>
        </div>
      )}

      {kanban.error && (
          <div
            role="alert"
            className="mb-2 flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <span>{kanban.error}</span>
            <button
              type="button"
              onClick={kanban.dismissError}
              className="shrink-0 rounded-[3px] px-1 font-medium hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <DndContext
          id="gtm-board"
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setDragging(visible.find((a) => a.id === e.active.id) ?? null)}
          onDragEnd={kanban.onDragEnd}
        >
          <div className="scrollbar-thin flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-3">
            {GTM_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                accounts={visible.filter((a) => a.stage === stage)}
                cap={WIP_LIMITS[stage]}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="w-56 rotate-2 opacity-90">
                <Card account={dragging} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        </Now.Provider>
      </Selection.Provider>
        </>
      )}
    </div>
  )
}

function Column({
  stage, accounts, cap,
}: {
  stage: GtmStage
  accounts: GtmAccountRow[]
  /** The stage's WIP limit, when it has one. */
  cap?: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div className="flex w-56 shrink-0 flex-col">
      <div className="mb-1.5 flex items-center gap-1.5 px-1" title={GTM_STAGE[stage].hint}>
        <span className={cn('h-1.5 w-1.5 rounded-full', GTM_STAGE[stage].dot)} />
        <span className="text-[11px] font-semibold">{GTM_STAGE[stage].label}</span>
        {cap ? (
          <span
            className={cn(
              'rounded-[3px] px-1 text-[10px] tabular',
              accounts.length > cap
                ? 'bg-amber-100 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : accounts.length >= cap
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'text-[var(--text-muted)]',
            )}
            title={accounts.length > cap
              ? `Over its limit of ${cap}. Clear the excess before adding more.`
              : accounts.length >= cap
                ? `Full. Complete or move something out before adding another.`
                : `${cap - accounts.length} slot${cap - accounts.length === 1 ? '' : 's'} left`}
          >
            {accounts.length}/{cap}
            {accounts.length > cap && <AlertTriangle className="ml-0.5 inline h-3 w-3" aria-label="Over capacity" />}
          </span>
        ) : (
          <span className="text-[10px] tabular text-[var(--text-muted)]">{accounts.length}</span>
        )}
      </div>

      <div
        ref={setNodeRef} data-column={stage}
        className={cn(
          'scrollbar-thin flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--surface)] p-1.5',
          'min-h-[60vh] max-h-[calc(100vh-13rem)]',
          'transition-colors', isOver && 'drop-target',
        )}
      >
        {accounts.map((a) => <Draggable key={a.id} account={a} />)}
        {!accounts.length && (
          <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">, </p>
        )}
      </div>
    </div>
  )
}

function Draggable({ account }: { account: GtmAccountRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: account.id })
  return (
    <div ref={setNodeRef} data-card={account.id} {...listeners} {...attributes} className={cn(isDragging && 'dragging')}>
      <Card account={account} />
    </div>
  )
}

/** One clock for the board, so every card ages against the same instant. */
const Now = createContext(0)

/** Selection state, read by the leaf card. */
const Selection = createContext<{
  active: boolean
  has: (id: string) => boolean
  toggle: (id: string) => void
} | null>(null)

function Card({ account }: { account: GtmAccountRow }) {
  const now = useContext(Now)
  const sel = useContext(Selection)
  // Days the campaign has been open, how long we have been at this.
  // `now` is passed in: reading the clock during render is not idempotent.
  const days = Math.max(0, Math.round(
    (now - +new Date(account.assigned_on)) / 864e5))

  // An active account with no next action is drifting. Say so on the card.
  const active = account.stage !== 'complete' && account.stage !== 'target'
  const drifting = active && !account.next_action

  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const overdue = account.next_action_on && new Date(account.next_action_on) < today

  return (
    <Link
      href={`/gtm/${account.id}`}
      className="block rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-2.5 transition-shadow hover:shadow-sm"
    >
      <div className="mb-1 flex items-center gap-1">
        {sel?.active && (
          <SelectBox checked={sel.has(account.id)}
                     onChange={() => sel.toggle(account.id)} />
        )}
        <PriorityBadge p={account.priority} />
        {drifting && (
          <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            No next action
          </span>
        )}
        {account.website && (
          <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]" />
        )}
      </div>

      {/* The company is the object. Everything else is detail about it. */}
      <p className="truncate text-[13px] font-semibold leading-tight">{account.company}</p>
      {account.industry && (
        <p className="mb-1 truncate text-[10px] text-[var(--text-muted)]">{account.industry}</p>
      )}

      {account.signal_note && (
        <p className="mb-1.5 line-clamp-2 text-[10px] italic text-[var(--text-secondary)]">
          {account.signal_note}
        </p>
      )}

      {account.outcome && (
        <span className={cn('mb-1.5 inline-block rounded px-1.5 py-px text-[9px] font-medium',
                            GTM_OUTCOME[account.outcome].chip)}>
          {GTM_OUTCOME[account.outcome].label}
        </span>
      )}

      {/* Who we are on right now, and how many we have already burned. */}
      {(account.current_contact || (account.attempt_count ?? 0) > 0) && (
        <div className="mb-1 flex items-baseline gap-1 text-[10px]">
          {account.current_contact ? (
            <>
              <Target className="h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]" />
              <span className="truncate font-medium">
                {account.current_contact.title || account.current_contact.name}
              </span>
            </>
          ) : <span className="text-[var(--text-muted)]">No current target</span>}
          {(account.attempt_count ?? 0) > 0 && (
            <span className="ml-auto shrink-0 tabular text-[var(--text-muted)]">
              {account.attempt_count} tried
            </span>
          )}
        </div>
      )}

      {account.next_action && (
        <p className="mb-1 truncate text-[10px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-muted)]">Next:</span> {account.next_action}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        {account.researcher && (
          <Avatar id={account.researcher.id} name={account.researcher.name}
                  src={account.researcher.avatar_url} size="xs" />
        )}
        {(account.contact_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] tabular text-[var(--text-muted)]">
            <Users className="h-2.5 w-2.5" />
            {account.contact_count}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] tabular">
          {account.next_action_on ? (
            <span className={cn(overdue ? 'font-medium text-rose-600' : 'text-[var(--text-muted)]')}>
              {formatDateShort(account.next_action_on)}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">{days}d</span>
          )}
        </span>
      </div>
    </Link>
  )
}
