/**
 * Add a requisition (spec §14).
 *
 * Five short steps, roughly two minutes. Every question asks for a FACT, a
 * date, a number, who was in the room. None of them ask for a judgment: the
 * system decides whether a search is urgent, difficult, or worth deploying
 * against, and explains itself afterwards (§13, §26).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import {
  Button, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import { createRequisition } from '@/lib/server/ops/actions'
import { COMPETITION, SEARCH_TYPE } from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type { Person } from '@/types/ops'

const STEPS = ['Basics', 'Commitment', 'Need', 'Access', 'Fillability'] as const

export function NewRequisition({
  people, me, onDone, onCancel,
}: {
  people: Person[]
  me: Person
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [f, setF] = useState({
    company: '', role_title: '', openings: 1,
    comp_target: '', fee_percent: '20', agreement_signed: false,
    search_type: 'exclusive_contingent', competition: 'alac_only',
    approval: 'approved', target_start: '', consequence: 'operational',
    intake_with: 'hm_final', hm_access: 'direct', process_defined: 'defined',
    interviews_from: '',
    work_arrangement: 'remote', relocation: 'na', clearance: 'none',
    industry_need: 'preferred', must_haves: 'one_three', adjacent_ok: 'yes',
    owner_id: me.id, notes: '',
  })
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }))

  // The fee is derived, shown live, and never typed directly (§15).
  const feeEach = (Number(f.comp_target) || 0) * (Number(f.fee_percent) || 0) / 100
  const feeTotal = feeEach * (Number(f.openings) || 1)

  function next() {
    if (step === 0 && (!f.company.trim() || !f.role_title.trim())) {
      setError('Company and role are needed to score this.'); return
    }
    setError(null)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  function submit() {
    start(async () => {
      const r = await createRequisition({
        ...f,
        openings: Number(f.openings) || 1,
        comp_target: f.comp_target ? Number(f.comp_target) : null,
        fee_percent: f.fee_percent ? Number(f.fee_percent) : null,
        target_start: f.target_start || null,
        interviews_from: f.interviews_from || null,
      })
      if (!r.ok) { setError(r.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <Panel className="mb-4">
      <PanelHeader
        title={`New requisition · ${STEPS[step]}`}
        action={
          <button onClick={onCancel} aria-label="Cancel"
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
            <X className="h-3.5 w-3.5" />
          </button>
        }
      />

      {/* Progress: five short steps, not one long form. */}
      <div className="flex gap-1 px-4 pt-3">
        {STEPS.map((s, i) => (
          <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors',
            i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-hover)]')} />
        ))}
      </div>

      <div className="space-y-4 p-4">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Company</Label>
                <Input autoFocus value={f.company}
                       onChange={(e) => set('company', e.target.value)}
                       placeholder="Company name" />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={f.role_title}
                       onChange={(e) => set('role_title', e.target.value)}
                       placeholder="VP Manufacturing" />
              </div>
              <div>
                <Label>Openings</Label>
                <Input type="number" min={1} value={f.openings}
                       onChange={(e) => set('openings', e.target.value)} />
              </div>
              <div>
                <Label>Target compensation</Label>
                <Input type="number" value={f.comp_target}
                       onChange={(e) => set('comp_target', e.target.value)}
                       placeholder="200000" />
              </div>
              <div>
                <Label>Fee %</Label>
                <Input type="number" value={f.fee_percent}
                       onChange={(e) => set('fee_percent', e.target.value)} />
              </div>
              <div>
                <Label>Owner</Label>
                <Select className="w-full" value={f.owner_id}
                        onChange={(e) => set('owner_id', e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            {feeEach > 0 && (
              <p className="rounded-[3px] bg-[var(--surface-hover)] px-3 py-2 text-[11px]">
                <span className="text-[var(--text-muted)]">Fee per placement</span>{' '}
                <span className="font-semibold tabular">
                  ${Math.round(feeEach).toLocaleString()}
                </span>
                {Number(f.openings) > 1 && (
                  <>
                    {' · '}
                    <span className="text-[var(--text-muted)]">total</span>{' '}
                    <span className="font-semibold tabular">
                      ${Math.round(feeTotal).toLocaleString()}
                    </span>
                  </>
                )}
              </p>
            )}

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={f.agreement_signed}
                     onChange={(e) => set('agreement_signed', e.target.checked)} />
              Agreement is signed
            </label>
            {!f.agreement_signed && (
              <p className="text-[11px] text-amber-500">
                Without a signed agreement this saves as Not Activated and stays
                out of active delivery capacity.
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Search type</Label>
              <Select className="w-full" value={f.search_type}
                      onChange={(e) => set('search_type', e.target.value)}>
                {Object.entries(SEARCH_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Who else is working it?</Label>
              <Select className="w-full" value={f.competition}
                      onChange={(e) => set('competition', e.target.value)}>
                {Object.entries(COMPETITION).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Headcount approval</Label>
              <Select className="w-full" value={f.approval}
                      onChange={(e) => set('approval', e.target.value)}>
                <option value="approved">Approved and funded</option>
                <option value="pending">Approval pending</option>
                <option value="exploratory">Exploratory / not approved</option>
              </Select>
            </div>
            <div>
              <Label>Target start date</Label>
              <Input type="date" value={f.target_start}
                     onChange={(e) => set('target_start', e.target.value)} />
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                Urgency is calculated from this. You are not asked to rate it.
              </p>
            </div>
            <div className="col-span-2">
              <Label>What happens if this stays open?</Label>
              <Select className="w-full" value={f.consequence}
                      onChange={(e) => set('consequence', e.target.value)}>
                <option value="mission">Mission, contract or revenue is affected</option>
                <option value="operational">Operations or the team is materially affected</option>
                <option value="growth">Growth slows</option>
                <option value="normal">Normal vacancy</option>
                <option value="none">No defined consequence</option>
                <option value="unknown">Unknown</option>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Who was at intake?</Label>
              <Select className="w-full" value={f.intake_with}
                      onChange={(e) => set('intake_with', e.target.value)}>
                <option value="hm_final">Hiring manager / decision maker</option>
                <option value="hm_plus_hr">Hiring manager + HR</option>
                <option value="hr_only">HR or TA only</option>
                <option value="none">No formal intake</option>
              </Select>
            </div>
            <div>
              <Label>Can we reach the hiring manager?</Label>
              <Select className="w-full" value={f.hm_access}
                      onChange={(e) => set('hm_access', e.target.value)}>
                <option value="direct">Directly</option>
                <option value="through_hr">Through HR when needed</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </Select>
            </div>
            <div>
              <Label>Interview process</Label>
              <Select className="w-full" value={f.process_defined}
                      onChange={(e) => set('process_defined', e.target.value)}>
                <option value="defined">Defined</option>
                <option value="partial">Partly defined</option>
                <option value="none">Not defined</option>
              </Select>
            </div>
            <div>
              <Label>Interviews can begin</Label>
              <Input type="date" value={f.interviews_from}
                     onChange={(e) => set('interviews_from', e.target.value)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Work arrangement</Label>
              <Select className="w-full" value={f.work_arrangement}
                      onChange={(e) => set('work_arrangement', e.target.value)}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </Select>
            </div>
            <div>
              <Label>Relocation offered</Label>
              <Select className="w-full" value={f.relocation}
                      onChange={(e) => set('relocation', e.target.value)}>
                <option value="na">Not applicable</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </div>
            <div>
              <Label>Clearance</Label>
              <Select className="w-full" value={f.clearance}
                      onChange={(e) => set('clearance', e.target.value)}>
                <option value="none">None</option>
                <option value="able">Able to obtain</option>
                <option value="secret">Active Secret</option>
                <option value="ts">Active TS</option>
                <option value="ts_sci">Active TS/SCI</option>
                <option value="specialized">Other specialized</option>
              </Select>
            </div>
            <div>
              <Label>Exact industry experience</Label>
              <Select className="w-full" value={f.industry_need}
                      onChange={(e) => set('industry_need', e.target.value)}>
                <option value="preferred">Preferred</option>
                <option value="strong">Strong preference</option>
                <option value="required">Required</option>
              </Select>
            </div>
            <div>
              <Label>True non-negotiables</Label>
              <Select className="w-full" value={f.must_haves}
                      onChange={(e) => set('must_haves', e.target.value)}>
                <option value="one_three">1-3</option>
                <option value="four_six">4-6</option>
                <option value="seven_plus">7 or more</option>
              </Select>
            </div>
            <div>
              <Label>Will they consider adjacent talent?</Label>
              <Select className="w-full" value={f.adjacent_ok}
                      onChange={(e) => set('adjacent_ok', e.target.value)}>
                <option value="yes">Yes</option>
                <option value="maybe">Maybe</option>
                <option value="no">No</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={f.notes}
                        onChange={(e) => set('notes', e.target.value)}
                        placeholder="Anything the person running this should know" />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-[3px] bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" variant="primary" onClick={next}>
              Next <ArrowRight className="h-3 w-3" />
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={submit} disabled={pending}>
              {pending ? 'Scoring…' : 'Add and score'}
            </Button>
          )}
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </div>
    </Panel>
  )
}
