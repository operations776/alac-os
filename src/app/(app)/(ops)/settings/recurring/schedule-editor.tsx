/**
 * Saying when work repeats.
 *
 * The hard part of a scheduler is not the dates, it is that people describe
 * time in incompatible ways: "every Monday and Thursday", "the 15th", "the
 * last Friday", "the 5th and the 20th". Each is a different shape, and a form
 * that shows all of them at once is unreadable.
 *
 * So only the fields that apply to the chosen frequency are on screen, and
 * whatever is chosen is read straight back as a sentence with the next three
 * dates under it. Nobody should have to save a schedule to find out what it
 * meant.
 */
'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Input, Label, Select } from '@/components/ops/ui/primitives'
import {
  DAYS, DAYS_SHORT, WEEKS,
  describeRule, describeSchedule, fromISO, nextOccurrences,
  type Frequency, type Rule,
} from '@/lib/ops/recurrence'
import { cn, formatDate } from '@/lib/ops/utils'

/** What the frequency picker offers. "Every weekday" is five weekly rules. */
export type FreqChoice =
  | 'every_weekday' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'

export const FREQ_CHOICES: { value: FreqChoice; label: string }[] = [
  { value: 'every_weekday', label: 'Every weekday' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
]

/** The frequency actually stored, once "every weekday" is unfolded. */
export const storedFrequency = (f: FreqChoice): Frequency =>
  f === 'every_weekday' ? 'weekly' : f

export interface ScheduleState {
  freq: FreqChoice
  /** Weekly / 2-week / custom-weekly: the days ticked. */
  weekdays: number[]
  /** Monthly and quarterly: one or more date or weekday-position rules. */
  monthRules: Rule[]
  /** Custom: repeat every N units. */
  intervalN: number
  customUnit: 'weeks' | 'months'
  startsOn: string
  endsMode: 'never' | 'on' | 'after'
  endsOn: string
  endsAfter: number
}

export const emptySchedule = (): ScheduleState => ({
  freq: 'weekly',
  weekdays: [new Date().getDay()],
  monthRules: [],
  intervalN: 3,
  customUnit: 'weeks',
  startsOn: new Date().toISOString().slice(0, 10),
  endsMode: 'never',
  endsOn: '',
  endsAfter: 12,
})

/**
 * Turn the form's state into the rules the database stores.
 *
 * One place does this translation so the preview below and the row that gets
 * saved can never disagree about what was chosen.
 */
export function rulesFor(s: ScheduleState): Rule[] {
  switch (s.freq) {
    case 'every_weekday':
      return [1, 2, 3, 4, 5].map((d) => ({ kind: 'weekday', day_of_week: d }))
    case 'weekly':
    case 'biweekly':
      return s.weekdays.map((d) => ({ kind: 'weekday', day_of_week: d }))
    case 'monthly':
    case 'quarterly':
      return s.monthRules
    case 'custom':
      return s.customUnit === 'weeks'
        ? s.weekdays.map((d) => ({ kind: 'weekday', day_of_week: d }))
        : s.monthRules
  }
}

export function ScheduleEditor({
  value, onChange,
}: {
  value: ScheduleState
  onChange: (s: ScheduleState) => void
}) {
  const set = (patch: Partial<ScheduleState>) => onChange({ ...value, ...patch })

  const usesWeekdays = value.freq === 'weekly' || value.freq === 'biweekly'
    || (value.freq === 'custom' && value.customUnit === 'weeks')
  const usesMonthRules = value.freq === 'monthly' || value.freq === 'quarterly'
    || (value.freq === 'custom' && value.customUnit === 'months')

  const rules = useMemo(() => rulesFor(value), [value])

  // The preview. Computed from the same rules that will be saved, so what a
  // person reads here is what the scheduler will do.
  const preview = useMemo(() => {
    if (!rules.length) return { text: 'Pick at least one day', dates: [] as string[] }
    const freq = storedFrequency(value.freq)
    return {
      text: describeSchedule(rules, freq, value.intervalN),
      dates: nextOccurrences(rules, {
        frequency: freq,
        intervalN: value.freq === 'custom' ? value.intervalN : 1,
        from: value.startsOn ? fromISO(value.startsOn) : new Date(),
        count: 3,
        endsOn: value.endsMode === 'on' ? value.endsOn || null : null,
        endsAfter: value.endsMode === 'after' ? value.endsAfter : null,
      }),
    }
  }, [rules, value])

  const toggleDay = (d: number) => set({
    weekdays: value.weekdays.includes(d)
      ? value.weekdays.filter((x) => x !== d)
      : [...value.weekdays, d].sort(),
  })

  return (
    <div className="space-y-3">
      <div>
        <Label>How often</Label>
        <Select
          className="w-full" value={value.freq}
          onChange={(e) => set({ freq: e.target.value as FreqChoice })}
        >
          {FREQ_CHOICES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
      </div>

      {/* Custom needs its interval before anything else makes sense. */}
      {value.freq === 'custom' && (
        <div className="flex items-end gap-2">
          <div>
            <Label>Repeat every</Label>
            <Input
              type="number" min={1} max={52} className="w-20"
              value={value.intervalN}
              onChange={(e) => set({ intervalN: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <Select
            className="mb-0 h-8 w-28" value={value.customUnit}
            onChange={(e) => set({
              customUnit: e.target.value as 'weeks' | 'months',
            })}
          >
            <option value="weeks">weeks</option>
            <option value="months">months</option>
          </Select>
        </div>
      )}

      {usesWeekdays && (
        <div>
          <Label>On these days</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS.map((d, i) => {
              const on = value.weekdays.includes(i)
              return (
                <button
                  key={d} type="button" onClick={() => toggleDay(i)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on
                      ? 'border-transparent bg-[var(--text-primary)] text-[var(--surface)]'
                      : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
                  )}
                >
                  {DAYS_SHORT[i]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {usesMonthRules && (
        <MonthRules
          rules={value.monthRules}
          onChange={(monthRules) => set({ monthRules })}
          unit={value.freq === 'quarterly' ? 'quarter' : 'month'}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Starts</Label>
          <Input
            type="date" value={value.startsOn}
            onChange={(e) => set({ startsOn: e.target.value })}
          />
        </div>
        <div>
          <Label>Ends</Label>
          <div className="flex gap-1.5">
            <Select
              className="h-8 flex-1" value={value.endsMode}
              onChange={(e) => set({
                endsMode: e.target.value as ScheduleState['endsMode'],
              })}
            >
              <option value="never">Never</option>
              <option value="on">On a date</option>
              <option value="after">After…</option>
            </Select>
            {value.endsMode === 'on' && (
              <Input
                type="date" className="flex-1" value={value.endsOn}
                onChange={(e) => set({ endsOn: e.target.value })}
              />
            )}
            {value.endsMode === 'after' && (
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={1} className="w-16"
                  value={value.endsAfter}
                  onChange={(e) => set({
                    endsAfter: Math.max(1, Number(e.target.value) || 1),
                  })}
                />
                <span className="text-xs text-[var(--text-muted)]">times</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* What the system understood. The dates are the real check: a sentence
          can read plausibly and still mean the wrong day. */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-[11px] font-semibold">{preview.text}</p>
        {preview.dates.length > 0 && (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Next: {preview.dates.map((d) => formatDate(d)).join(' · ')}
          </p>
        )}
        {rules.length > 0 && preview.dates.length === 0 && (
          <p className="mt-1 text-[10px] text-amber-600">
            Nothing is scheduled, check the end condition.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The month rules: a date, or a weekday position, as many as needed.
 *
 * "The 5th and the 20th" is one recurring job, not two, and a person should
 * be able to say that here rather than creating the task twice.
 */
function MonthRules({
  rules, onChange, unit,
}: {
  rules: Rule[]
  onChange: (r: Rule[]) => void
  unit: 'month' | 'quarter'
}) {
  const add = (r: Rule) => onChange([...rules, r])
  const remove = (i: number) => onChange(rules.filter((_, x) => x !== i))

  return (
    <div>
      <Label>When each {unit}</Label>

      {rules.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {rules.map((r, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] py-1 pl-2.5 pr-1 text-xs"
            >
              {describeRule(r)}
              <button
                type="button" onClick={() => remove(i)}
                aria-label={`Remove ${describeRule(r)}`}
                className="rounded-full p-0.5 text-[var(--text-muted)] hover:text-rose-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <RuleBuilder onAdd={add} />
    </div>
  )
}

/** The two ways to name a day in a month, side by side. */
function RuleBuilder({ onAdd }: { onAdd: (r: Rule) => void }) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border)] p-2.5">
      <ByDate onAdd={onAdd} />
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <ByWeekday onAdd={onAdd} />
    </div>
  )
}

function ByDate({ onAdd }: { onAdd: (r: Rule) => void }) {
  // Local, because these selectors are a staging area: nothing is part of the
  // schedule until Add is pressed.
  const [day, setDay] = useState(1)
  const [last, setLast] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--text-secondary)]">On day</span>
      <Select
        className="h-7 w-20 text-xs" value={last ? 'last' : day}
        onChange={(e) => {
          if (e.target.value === 'last') { setLast(true) }
          else { setLast(false); setDay(Number(e.target.value)) }
        }}
      >
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
        <option value="last">Last</option>
      </Select>
      <Button
        size="xs" variant="secondary"
        onClick={() => onAdd(last
          ? { kind: 'last_day' }
          : { kind: 'day_of_month', day_of_month: day })}
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  )
}

function ByWeekday({ onAdd }: { onAdd: (r: Rule) => void }) {
  const [week, setWeek] = useState(1)
  const [dow, setDow] = useState(1)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--text-secondary)]">On the</span>
      <Select
        className="h-7 w-24 text-xs" value={week}
        onChange={(e) => setWeek(Number(e.target.value))}
      >
        {WEEKS.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
      </Select>
      <Select
        className="h-7 w-28 text-xs" value={dow}
        onChange={(e) => setDow(Number(e.target.value))}
      >
        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </Select>
      <Button
        size="xs" variant="secondary"
        onClick={() => onAdd({
          kind: 'nth_weekday', day_of_week: dow, week_of_month: week,
        })}
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  )
}
