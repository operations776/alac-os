/**
 * Loading skeletons for the operations screens.
 *
 * Built on the desk's `Bar` so the shimmer is one thing across the product,
 * but sized to the operations layout: its headers are text-lg over a text-xs
 * line, its panels are denser, and its boards are columns of cards. The rule
 * from components/ui/skeleton.tsx holds: a skeleton matches the LAYOUT of what
 * replaces it, or the page jumps when the data lands.
 */
import { Bar } from '@/components/ui/skeleton'

/** Page title, sub line, optional back link and the action row on the right. */
export function OpsHeaderSkeleton({
  actions = [], back = false, sub = true, className = 'mb-4',
}: {
  /** Widths in px of the controls on the right, in order. */
  actions?: number[]
  back?: boolean
  sub?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      {back && <Bar w={64} h={10} className="mb-3" />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Bar w={180} h={22} />
          {sub && <Bar w={240} h={12} className="mt-1.5" />}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {actions.map((w, i) => <Bar key={i} w={w} h={28} />)}
          </div>
        )}
      </div>
    </div>
  )
}

/** A row of number tiles: label over a large figure. */
export function StatTilesSkeleton({
  count = 4, className = 'mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4',
}: { count?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
          <Bar w={72} h={10} />
          <Bar w={48} h={26} className="mt-2" />
        </div>
      ))}
    </div>
  )
}

/** A panel with a header and list rows, the shape of TaskGroup and most lists. */
export function RowsSkeleton({
  rows = 5, title = true, className = '',
}: { rows?: number; title?: boolean; className?: string }) {
  return (
    <div className={`panel overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <Bar w={120} h={12} />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 last:border-0">
          <Bar w={14} h={14} />
          <Bar w={`${34 + ((i * 11) % 30)}%`} h={12} />
          <Bar w={56} h={10} className="ml-auto" />
        </div>
      ))}
    </div>
  )
}

/** A panel of labelled inputs, for the settings forms. */
export function FormPanelSkeleton({ fields = 3, className = '' }: { fields?: number; className?: string }) {
  return (
    <div className={`panel ${className}`}>
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <Bar w={90} h={12} />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Bar w={80} h={10} className="mb-1.5" />
            <Bar h={32} />
          </div>
        ))}
        <Bar w={84} h={28} />
      </div>
    </div>
  )
}

const CARDS = [3, 2, 4, 1, 2, 3, 1]

/**
 * A kanban board. Without `columnWidth` the columns share a grid (the task
 * boards); with it they are fixed width in a row (content, GTM), matching
 * `flex w-60 shrink-0` style columns.
 */
export function KanbanSkeleton({
  columns = 5, columnWidth, className = '',
}: { columns?: number; columnWidth?: number; className?: string }) {
  const cols = Array.from({ length: columns }, (_, c) => (
    <div key={c} className="flex min-w-0 flex-col"
         style={columnWidth ? { width: columnWidth, flexShrink: 0 } : undefined}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Bar w={6} h={6} />
        <Bar w={64 + ((c * 13) % 30)} h={10} />
      </div>
      <div className="min-h-[60vh] flex-1 space-y-1.5 rounded-lg bg-[var(--surface)] p-1.5">
        {Array.from({ length: CARDS[c % CARDS.length] }, (_, i) => (
          <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-2">
            <Bar w={`${70 + ((c + i) * 7) % 25}%`} h={12} />
            <Bar w="50%" h={10} className="mt-2" />
            <div className="mt-2.5 flex items-center gap-1.5">
              <Bar w={44} h={14} />
              <Bar w={16} h={16} className="ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  ))

  return columnWidth ? (
    <div className={`flex min-h-0 flex-1 gap-2.5 overflow-hidden pb-3 ${className}`}>{cols}</div>
  ) : (
    <div className={`grid gap-2.5 ${className}`}
         style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cols}
    </div>
  )
}
