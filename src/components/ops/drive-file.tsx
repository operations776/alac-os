/** A Drive file row. Links out, Drive owns the file, this is a pointer. */
import { ExternalLink, File, FileSpreadsheet, FileText, Folder, Presentation } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/ops/utils'
import type { DriveFile } from '@/types/ops'

const ICONS = {
  folder: { Icon: Folder,           color: 'text-amber-500' },
  doc:    { Icon: FileText,         color: 'text-blue-500' },
  sheet:  { Icon: FileSpreadsheet,  color: 'text-emerald-600' },
  slides: { Icon: Presentation,     color: 'text-orange-500' },
  pdf:    { Icon: File,             color: 'text-rose-500' },
  file:   { Icon: File,             color: 'text-[var(--text-muted)]' },
} as const

export function DriveFileRow({ file, showFolder = true }: { file: DriveFile; showFolder?: boolean }) {
  const { Icon, color } = ICONS[(file.icon_kind ?? 'file') as keyof typeof ICONS] ?? ICONS.file

  return (
    <a
      href={file.view_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0 hover:bg-[var(--surface-hover)]"
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{file.title}</span>
      {showFolder && file.folder && (
        <span className="hidden shrink-0 truncate text-[10px] text-[var(--text-muted)] sm:block sm:max-w-48">
          {file.folder}
        </span>
      )}
      <span className="w-16 shrink-0 text-right text-[10px] tabular text-[var(--text-muted)]">
        {file.modified_at ? formatDateShort(file.modified_at) : '-'}
      </span>
      <ExternalLink className="h-3 w-3 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  )
}
