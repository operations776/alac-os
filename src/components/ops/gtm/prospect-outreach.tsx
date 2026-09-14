'use client'

/**
 * A prospect's outreach, inside the prospect.
 *
 * Outreach used to sit in its own section below the decision makers, which
 * meant three people shared one list of copy and whoever opened it had to
 * work out who each draft was for. A cold email is written to somebody, so
 * it belongs on that person's row.
 *
 * The shape of the work: the VA drafts three options, the reviewer reads
 * them, takes the strongest parts and writes the final. So the three options
 * are read-mostly and the finalized copy is where the editing happens, and
 * "use as final" copies rather than links, because refining the final must
 * never rewrite the option it came from.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@/components/ops/ui/primitives'
import {
  draftForContact, saveFinalCopy, saveVariation, setResearchUrl, copyVariationToFinal,
} from '@/lib/server/ops/actions'
import { cn } from '@/lib/ops/utils'

export interface Variation {
  id: string
  slot: number
  subject: string | null
  body: string | null
}

export interface ProspectDraft {
  id: string
  research_url?: string | null
  final_subject?: string | null
  final_body?: string | null
  variations?: Variation[]
}

/** What the collapsed row says about progress, without showing the copy. */
export function outreachState(draft?: ProspectDraft | null): string {
  if (!draft) return 'Research needed'
  if (draft.final_body?.trim()) return 'Final email ready'
  const written = (draft.variations ?? []).filter((v) => v.body?.trim()).length
  if (written >= 3) return '3 email options ready'
  if (written > 0) return `${written} of 3 drafted`
  if (draft.research_url) return 'Drafting'
  return 'Research needed'
}

