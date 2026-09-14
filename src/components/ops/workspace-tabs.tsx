/**
 * Board / Analytics switch for a workspace.
 *
 * The board is work; analytics is output. Keeping them one click apart makes
 * the distinction obvious without putting four entries in the sidebar.
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/ops/utils'

export function WorkspaceTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname()
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-[var(--surface-sunken)] p-0.5">
      {tabs.map((t) => {
        const on = path === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'rounded px-2.5 py-1 text-xs transition-colors',
              on
                ? 'bg-[var(--surface-raised)] font-medium shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
