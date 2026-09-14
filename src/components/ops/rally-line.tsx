/**
 * The line that greets the team each morning.
 *
 * Command Center opens on what is late and what is owed, the right first
 * screen for running the work, the wrong one for remembering why it matters.
 * This sits above it: one sentence, in ALAC's own words, the same for
 * everybody, changing daily.
 *
 * Deliberately quiet. It is a reminder, not a banner, loud enough to read
 * on the way past, never loud enough to compete with an overdue count.
 */
import { Quote } from 'lucide-react'
import type { RallyLine as Line } from '@/types/ops'

export function RallyLine({ line }: { line: Line | null }) {
  // No lines configured yet: show nothing rather than an empty frame.
  if (!line?.body) return null

  return (
    <div className="mb-5 flex items-start gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/50">
      <Quote className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-400"
             aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-snug text-brand-900 dark:text-brand-100">
          {line.body}
        </p>
        {line.source && (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {line.source}
          </p>
        )}
      </div>
    </div>
  )
}
