/**
 * The media library inside a content item (spec §5-14).
 *
 * Grouped by production stage, because that is how the work moves: reference
 * feeds raw, raw feeds edits, one edit becomes final. Images preview inline,
 * video plays here rather than sending anyone to Drive.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ExternalLink, Film, ImageIcon, Star, Trash2, X,
} from 'lucide-react'
import { Button, Input, Label, Select } from '@/components/ops/ui/primitives'
import { attachContentAsset, removeContentAsset, updateContentAsset } from '@/lib/server/ops/actions'
import { cn } from '@/lib/ops/utils'

type AssetStage = 'reference' | 'raw' | 'edited' | 'final' | 'supporting'

export interface ContentAsset {
  id: string
  file_name: string
  display_name: string | null
  storage_path: string | null
  external_url: string | null
  mime_type: string | null
  size_bytes: number | null
  stage: string
  approval: string
  is_primary: boolean
  is_link: boolean
  duration_s: number | null
}

const STAGES: { key: AssetStage; label: string; hint: string }[] = [
  { key: 'reference',  label: 'Reference',  hint: 'Direction and inspiration. Never published.' },
  { key: 'raw',        label: 'Raw',        hint: 'Straight off the camera.' },
  { key: 'edited',     label: 'Edited',     hint: 'Worked on, not yet signed off.' },
  { key: 'final',      label: 'Final',      hint: 'Approved and ready to publish.' },
  { key: 'supporting', label: 'Supporting', hint: 'Captions, docs, anything alongside.' },
]

const APPROVAL: Record<string, { label: string; chip: string }> = {
  not_required:      { label: '', chip: '' },
  needs_review:      { label: 'Needs review',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  changes_requested: { label: 'Changes requested',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  approved:          { label: 'Approved',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
}

const size = (b: number | null) =>
  !b ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)}MB` : `${Math.round(b / 1e3)}KB`

const time = (s: number | null) =>
  !s ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function MediaPanel({
  contentId, assets, urls, canApprove,
}: {
  contentId: string
  assets: ContentAsset[]
  /** Signed URLs by storage path, the bucket is private. */
  urls: Record<string, string>
  canApprove: boolean
}) {
  const [lightbox, setLightbox] = useState<ContentAsset | null>(null)

  return (
    <div className="space-y-3">
      <PasteLink contentId={contentId} />

      {STAGES.map(({ key, label, hint }) => {
        const group = assets.filter((a) => a.stage === key)
        if (!group.length) return null
        return (
          <div key={key}>
            <h4 className="section-label mb-1" title={hint}>
              {label} · {group.length}
            </h4>
            <div className="space-y-1">
              {group.map((a) => (
                <AssetRow
                  key={a.id} asset={a}
                  url={a.storage_path ? urls[a.storage_path] : a.external_url}
                  canApprove={canApprove}
                  onPreview={() => setLightbox(a)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {assets.length === 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          No media yet. Paste a link above.
        </p>
      )}

      {lightbox && (
        <Lightbox
          asset={lightbox}
          url={lightbox.storage_path ? urls[lightbox.storage_path] : lightbox.external_url}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

/** Media is hosted elsewhere (Drive, Canva, YouTube), so an asset is a link. */
function PasteLink({ contentId }: { contentId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const link = url.trim()
    if (!link) return
    start(async () => {
      const name = link.split('?')[0].replace(/\/+$/, '').split('/').pop() || link
      const r = await attachContentAsset({ content_id: contentId, file_name: name, external_url: link })
      if (!r.ok) { setError(r.error); return }
      setError(null); setUrl(''); router.refresh()
    })
  }

  return (
    <div>
      <Label htmlFor={`paste-link-${contentId}`}>Paste a link</Label>
      <div className="flex gap-1.5">
        <Input id={`paste-link-${contentId}`} type="url" value={url}
               onChange={(e) => setUrl(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
               placeholder="https://" className="h-7 flex-1 text-[11px]" />
        <Button size="sm" variant="subtle" disabled={pending || !url.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}

function AssetRow({
  asset: a, url, canApprove, onPreview,
}: {
  asset: ContentAsset
  url: string | null | undefined
  canApprove: boolean
  onPreview: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const isImage = a.mime_type?.startsWith('image/')
  const isVideo = a.mime_type?.startsWith('video/')
  const label = a.display_name || a.file_name
  const appr = APPROVAL[a.approval]

  const patch = (p: Parameters<typeof updateContentAsset>[1]) =>
    start(async () => { await updateContentAsset(a.id, p); router.refresh() })

  return (
    <div className="flex items-center gap-2 rounded-[3px] bg-[var(--surface-hover)] p-1.5">
      {/* A thumbnail is worth more than a filename. */}
      <button onClick={onPreview}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-[3px] bg-[var(--surface-sunken)]">
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {isVideo ? <Film className="h-4 w-4 text-[var(--text-muted)]" />
                     : <ImageIcon className="h-4 w-4 text-[var(--text-muted)]" />}
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium">
          {label}
          {a.is_primary && (
            <Star className="ml-1 inline h-2.5 w-2.5 fill-amber-400 text-amber-400" />
          )}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          {a.is_link ? 'Link' : size(a.size_bytes)}
          {a.duration_s ? ` · ${time(a.duration_s)}` : ''}
          {appr.label && (
            <span className={cn('rounded-[3px] px-1', appr.chip)}>{appr.label}</span>
          )}
        </p>
      </div>

      {/* §36 approval is one click for whoever holds it. */}
      {canApprove && a.approval === 'needs_review' && (
        <>
          <Button size="xs" variant="secondary" disabled={pending}
                  onClick={() => patch({ approval: 'approved' })}>
            <CheckCircle2 className="h-3 w-3" /> Approve
          </Button>
          <Button size="xs" variant="ghost" disabled={pending}
                  onClick={() => patch({ approval: 'changes_requested' })}>
            Changes
          </Button>
        </>
      )}

      <Select
        className="h-6 w-24 shrink-0 py-0 text-[10px]"
        value={a.stage}
        onChange={(e) => patch({ stage: e.target.value })}
        title="Where this sits in production"
      >
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </Select>

      {!a.is_primary && (
        <button onClick={() => patch({ is_primary: true })}
                title="Show this on the board card"
                className="shrink-0 text-[var(--text-muted)] hover:text-amber-400">
          <Star className="h-3 w-3" />
        </button>
      )}

      {url && (
        <a href={url} target="_blank" rel="noreferrer"
           className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* §33 removing a file never removes the content item. */}
      {confirming ? (
        <div className="flex shrink-0 gap-1">
          <Button size="xs" variant="danger" disabled={pending}
                  onClick={() => start(async () => {
                    await removeContentAsset(a.id); router.refresh()
                  })}>
            Remove
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)}
                aria-label={`Remove ${label}`}
                className="shrink-0 text-[var(--text-muted)] hover:text-rose-400">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/** §10, §11 look at the creative without leaving the app. */
function Lightbox({
  asset: a, url, onClose,
}: {
  asset: ContentAsset
  url: string | null | undefined
  onClose: () => void
}) {
  const isImage = a.mime_type?.startsWith('image/')
  const isVideo = a.mime_type?.startsWith('video/')

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    >
      <button onClick={onClose} aria-label="Close"
              className="absolute right-4 top-4 text-white/70 hover:text-white">
        <X className="h-5 w-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-4xl">
        {isImage && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={a.display_name || a.file_name}
               className="max-h-[85vh] rounded-[3px] object-contain" />
        )}
        {isVideo && url && (
          <video src={url} controls autoPlay
                 className="max-h-[85vh] rounded-[3px]" />
        )}
        {!isImage && !isVideo && (
          <div className="rounded-[3px] bg-[var(--surface-raised)] p-6 text-center">
            <p className="text-sm">{a.display_name || a.file_name}</p>
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                 className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline">
                Open file
              </a>
            )}
          </div>
        )}
        <p className="mt-2 text-center text-xs text-white/70">
          {a.display_name || a.file_name}
        </p>
      </div>
    </div>
  )
}
