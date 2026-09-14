/**
 * Recurrence, in words and in dates.
 *
 * This mirrors the SQL engine in migration 072 so the form can show what a
 * schedule means before it is saved. Two runtimes computing dates is a real
 * risk, they can drift, so the test suite asserts that this file and the
 * database agree on the same rule set. Change one, change both.
 *
 * Everything here is pure: no clock reads except the `from` a caller passes,
 * so a preview renders identically on the server and the client.
 */

export type RuleKind = 'weekday' | 'day_of_month' | 'last_day' | 'nth_weekday'

export type Frequency =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'

export interface Rule {
  kind: RuleKind
  /** 0=Sunday..6=Saturday. */
  day_of_week?: number | null
  day_of_month?: number | null
  /** 1-4 from the start of the month; -1 means the last such weekday. */
  week_of_month?: number | null
}

export const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const WEEKS = [
  { value: 1, label: 'first' },
  { value: 2, label: 'second' },
  { value: 3, label: 'third' },
  { value: 4, label: 'fourth' },
  { value: -1, label: 'last' },
] as const

export const FREQUENCIES: { value: Frequency | 'every_weekday'; label: string }[] = [
  { value: 'every_weekday', label: 'Every weekday' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
]

// --- Date helpers ------------------------------------------------------------
//
// Dates are handled as plain YYYY-MM-DD strings and UTC-noon Date objects.
// Constructing at noon rather than midnight means a timezone offset can never
// push a date onto the previous day, which is the classic off-by-one in
// schedule code (spec section 16).

export function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x
}
const addMonths = (d: Date, n: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))
  return x
}
const monthStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12))
/** Day 0 of the next month is the last day of this one, leap years included. */
const daysInMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate()

/**
 * The nth occurrence of a weekday in a month; -1 means the last.
 *
 * A month always has four of any weekday and sometimes five, so 1-4 always
 * resolve. Asking for a fifth that does not exist falls back to the fourth
 * rather than spilling into the next month.
 */
export function nthWeekday(month: Date, dow: number, nth: number): Date {
  const first = monthStart(month)
  const last = new Date(Date.UTC(
    month.getUTCFullYear(), month.getUTCMonth(), daysInMonth(month), 12))

  if (nth === -1) {
    return addDays(last, -((last.getUTCDay() - dow + 7) % 7))
  }
  let candidate = addDays(first, (dow - first.getUTCDay() + 7) % 7)
  candidate = addDays(candidate, (nth - 1) * 7)
  if (candidate > last) candidate = addDays(candidate, -7)
  return candidate
}

/** The next date on or after `from` that satisfies one rule. */
export function ruleNextOnOrAfter(rule: Rule, from: Date): Date {
  if (rule.kind === 'weekday') {
    const dow = rule.day_of_week ?? 0
    return addDays(from, (dow - from.getUTCDay() + 7) % 7)
  }

  let month = monthStart(from)
  for (let i = 0; i < 2; i++) {
    let candidate: Date
    if (rule.kind === 'day_of_month') {
      const day = Math.min(rule.day_of_month ?? 1, daysInMonth(month))
      candidate = new Date(Date.UTC(
        month.getUTCFullYear(), month.getUTCMonth(), day, 12))
    } else if (rule.kind === 'last_day') {
      candidate = new Date(Date.UTC(
        month.getUTCFullYear(), month.getUTCMonth(), daysInMonth(month), 12))
    } else {
      candidate = nthWeekday(month, rule.day_of_week ?? 0, rule.week_of_month ?? 1)
    }
    if (candidate >= from) return candidate
    month = addMonths(month, 1)
  }
  return from
}

