'use client'

/**
 * One requisition, open and editable.
 *
 * A search changes while you run it, the client adds agencies, the salary
 * moves, the urgency shifts. If those cannot be edited, the record stops
 * describing the search and people keep the real version in their head, or
 * delete and recreate it and lose the age and the history with it.
 *
 * So every field that could be set at creation can be changed here, and the
 * grade rescores itself from whatever the new values are.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import {
  Button, Input, Label, Panel, Select, Textarea,
} from '@/components/ops/ui/primitives'
import { updateRequisition } from '@/lib/server/ops/actions'
import { REQ_GRADE } from '@/lib/ops/constants'
import { cn, formatDate } from '@/lib/ops/utils'
import type { Person, RequisitionRow } from '@/types/ops'

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`

export function RequisitionDrawer({
  req, people, onClose,
}: {
  req: RequisitionRow
  people: Person[]
  onClose: () => void
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Edited as a draft: opening a requisition and closing it must not change
  // anything, so nothing is written until Save.
  const [f, setF] = useState({
    company: req.company ?? '',
    role_title: req.role_title ?? '',
    openings: String(req.openings ?? 1),
    comp_min: req.comp_min == null ? '' : String(req.comp_min),
    comp_target: req.comp_target == null ? '' : String(req.comp_target),
    comp_max: req.comp_max == null ? '' : String(req.comp_max),
    fee_percent: req.fee_percent == null ? '' : String(req.fee_percent),
    agreement_signed: Boolean(req.agreement_signed),
    search_type: req.search_type ?? 'exclusive_contingent',
    competition: req.competition ?? 'alac_only',
    approval: req.approval ?? 'approved',
    consequence: req.consequence ?? 'operational',
    intake_with: req.intake_with ?? 'hm_final',
    hm_access: req.hm_access ?? 'direct',
    process_defined: req.process_defined ?? 'defined',
    work_arrangement: req.work_arrangement ?? 'remote',
    relocation: req.relocation ?? 'na',
    clearance: req.clearance ?? 'none',
    industry_need: req.industry_need ?? 'preferred',
    must_haves: req.must_haves ?? 'one_three',
    adjacent_ok: req.adjacent_ok ?? 'yes',
    search_difficulty: req.search_difficulty ?? 'medium',
    sprint_target_override: req.sprint_target_override == null
      ? '' : String(req.sprint_target_override),
    status: req.status ?? 'active',
    owner_id: req.owner_id ?? '',
    target_start: req.target_start ?? '',
    notes: req.notes ?? '',
  })
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }))

  const save = () => start(async () => {
    setError(null)
    if (!f.company.trim() || !f.role_title.trim()) {
      setError('A requisition needs a company and a role.'); return
    }
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const r = await updateRequisition(req.id, {
      company: f.company.trim(),
      role_title: f.role_title.trim(),
      openings: Math.max(1, Number(f.openings) || 1),
      comp_min: num(f.comp_min),
      comp_target: num(f.comp_target),
      comp_max: num(f.comp_max),
      fee_percent: num(f.fee_percent),
      agreement_signed: f.agreement_signed,
      search_type: f.search_type,
      competition: f.competition,
      approval: f.approval,
      consequence: f.consequence,
      intake_with: f.intake_with,
      hm_access: f.hm_access,
      process_defined: f.process_defined,
      work_arrangement: f.work_arrangement,
      relocation: f.relocation,
      clearance: f.clearance,
      industry_need: f.industry_need,
      must_haves: f.must_haves,
      adjacent_ok: f.adjacent_ok,
      search_difficulty: f.search_difficulty,
      sprint_target_override: num(f.sprint_target_override),
      status: f.status,
      owner_id: f.owner_id || null,
      target_start: f.target_start || null,
      notes: f.notes.trim() || null,
    })
    if (!r.ok) { setError(r.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  })

  const grade = REQ_GRADE[req.live_grade ?? 'C']

  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
         onClick={onClose}>
      <div
        className="anim-pop max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-[var(--alac-radius)] border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{req.role_title}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {req.company}
              {' · '}
              <span className={cn('rounded-[3px] px-1', grade.chip)}>{grade.label}</span>
              {' · opened '}{formatDate(req.date_received)}
              {req.age_days != null && ` (${req.age_days}d)`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="shrink-0 rounded-[3px] p-1 hover:bg-[var(--surface-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error && (
            <p role="alert"
               className="rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </p>
          )}

          <Section title="Role">
            <Field label="Role"><Input className="w-full" value={f.role_title}
              onChange={(e) => set('role_title', e.target.value)} /></Field>
            <Field label="Company"><Input className="w-full" value={f.company}
              onChange={(e) => set('company', e.target.value)} /></Field>
            <Two>
              <Field label="Openings"><Input type="number" min={1} className="w-full"
                value={f.openings} onChange={(e) => set('openings', e.target.value)} /></Field>
              <Field label="Owner">
                <Select className="w-full" value={f.owner_id}
                        onChange={(e) => set('owner_id', e.target.value)}>
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            </Two>
            <Two>
              <Field label="Status">
                <Select className="w-full" value={f.status}
                        onChange={(e) => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="on_hold">On hold</option>
                  <option value="not_activated">Not activated</option>
                  <option value="filled">Filled</option>
                  <option value="closed_lost">Closed</option>
                  <option value="withdrawn">Withdrawn</option>
                </Select>
              </Field>
              <Field label="Target start"><Input type="date" className="w-full"
                value={f.target_start} onChange={(e) => set('target_start', e.target.value)} /></Field>
            </Two>
          </Section>

          <Section title="Search">
            <Two>
              <Field label="Difficulty">
                <Select className="w-full" value={f.search_difficulty}
                        onChange={(e) => set('search_difficulty', e.target.value)}>
                  <option value="easy">Easy, target 5</option>
                  <option value="medium">Medium, target 4</option>
                  <option value="hard">Hard, target 3</option>
                </Select>
              </Field>
              <Field label="Sprint target"
                     hint="Leave blank to use the difficulty default">
                <Input type="number" min={1} className="w-full"
                       placeholder="default"
                       value={f.sprint_target_override}
                       onChange={(e) => set('sprint_target_override', e.target.value)} />
              </Field>
            </Two>
            <Two>
              <Field label="Engagement">
                <Select className="w-full" value={f.search_type}
                        onChange={(e) => set('search_type', e.target.value)}>
                  <option value="retained">Retained</option>
                  <option value="engaged">Engaged</option>
                  <option value="exclusive_contingent">Exclusive contingency</option>
                  <option value="contingent">Contingency</option>
                </Select>
              </Field>
              <Field label="Competition">
                <Select className="w-full" value={f.competition}
                        onChange={(e) => set('competition', e.target.value)}>
                  <option value="alac_only">ALAC only</option>
                  <option value="internal_plus_alac">Internal + ALAC</option>
                  <option value="one_two_agencies">One or two agencies</option>
                  <option value="three_plus_agencies">Three or more agencies</option>
                  <option value="unknown">Unknown</option>
                </Select>
              </Field>
            </Two>
            <Two>
              <Field label="Work"><Select className="w-full" value={f.work_arrangement}
                onChange={(e) => set('work_arrangement', e.target.value)}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </Select></Field>
              <Field label="Clearance"><Select className="w-full" value={f.clearance}
                onChange={(e) => set('clearance', e.target.value)}>
                <option value="none">None</option>
                <option value="able">Able to obtain</option>
                <option value="secret">Secret</option>
                <option value="ts">TS</option>
                <option value="ts_sci">TS/SCI</option>
                <option value="specialized">Specialized</option>
              </Select></Field>
            </Two>
          </Section>

          <Section title="Commercials">
            <Two>
              <Field label="Target comp"><Input type="number" className="w-full"
                value={f.comp_target} onChange={(e) => set('comp_target', e.target.value)} /></Field>
              <Field label="Fee %"><Input type="number" className="w-full"
                value={f.fee_percent} onChange={(e) => set('fee_percent', e.target.value)} /></Field>
            </Two>
            <Two>
              <Field label="Comp min"><Input type="number" className="w-full"
                value={f.comp_min} onChange={(e) => set('comp_min', e.target.value)} /></Field>
              <Field label="Comp max"><Input type="number" className="w-full"
                value={f.comp_max} onChange={(e) => set('comp_max', e.target.value)} /></Field>
            </Two>
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={f.agreement_signed}
                     onChange={(e) => set('agreement_signed', e.target.checked)} />
              Agreement signed
            </label>
            <p className="text-[10px] text-[var(--text-muted)]">
              Fee is derived, never typed:{' '}
              {money((Number(f.comp_target) || 0) * (Number(f.fee_percent) || 0) / 100
                     * (Number(f.openings) || 1))} across {f.openings} opening
              {Number(f.openings) === 1 ? '' : 's'}.
            </p>
          </Section>

          <Section title="Client">
            <Two>
              <Field label="Approval"><Select className="w-full" value={f.approval}
                onChange={(e) => set('approval', e.target.value)}>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="exploratory">Exploratory</option>
              </Select></Field>
              <Field label="HM access"><Select className="w-full" value={f.hm_access}
                onChange={(e) => set('hm_access', e.target.value)}>
                <option value="direct">Direct</option>
                <option value="through_hr">Through HR</option>
                <option value="no">No access</option>
                <option value="unknown">Unknown</option>
              </Select></Field>
            </Two>
            <Field label="Notes"><Textarea rows={4} className="w-full" value={f.notes}
              onChange={(e) => set('notes', e.target.value)} /></Field>
          </Section>

          <div className="sticky bottom-0 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-raised)] py-3">
            <Button size="sm" onClick={save}>Save changes</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            {saved && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                Saved, grade rescored
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel>
      <div className="border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {title}
        </span>
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </Panel>
  )
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
