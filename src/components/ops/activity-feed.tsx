/** Activity trail for one entity. Append-only, newest first. */
import { Avatar } from '@/components/ops/ui/primitives'
import { relative } from '@/lib/ops/utils'
import type { ActivityEntry } from '@/types/ops'

export function ActivityFeed({
  entries, limit,
}: {
  entries: ActivityEntry[]
  limit?: number
}) {
  const shown = limit ? entries.slice(0, limit) : entries

  if (!shown.length) {
    return (
      <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
        Nothing yet.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {shown.map((a) => (
        <li key={a.id} className="flex items-start gap-2">
          {a.actor
            ? <Avatar id={a.actor.id} name={a.actor.name}
                      src={a.actor.avatar_url} size="xs" />
            : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--surface-hover)]" />}
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--text-secondary)]">
            {a.summary ?? `${a.verb} ${a.field ?? ''}`}
            <span className="ml-1 text-[var(--text-muted)]">{relative(a.created_at)}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}
