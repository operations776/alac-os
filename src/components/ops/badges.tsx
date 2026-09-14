/** Small shared badges. One definition each so every view matches. */
import { AlertTriangle, Clock, Repeat } from 'lucide-react'
import { Badge } from '@/components/ops/ui/primitives'
import { cn, formatDue, isOverdue, daysAway } from '@/lib/ops/utils'
import { HEALTH, PROJECT_STATUS, STATUS, priorityStyle } from '@/lib/ops/constants'
import type { Health, Priority, ProjectStatus, TaskStatus } from '@/types/ops'

export function PriorityBadge({ p }: { p: Priority }) {
  // Normal is the default and needs no badge, only High earns attention,
  // and Low earns a quiet one.
  if (p === 'normal') return null
  return <Badge className={priorityStyle(p).chip}>{priorityStyle(p).label}</Badge>
}

export function PriorityDot({ p }: { p: Priority }) {
  return (
    <span
      title={priorityStyle(p).label}
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', priorityStyle(p).dot)}
    />
  )
}

export function StatusBadge({ s }: { s: TaskStatus }) {
  return <Badge className={STATUS[s].chip}>{STATUS[s].label}</Badge>
}

export function ProjectStatusBadge({ s }: { s: ProjectStatus }) {
  return <Badge className={PROJECT_STATUS[s].chip}>{PROJECT_STATUS[s].label}</Badge>
}

export function HealthBadge({ h, dotOnly }: { h: Health; dotOnly?: boolean }) {
  if (dotOnly) {
    return (
      <span
        title={HEALTH[h].label}
        className={cn('inline-block h-2 w-2 shrink-0 rounded-full', HEALTH[h].dot)}
      />
    )
  }
  return (
    <Badge className={HEALTH[h].chip}>
      <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH[h].dot)} />
      {HEALTH[h].label}
    </Badge>
  )
}

/** Due date, colored by urgency. Overdue is the only date that shouts. */
export function DueDate({
  date, done, className, icon = true,
}: {
  date: string | null | undefined
  done?: boolean
  className?: string
  icon?: boolean
}) {
  if (!date) return null
  const late = isOverdue(date, done)
  const days = daysAway(date)
  const soon = !late && days !== null && days <= 1

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-2xs tabular',
        late ? 'font-semibold text-rose-600 dark:text-rose-400'
             : soon ? 'font-medium text-amber-600 dark:text-amber-400'
                    : 'text-[var(--text-muted)]',
        className,
      )}
    >
      {icon && <Clock className="h-3 w-3 shrink-0" />}
      {formatDue(date)}
    </span>
  )
}

export function OverdueBadge() {
  return (
    <Badge className="bg-rose-600 font-semibold text-white">
      <AlertTriangle className="h-2.5 w-2.5" />
      OVERDUE
    </Badge>
  )
}

export function RecurringBadge() {
  return (
    <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
           title="Repeats">
      <Repeat className="h-2.5 w-2.5" />
    </Badge>
  )
}

export function ClientBadge({ name }: { name: string }) {
  return (
    <Badge className="bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900">
      {name}
    </Badge>
  )
}
