import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Dates -------------------------------------------------------------------
// Due dates are calendar dates, not instants: a task due "today" is due today
// in your own day, so every comparison happens at local midnight.

/** Local midnight for a YYYY-MM-DD string, a timestamp, or a Date. */
export function toLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** YYYY-MM-DD in local time. Never toISOString(), which shifts the day. */
export function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + days)
  return n
}

/**
 * Value for an <input type="date">. Postgres dates arrive as full ISO
 * timestamps, and the input renders blank for anything but YYYY-MM-DD.
 */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return toDateString(value)
  return value.slice(0, 10)
}

/** Whole days from today. Negative means overdue. */
export function daysAway(value: string | Date | null | undefined): number | null {
  const d = toLocalDate(value)
  if (!d) return null
  return Math.round((d.getTime() - today().getTime()) / 86_400_000)
}

export function isOverdue(due: string | null | undefined, done = false): boolean {
  if (done || !due) return false
  const diff = daysAway(due)
  return diff !== null && diff < 0
}

export function isToday(due: string | null | undefined): boolean {
  return daysAway(due) === 0
}

/** "Today", "Tomorrow", "3d late", "Mar 14". */
export function formatDue(value: string | null | undefined): string {
  const diff = daysAway(value)
  if (diff === null) return '-'
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d late`
  if (diff <= 7) return `${diff}d`

  const d = toLocalDate(value)!
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** '14:30:00' or '14:30' to '2:30 PM'. Empty for no time. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toLocalDate(value)
  if (!d) return '-'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const d = toLocalDate(value)
  if (!d) return '-'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "just now", "4h ago", "3d ago". */
export function relative(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(new Date(value))
}

// --- Text --------------------------------------------------------------------

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? ''
}

export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`)
}

/** Deterministic avatar tint, so a person keeps the same color everywhere. */
export function avatarColor(id: string): string {
  const palette = [
    'bg-indigo-500', 'bg-teal-600', 'bg-amber-600', 'bg-violet-600',
    'bg-rose-600', 'bg-sky-600', 'bg-emerald-600', 'bg-slate-600',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}
