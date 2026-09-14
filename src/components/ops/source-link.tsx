'use client'

/**
 * A link back to where the source material actually lives.
 *
 * Mission Control is the execution layer, not the archive: the ranked account
 * universe stays in the workbook and the brand assets stay in Drive. Somebody
 * working a board should be one click from the source rather than hunting a
 * bookmark, and the link belongs beside the work rather than in a settings
 * page nobody opens.
 */
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/ops/utils'

export function SourceLink({
  href, label, hint, className,
}: {
  href: string
  label: string
  /** What lives there, so the link says why it is worth following. */
  hint?: string
  className?: string
}) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[3px] border',
        'border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium',
        'text-brand-700 transition-colors',
        'hover:border-brand-400 hover:bg-brand-100',
        'dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-200',
        'dark:hover:bg-brand-950',
        className,
      )}
    >
      {label}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}