export function ProspectOutreach({
  accountId, contactId, draft,
}: {
  accountId: string
  contactId: string
  draft: ProspectDraft | null
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [slot, setSlot] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const variations = draft?.variations ?? []
  const current = variations.find((v) => v.slot === slot)

  // Edited locally, saved on purpose: a half-typed sentence must not become
  // the copy somebody sends.
  const [opt, setOpt] = useState({ subject: '', body: '' })
  const [optSlot, setOptSlot] = useState(0)
  if (optSlot !== slot) {
    setOptSlot(slot)
    setOpt({ subject: current?.subject ?? '', body: current?.body ?? '' })
  }

  const [fin, setFin] = useState({
    subject: draft?.final_subject ?? '',
    body: draft?.final_body ?? '',
  })
  const [finFor, setFinFor] = useState(draft?.id ?? '')
  if (finFor !== (draft?.id ?? '')) {
    setFinFor(draft?.id ?? '')
    setFin({ subject: draft?.final_subject ?? '', body: draft?.final_body ?? '' })
  }

  const [research, setResearch] = useState(draft?.research_url ?? '')
  const [editingResearch, setEditingResearch] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null)
    const r = await fn()
    if (!r.ok) { setError(r.error ?? 'That did not save'); return }
    router.refresh()
  })

  /** Everything needs a draft to hang off; make one on first use. */
  const withDraft = async (fn: (id: string) => Promise<{ ok: boolean; error?: string }>) => {
    if (draft?.id) return fn(draft.id)
    const made = await draftForContact(accountId, contactId)
    if (!made.ok || !made.data) return made
    return fn(made.data.id)
  }

  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1800)
  }

  /** Put the research link where the cursor is, not at the end. */
  const insertResearch = (field: 'opt' | 'fin') => {
    const el = document.getElementById(
      field === 'fin' ? `fin-body-${contactId}` : `opt-body-${contactId}`,
    ) as HTMLTextAreaElement | null
    const url = research.trim()
    if (!url) { setError('Save a research link first.'); return }
    if (!el) return
    const at = el.selectionStart ?? el.value.length
    const next = el.value.slice(0, at) + url + el.value.slice(el.selectionEnd ?? at)
    if (field === 'fin') setFin((f) => ({ ...f, body: next }))
    else setOpt((o) => ({ ...o, body: next }))
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      {error && (
        <p role="alert"
           className="rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Research, the source the personalisation comes from. */}
      <section>
        <Label>Research link</Label>
        {editingResearch || !research ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              className="min-w-0 flex-1"
              value={research}
              placeholder="https://…"
              onChange={(e) => setResearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  run(() => withDraft((id) => setResearchUrl(id, research)))
                  setEditingResearch(false)
                }
              }}
            />
            <Button size="xs" onClick={() => {
              run(() => withDraft((id) => setResearchUrl(id, research)))
              setEditingResearch(false)
            }}>Save link</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="truncate text-[var(--text-secondary)]">{research}</span>
            <a href={research} target="_blank" rel="noopener noreferrer"
               className="inline-flex shrink-0 items-center gap-0.5 text-brand-600 hover:underline">
              Open <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <button onClick={() => copy('research', research)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-brand-600">
              {copied === 'research' ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setEditingResearch(true)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-brand-600">
              Edit
            </button>
          </div>
        )}
      </section>

      {/* The three drafted options, one at a time. */}
      <section>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Label className="mr-1">Initial cold email</Label>
          {[1, 2, 3].map((n) => {
            const has = variations.find((v) => v.slot === n)?.body?.trim()
            return (
              <button
                key={n}
                onClick={() => setSlot(n)}
                className={cn(
                  'rounded-[3px] px-2 py-0.5 text-[11px] transition-colors',
                  n === slot
                    ? 'bg-brand-600 font-medium text-white'
                    : 'border border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
                  !has && n !== slot && 'text-[var(--text-muted)]',
                )}
              >
                Email {n}{!has && ' ·'}
              </button>
            )
          })}
        </div>

        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          <div>
            <Label htmlFor={`opt-subject-${contactId}`}>Subject</Label>
            <Input
              id={`opt-subject-${contactId}`}
              className="w-full"
              value={opt.subject}
              onChange={(e) => setOpt({ ...opt, subject: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`opt-body-${contactId}`}>Email</Label>
            <Textarea
              id={`opt-body-${contactId}`}
              rows={7}
              className="w-full"
              value={opt.body}
              placeholder={`Email ${slot} has not been written yet.`}
              onChange={(e) => setOpt({ ...opt, body: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => run(() => withDraft((id) =>
              saveVariation({
                draftId: id, accountId, slot,
                subject: opt.subject, body: opt.body,
              })))}>
              Save email {slot}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => insertResearch('opt')}>
              <Link2 className="h-3 w-3" /> Insert research link
            </Button>
            {(current || opt.body.trim()) && (
              <Button size="xs" variant="ghost" onClick={() => {
                // Overwriting work somebody typed should be their decision.
                if (fin.body.trim()
                    && !confirm('Replace the finalized email with this option?')) return
                run(async () => {
                  // Save first, so the option exists to point at, then copy
                  // the text, the two must not drift apart.
                  const r = await withDraft(async (id) => {
                    const saved = await saveVariation({
                      draftId: id, accountId, slot,
                      subject: opt.subject, body: opt.body,
                    })
                    if (!saved.ok) return saved
                    return saveFinalCopy(id, {
                      final_subject: opt.subject.trim() || null,
                      final_body: opt.body.trim() || null,
                    })
                  })
                  if (r.ok) setFin({ subject: opt.subject, body: opt.body })
                  return r
                })
              }}>
                Use as final
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* The final, built from the strongest parts. */}
      <section>
        <Label>Finalized email</Label>
        <div className="space-y-2 rounded-md border border-brand-200 bg-[var(--surface)] p-3 dark:border-brand-900">
          <div>
            <Label htmlFor={`fin-subject-${contactId}`}>Final subject</Label>
            <Input
              id={`fin-subject-${contactId}`}
              className="w-full"
              value={fin.subject}
              onChange={(e) => setFin({ ...fin, subject: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`fin-body-${contactId}`}>Final email</Label>
            <Textarea
              id={`fin-body-${contactId}`}
              rows={9}
              className="w-full"
              value={fin.body}
              placeholder="Take the strongest parts of the three options and write the final here."
              onChange={(e) => setFin({ ...fin, body: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="xs" onClick={() => run(() => withDraft((id) =>
              saveFinalCopy(id, {
                final_subject: fin.subject.trim() || null,
                final_body: fin.body.trim() || null,
              })))}>
              Save final email
            </Button>
            <Button size="xs" variant="ghost" onClick={() => insertResearch('fin')}>
              <Link2 className="h-3 w-3" /> Insert research link
            </Button>
            <span className="mx-1 h-4 w-px bg-[var(--border)]" />
            <Button size="xs" variant="ghost"
                    onClick={() => copy('subject', fin.subject)}>
              {copied === 'subject' ? <><Check className="h-3 w-3" /> Copied</>
                                    : <><Copy className="h-3 w-3" /> Subject</>}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => copy('body', fin.body)}>
              {copied === 'body' ? <><Check className="h-3 w-3" /> Copied</>
                                 : <><Copy className="h-3 w-3" /> Email</>}
            </Button>
            <Button size="xs" variant="ghost"
                    onClick={() => copy('full', `Subject: ${fin.subject}\n\n${fin.body}`)}>
              {copied === 'full' ? <><Check className="h-3 w-3" /> Copied</>
                                 : <><Copy className="h-3 w-3" /> Full email</>}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
