'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Check, ExternalLink, Plus, Send, X,
} from 'lucide-react'
import { PlatformIcon } from '@/components/ops/platform-icon'
import {
  Avatar, Button, EmptyState, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import {
  addGtmContact, confirmSourceWhaleLoad, deleteGtmContact, deleteGtmContacts,
  deleteOutreachDraft, deleteOutreachDrafts, retractSourceWhaleLoad,
  reviewOutreachDraft, reviewOutreachDrafts, saveOutreachDraft,
  updateGtmAccount, updateGtmContact,
} from '@/lib/server/ops/actions'
import {
  DRAFT_STATUS, GTM_STAGE, GTM_STAGES, HIRING_MANAGER, PRIORITIES, PRIORITY,
  SENIORITY,
} from '@/lib/ops/constants'
import {
  ProspectOutreach, outreachState, type ProspectDraft,
} from '@/components/ops/gtm/prospect-outreach'
import { cn, formatDate, relative } from '@/lib/ops/utils'
import type {
  ActivityEntry, GtmAccountRow, GtmContact, 
  OutreachDraft, Person, Priority,
} from '@/types/ops'

export function AccountClient({
  me, account, contacts, drafts, people, activity,
}: {
  me: Person
  account: GtmAccountRow
  contacts: GtmContact[]
  drafts: OutreachDraft[]
  people: Person[]
  activity: ActivityEntry[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [addingContact, setAddingContact] = useState(false)
  const [writingDraft, setWritingDraft] = useState<OutreachDraft | 'new' | null>(null)

  const save = (patch: Parameters<typeof updateGtmAccount>[1]) =>
    start(async () => { await updateGtmAccount(account.id, patch); router.refresh() })

  const [actionError, setActionError] = useState<string | null>(null)
  const [editingWhy, setEditingWhy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [swAck, setSwAck] = useState(false)
  // One prospect open at a time: three expanded rows of email copy is a wall
  // of text, and the comparison being made is between people, not within one.
  const [openContact, setOpenContact] = useState<string | null>(null)

  // Clearing a mis-imported list one row at a time is a chore people skip,
  // so the bad rows stay. Both lists get the same select-and-remove.
  const [pickedContacts, setPickedContacts] = useState<Set<string>>(new Set())
  const [pickedDrafts, setPickedDrafts] = useState<Set<string>>(new Set())
  // Non-null while asking what needs changing on the selected drafts.
  const [revisionNote, setRevisionNote] = useState<string | null>(null)
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }
  const [whyDraft, setWhyDraft] = useState(account.signal_note ?? '')





  // Only the account owner should be able to clear a founder review.
  const canReview = account.owner_id === me.id || me.role === 'owner' || me.role === 'admin'

  return (
    <div className="mx-auto max-w-5xl p-5">
      <Link href="/gtm"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        GTM
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{account.company}</h1>
            {account.website && (
              <a href={`https://${account.website.replace(/^https?:\/\//, '')}`}
                 target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1 text-[10px] text-brand-600 hover:underline">
                <ExternalLink className="h-2.5 w-2.5" />
                {account.website}
              </a>
            )}
            {/* Started from the desk: the same company, keyed on its Record ID. */}
            {account.external_url?.startsWith('/queue/') && (
              <Link href={account.external_url} className="text-[10px] text-brand-600 hover:underline">
                Open on the desk
              </Link>
            )}
          </div>
          {editingWhy ? (
            <div className="mt-1.5">
              <Textarea
                autoFocus
                rows={5}
                className="w-full text-xs"
                value={whyDraft}
                onChange={(e) => setWhyDraft(e.target.value)}
                placeholder="What happened, and why does it make this the moment to reach out?"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button size="xs" onClick={() => start(async () => {
                  await updateGtmAccount(account.id, {
                    signal_note: whyDraft.trim() || null,
                  })
                  setEditingWhy(false)
                  router.refresh()
                })}>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => {
                  setWhyDraft(account.signal_note ?? '')
                  setEditingWhy(false)
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingWhy(true)}
              className="group mt-1 block w-full rounded-[3px] p-1 -m-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              <span className="font-medium">Why now:</span>{' '}
              {account.signal_note || (
                <span className="italic text-[var(--text-muted)]">
                  Add why this is the moment to reach out
                </span>
              )}
              <span className="ml-1.5 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                Edit
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Stage strip, the whole workflow at a glance. */}
      {actionError && (
        <div role="alert"
             className="mb-3 flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}
                  className="shrink-0 rounded-[3px] px-1 font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* The load gate. Approved, Build means "put this into SourceWhale",
          and nothing recorded whether that actually happened, so an account
          could reach Ready to Launch with half a persona list. */}
      {account.stage === 'approved_build' && !account.sw_loaded_by && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            Confirm the SourceWhale load before this moves on
          </p>
          <label className="mt-2 flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={swAck}
              onChange={(e) => setSwAck(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              {account.company} is uploaded into SourceWhale, and{' '}
              <strong className="font-medium">every hiring manager and above</strong>{' '}
              is included, not only the contacts we are targeting first.
            </span>
          </label>
          <div className="mt-2.5 flex items-center gap-2">
            <Button size="xs" disabled={!swAck} onClick={() => start(async () => {
              setActionError(null)
              const r = await confirmSourceWhaleLoad(account.id)
              if (!r.ok) { setActionError(r.error); return }
              router.refresh()
            })}>
              Confirm load
            </Button>
            {!swAck && (
              <span className="text-[10px] text-[var(--text-muted)]">
                Tick the box to confirm
              </span>
            )}
          </div>
        </div>
      )}

      {account.sw_loaded_by && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
            <Check className="mr-1 inline h-3 w-3" />
            Loaded into SourceWhale by{' '}
            {people.find((pp) => pp.id === account.sw_loaded_by)?.name ?? 'someone'}
            {account.sw_loaded_at && ` · ${formatDate(account.sw_loaded_at)}`}
          </p>
          <button
            onClick={() => start(async () => {
              await retractSourceWhaleLoad(account.id); router.refresh()
            })}
            className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-rose-600"
          >
            The list was incomplete
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {GTM_STAGES.map((s, i) => {
          const idx = GTM_STAGES.indexOf(account.stage)
          const done = i < idx
          const now = s === account.stage
          return (
            <button
              key={s}
              onClick={() => save({ stage: s })}
              title={GTM_STAGE[s].hint}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                now ? 'bg-brand-600 font-medium text-white'
                    : done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                           : 'border border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
              )}
            >
              {done && <Check className="h-2.5 w-2.5" />}
              {GTM_STAGE[s].label}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Decision makers */}
          <Panel>
            <PanelHeader
              title={`Decision makers · ${contacts.length}`}
              action={
                <div className="flex items-center gap-2">
                  {pickedContacts.size > 0 ? (
                    <>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {pickedContacts.size} selected
                      </span>
                      <Button size="xs" variant="ghost" onClick={() => start(async () => {
                        await deleteGtmContacts([...pickedContacts], account.id)
                        setPickedContacts(new Set())
                        router.refresh()
                      })}>
                        <X className="h-3 w-3" /> Remove selected
                      </Button>
                      <Button size="xs" variant="ghost"
                              onClick={() => setPickedContacts(new Set())}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {contacts.length > 1 && (
                        <Button size="xs" variant="ghost"
                                onClick={() => setPickedContacts(new Set(contacts.map((c) => c.id)))}>
                          Select all
                        </Button>
                      )}
                      <Button size="xs" variant="ghost"
                              onClick={() => setAddingContact((a) => !a)}>
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </>
                  )}
                </div>
              }
            />
            {addingContact && (
              <ContactForm accountId={account.id} onDone={() => {
                setAddingContact(false); router.refresh()
              }} />
            )}
            {contacts.length === 0 && !addingContact ? (
              <EmptyState
                title="No contacts yet"
                description="Founder, CEO, President first, then the relevant functional leader."
              />
            ) : (
              contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  accountId={account.id}
                  draft={drafts.find((d) => d.contact_id === c.id) ?? null}
                  expanded={openContact === c.id}
                  onToggle={() => setOpenContact(openContact === c.id ? null : c.id)}
                  picked={pickedContacts.has(c.id)}
                  onPick={() => setPickedContacts((p) => toggle(p, c.id))}
                  onChanged={() => router.refresh()}
                />
              ))
            )}
          </Panel>

          {/* Outreach */}
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Details" />
            <div className="space-y-3 p-4">
              <div>
                <Label>Researcher</Label>
                <Select className="w-full" value={account.researcher_id ?? ''}
                        onChange={(e) => save({ researcher_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select className="w-full" value={account.owner_id ?? ''}
                        onChange={(e) => save({ owner_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select className="w-full" value={account.priority}
                        onChange={(e) => save({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY[p].label}</option>
                  ))}
                </Select>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Assigned {formatDate(account.assigned_on)}
                {account.signal_source && ` · via ${account.signal_source}`}
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="History" />
            {activity.length === 0 ? (
              <EmptyState title="Nothing yet" />
            ) : (
              <ul className="p-3">
                {activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex items-start gap-2 py-1">
                    {a.actor
                      ? <Avatar id={a.actor.id} name={a.actor.name}
                                src={a.actor.avatar_url} size="xs" />
                      : <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-[var(--surface-hover)]" />}
                    <p className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--text-secondary)]">
                      {a.summary}
                      <span className="ml-1 text-[var(--text-muted)]">
                        {relative(a.created_at)}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function ContactForm({
  accountId, onDone,
}: { accountId: string; onDone: () => void }) {
  const [, start] = useTransition()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [seniority, setSeniority] = useState(1)
  const [hiringFor, setHiringFor] = useState('')
  const [rationale, setRationale] = useState('')

  return (
    <div className="grid grid-cols-2 gap-2.5 border-b border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <div>
        <Label>Name</Label>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="VP Business Development" />
      </div>
      <div>
        <Label>Seniority</Label>
        <Select className="w-full" value={seniority}
                onChange={(e) => setSeniority(Number(e.target.value))}>
          {SENIORITY.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>LinkedIn</Label>
        <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)}
               placeholder="https://linkedin.com/in/…" />
      </div>
      {seniority === HIRING_MANAGER && (
        <div className="col-span-2">
          <Label>Hiring for</Label>
          <Input value={hiringFor} onChange={(e) => setHiringFor(e.target.value)}
                 placeholder="Manufacturing, Quality, Engineering…" />
        </div>
      )}
      <div className="col-span-2">
        <Label>Why this person?</Label>
        <Input value={rationale} onChange={(e) => setRationale(e.target.value)}
               placeholder="Owns the org we would support" />
      </div>
      <div className="col-span-2 flex gap-2">
        <Button size="sm" variant="primary"
          onClick={() => {
            if (!name.trim()) return
            start(async () => {
              await addGtmContact({
                account_id: accountId, name, title: title || null,
                linkedin_url: linkedin || null, seniority,
                hiring_for: hiringFor || null, rationale: rationale || null,
              })
              onDone()
            })
          }}>
          Add contact
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}

/**
 * One decision maker, editable in place.
 *
 * Contacts could previously only be added or deleted, so fixing a misspelled
 * name or a changed title meant deleting the person and retyping everything, * which also lost whatever rationale had been written about them.
 */
function ContactRow({
  contact: c, accountId, picked, onPick, onChanged, draft, expanded, onToggle,
}: {
  contact: GtmContact
  accountId: string
  picked: boolean
  onPick: () => void
  onChanged: () => void
  /** This prospect's outreach, or null before any exists. */
  draft: ProspectDraft | null
  expanded: boolean
  onToggle: () => void
}) {
  const [, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [editingWhy, setEditingWhy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [swAck, setSwAck] = useState(false)
  // One prospect open at a time: three expanded rows of email copy is a wall
  // of text, and the comparison being made is between people, not within one.
  const [openContact, setOpenContact] = useState<string | null>(null)

  // Clearing a mis-imported list one row at a time is a chore people skip,
  // so the bad rows stay. Both lists get the same select-and-remove.
  const [pickedContacts, setPickedContacts] = useState<Set<string>>(new Set())
  const [pickedDrafts, setPickedDrafts] = useState<Set<string>>(new Set())
  // Non-null while asking what needs changing on the selected drafts.
  const [revisionNote, setRevisionNote] = useState<string | null>(null)
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }
  const [whyDraft, setWhyDraft] = useState(c.rationale ?? '')
  const [d, setD] = useState({
    name: c.name,
    title: c.title ?? '',
    linkedin_url: c.linkedin_url ?? '',
    seniority: c.seniority,
    hiring_for: c.hiring_for ?? '',
    rationale: c.rationale ?? '',
  })

  const saveContact = () => start(async () => {
    await updateGtmContact(c.id, accountId, {
      name: d.name.trim() || c.name,
      title: d.title.trim() || null,
      linkedin_url: d.linkedin_url.trim() || null,
      seniority: d.seniority,
      hiring_for: d.seniority === HIRING_MANAGER ? (d.hiring_for.trim() || null) : null,
      rationale: d.rationale.trim() || null,
    })
    setEditing(false)
    onChanged()
  })

  if (editing) {
    return (
      <div className="grid grid-cols-2 gap-2.5 border-b border-[var(--border)] bg-[var(--surface-sunken)] p-4 last:border-0">
        <div>
          <Label>Name</Label>
          <Input autoFocus value={d.name}
                 onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={d.title}
                 onChange={(e) => setD({ ...d, title: e.target.value })} />
        </div>
        <div>
          <Label>Seniority</Label>
          <Select className="w-full" value={d.seniority}
                  onChange={(e) => setD({ ...d, seniority: Number(e.target.value) })}>
            {SENIORITY.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>LinkedIn</Label>
          <Input value={d.linkedin_url}
                 onChange={(e) => setD({ ...d, linkedin_url: e.target.value })}
                 placeholder="https://linkedin.com/in/…" />
        </div>
        {d.seniority === HIRING_MANAGER && (
          <div className="col-span-2">
            <Label>Hiring for</Label>
            <Input value={d.hiring_for}
                   onChange={(e) => setD({ ...d, hiring_for: e.target.value })}
                   placeholder="Manufacturing, Quality, Engineering…" />
          </div>
        )}
        <div className="col-span-2">
          <Label>Why this person?</Label>
          <Input value={d.rationale}
                 onChange={(e) => setD({ ...d, rationale: e.target.value })} />
        </div>
        <div className="col-span-2 flex gap-2">
          <Button size="sm" variant="primary" onClick={saveContact}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setD({
              name: c.name, title: c.title ?? '', linkedin_url: c.linkedin_url ?? '',
              seniority: c.seniority, hiring_for: c.hiring_for ?? '',
              rationale: c.rationale ?? '',
            })
            setEditing(false)
          }}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-[var(--border)] last:border-0">
    <div
      onClick={onToggle}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 px-4 py-2.5',
        expanded ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]',
      )}
    >
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${c.name}`}
        className="mt-0.5 shrink-0"
      />
      <span className={cn(
        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
        c.seniority === 1 ? 'bg-rose-500'
          : c.seniority === 2 ? 'bg-amber-500'
          : c.seniority === HIRING_MANAGER ? 'bg-violet-500' : 'bg-slate-300',
      )} title={SENIORITY.find((s) => s.value === c.seniority)?.label} />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {c.name}
          {c.title && (
            <span className="ml-1.5 font-normal text-[var(--text-muted)]">{c.title}</span>
          )}
        </p>
        {!expanded && (
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            {outreachState(draft)}
          </p>
        )}
        {c.seniority === HIRING_MANAGER && c.hiring_for && (
          <p className="mt-0.5 text-[10px] text-violet-600 dark:text-violet-400">
            Hiring for {c.hiring_for}
          </p>
        )}
        {editingWhy ? (
          <div className="mt-1">
            <Textarea
              autoFocus
              rows={4}
              className="w-full text-[11px]"
              value={whyDraft}
              onChange={(e) => setWhyDraft(e.target.value)}
              placeholder="Why is this the person to reach?"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="xs" onClick={() => start(async () => {
                await updateGtmContact(c.id, accountId, {
                  rationale: whyDraft.trim() || null,
                })
                setEditingWhy(false)
                onChanged()
              })}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => {
                setWhyDraft(c.rationale ?? '')
                setEditingWhy(false)
              }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingWhy(true)}
            className="mt-0.5 block w-full rounded-[3px] p-0.5 -m-0.5 text-left text-[10px] italic text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            {c.rationale || (
              <span className="not-italic text-[var(--text-muted)]">
                Add why this person
              </span>
            )}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {c.linkedin_url && (
          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             className="text-[var(--text-muted)] hover:text-[#0A66C2]">
            <PlatformIcon platform="linkedin" className="h-3 w-3" color={false} />
          </a>
        )}
        <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                className="text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity hover:text-brand-600 group-hover:opacity-100">
          Edit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); start(async () => {
            await deleteGtmContact(c.id, accountId); onChanged()
          }) }}
          className="text-[var(--text-muted)] opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
          aria-label="Remove contact"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>

    {/* The outreach fans out under the prospect it belongs to. Clicks inside
        must not collapse the row that contains them. */}
    {expanded && (
      <div onClick={(e) => e.stopPropagation()}>
        <ProspectOutreach
          accountId={accountId}
          contactId={c.id}
          draft={draft}
        />
      </div>
    )}
    </div>
  )
}

function DraftForm({
  accountId, contacts, draft, onDone,
}: {
  accountId: string
  contacts: GtmContact[]
  draft: OutreachDraft | null
  onDone: () => void
}) {
  const [, start] = useTransition()
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [body, setBody] = useState(draft?.body ?? '')
  const [personalization, setPersonalization] = useState(draft?.personalization ?? '')
  const [contactId, setContactId] = useState(draft?.contact_id ?? '')

  return (
    <div className="space-y-2.5 border-b border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label>To</Label>
          <Select className="w-full" value={contactId}
                  onChange={(e) => setContactId(e.target.value)}>
            <option value="">Not specified</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.title ? `, ${c.title}` : ''}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>The hook, what makes this personal</Label>
        <Input value={personalization}
               onChange={(e) => setPersonalization(e.target.value)}
               placeholder="Three BD roles posted in 30 days" />
      </div>
      <div>
        <Label>Body</Label>
        <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)}
                  className="text-[11px] leading-relaxed" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary"
          onClick={() => start(async () => {
            await saveOutreachDraft({
              id: draft?.id, account_id: accountId,
              contact_id: contactId || null, subject, body, personalization,
              status: draft?.status ?? 'draft',
            })
            onDone()
          })}>
          Save draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}
