'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen, Link2, Trash2 } from 'lucide-react'
import {
  Button, EmptyState, Input, Panel, Select,
} from '@/components/ops/ui/primitives'
import { DriveFileRow } from '@/components/ops/drive-file'
import { attachDriveFile, removeDriveFile } from '@/lib/server/ops/actions'
import { relative } from '@/lib/ops/utils'
import type { DriveFile, Integration, ProjectRow } from '@/types/ops'

export function FilesClient({
  files, projects, drive,
}: {
  files: DriveFile[]
  projects: ProjectRow[]
  drive: Integration | null
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const shown = useMemo(() => files.filter((f) => {
    if (q && !f.title.toLowerCase().includes(q.toLowerCase()) &&
        !(f.folder?.toLowerCase().includes(q.toLowerCase()) ?? false)) return false
    if (projectFilter === 'none' && f.project_id) return false
    if (projectFilter && projectFilter !== 'none' && f.project_id !== projectFilter) return false
    return true
  }), [files, q, projectFilter])

  // Folders first, then everything else, mirrors how Drive itself reads.
  const folders = shown.filter((f) => f.icon_kind === 'folder')
  const docs = shown.filter((f) => f.icon_kind !== 'folder')

  return (
    <div className="mx-auto max-w-4xl p-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Files</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          The ALAC Google Drive.
          {drive?.last_synced_at
            ? ` Synced ${relative(drive.last_synced_at)}.`
            : ' Not synced yet.'}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Input placeholder="Search files…" value={q}
               onChange={(e) => setQ(e.target.value)}
               className="h-7 w-48 text-xs" />
        <Select className="h-7 text-xs" value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All files</option>
          <option value="none">Not linked to a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FolderOpen}
            title={files.length ? 'Nothing matches' : 'No files synced yet'}
            description={files.length
              ? undefined
              : 'Ask Claude to sync Drive, then run npm run sync.'}
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {folders.length > 0 && (
            <div>
              <h2 className="section-label mb-1.5">Folders</h2>
              <Panel className="overflow-hidden">
                {folders.map((f) => (
                  <FileRow key={f.id} file={f} projects={projects}
                           onChanged={() => router.refresh()} />
                ))}
              </Panel>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <h2 className="section-label mb-1.5">Documents</h2>
              <Panel className="overflow-hidden">
                {docs.map((f) => (
                  <FileRow key={f.id} file={f} projects={projects}
                           onChanged={() => router.refresh()} />
                ))}
              </Panel>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-[var(--text-secondary)]">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        These are links, not copies. Drive owns the file; this records where it
        belongs.
      </p>
    </div>
  )
}


/**
 * One file: the link, which project it belongs to, and a way to remove it.
 *
 * Removing deletes ALAC's record, not the file in Drive, the copy in the
 * confirm text says so, because "delete" next to a Drive file reads as
 * something much more destructive than it is.
 */
function FileRow({
  file, projects, onChanged,
}: {
  file: DriveFile
  projects: ProjectRow[]
  onChanged: () => void
}) {
  const [busy, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="group flex items-center gap-2 pr-2">
      <div className="min-w-0 flex-1">
        <DriveFileRow file={file} />
      </div>

      <Select
        className="h-6 w-36 shrink-0 py-0 text-[10px]"
        value={file.project_id ?? ''}
        onChange={(e) => start(async () => {
          await attachDriveFile(file.id, e.target.value || null)
          onChanged()
        })}
        title="Link to a project"
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="danger" disabled={busy}
                  onClick={() => start(async () => {
                    await removeDriveFile(file.id)
                    setConfirming(false)
                    onChanged()
                  })}>
            Remove
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          title="Remove from Files (the file stays in Drive)"
          aria-label={`Remove ${file.title} from Files`}
          className="shrink-0 rounded-[3px] p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--surface-hover)] hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