/** Move one rule past a date it has already produced. */
export function ruleAdvance(
  rule: Rule, frequency: Frequency, intervalN: number, after: Date,
): Date {
  let probe: Date
  switch (frequency) {
    case 'daily':     probe = addDays(after, 1); break
    case 'weekly':    probe = addDays(after, 7 * intervalN); break
    case 'biweekly':  probe = addDays(after, 14); break
    case 'monthly':   probe = addMonths(monthStart(after), intervalN); break
    case 'quarterly': probe = addMonths(monthStart(after), 3); break
    case 'custom':
      probe = rule.kind === 'weekday'
        ? addDays(after, 7 * intervalN)
        : addMonths(monthStart(after), intervalN)
      break
    default: probe = addDays(after, 7)
  }
  return ruleNextOnOrAfter(rule, probe)
}

/**
 * The next `count` dates this schedule produces, in order.
 *
 * Rules are merged and de-duplicated, because "the 1st and the first Monday"
 * can name the same day and a person should not see it listed twice.
 */
export function nextOccurrences(
  rules: Rule[],
  opts: {
    frequency: Frequency
    intervalN?: number
    from?: Date
    count?: number
    endsOn?: string | null
    endsAfter?: number | null
  },
): string[] {
  const { frequency, intervalN = 1, from = new Date(), count = 3 } = opts
  if (!rules.length) return []

  const floor = fromISO(toISO(from))
  const cursors = rules.map((r) => ({ rule: r, at: ruleNextOnOrAfter(r, floor) }))
  const endsOn = opts.endsOn ? fromISO(opts.endsOn) : null
  const limit = opts.endsAfter ?? Infinity

  const out: string[] = []
  // Bounded: a schedule that somehow stops advancing must not spin here.
  for (let guard = 0; out.length < count && guard < 500; guard++) {
    cursors.sort((a, b) => +a.at - +b.at)
    const next = cursors[0]
    if (endsOn && next.at > endsOn) break
    if (out.length >= limit) break

    const iso = toISO(next.at)
    if (!out.includes(iso)) out.push(iso)
    next.at = ruleAdvance(next.rule, frequency, intervalN, next.at)
  }
  return out
}

// --- Words -------------------------------------------------------------------

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** One rule, as a person would say it. */
export function describeRule(rule: Rule): string {
  switch (rule.kind) {
    case 'weekday':
      return DAYS[rule.day_of_week ?? 0]
    case 'day_of_month':
      return `the ${ordinal(rule.day_of_month ?? 1)}`
    case 'last_day':
      return 'the last day'
    case 'nth_weekday': {
      const week = WEEKS.find((w) => w.value === rule.week_of_month)?.label ?? 'first'
      return `the ${week} ${DAYS[rule.day_of_week ?? 0]}`
    }
  }
}

/** Join a list the way English does: "a, b and c". */
function conjoin(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The whole schedule as a sentence.
 *
 * This is what the person checks before saving, so it has to read naturally
 * rather than echo the field names back at them.
 */
export function describeSchedule(
  rules: Rule[],
  frequency: Frequency,
  intervalN = 1,
): string {
  if (!rules.length) return 'No schedule set'

  const weekdayRules = rules.filter((r) => r.kind === 'weekday')

  // Every weekday, said plainly rather than as five separate days.
  if (weekdayRules.length === 5
      && [1, 2, 3, 4, 5].every((d) => weekdayRules.some((r) => r.day_of_week === d))
      && rules.length === 5) {
    return 'Every weekday'
  }

  const parts = conjoin(rules.map(describeRule))

  switch (frequency) {
    case 'daily':
      return 'Every day'
    case 'weekly':
      return `Every ${parts}`
    case 'biweekly':
      return `Every 2 weeks on ${parts}`
    case 'monthly':
      return `${cap(parts)} of every month`
    case 'quarterly':
      return `${cap(parts)} of every quarter`
    case 'custom': {
      const unit = rules[0]?.kind === 'weekday' ? 'weeks' : 'months'
      const every = intervalN === 1 ? `Every ${unit.slice(0, -1)}` : `Every ${intervalN} ${unit}`
      return `${every} on ${parts}`
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
