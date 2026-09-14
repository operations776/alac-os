/**
 * New Content.
 *
 * Modeled on the GTM "New Account" form: one panel, everything a piece needs
 * before it starts moving, the idea, where it is going, the reference links,
 * and the photos or Drive video it will use.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Image as ImageIcon, Link2, Plus, X } from 'lucide-react'
import {
  Button, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import { PlatformIcon } from '@/components/ops/platform-icon'
import { createContentFull } from '@/lib/server/ops/actions'
import {
  CONTENT_KIND, CONTENT_KINDS, CONTENT_STATUS, CONTENT_STATUSES,
  PLATFORM, PLATFORMS, PUBLISH_METHOD,
} from '@/lib/ops/constants'
import { cn } from '@/lib/ops/utils'
import type {
  ContentKind, ContentPillar, ContentStatus, Person, Platform,
} from '@/types/ops'

interface DraftLink { url: string; label: string }
interface DraftAsset { file_name: string; external_url: string; kind: string }

export function NewContent({
  people, pillars, me, onDone, onCancel,
}: {
  people: Person[]
  pillars: ContentPillar[]
  me: Person
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [hook, setHook] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<ContentKind>('post')
  // Multi-select: one piece often ships to several platforms.
  const [platforms, setPlatforms] = useState<Platform[]>(['linkedin'])
  const [status, setStatus] = useState<ContentStatus>('idea')
  const [pillar, setPillar] = useState('')
  const [owner, setOwner] = useState(me.id)
  const [publishDate, setPublishDate] = useState('')
  const [method, setMethod] = useState('manual')

  const [links, setLinks] = useState<DraftLink[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')

  const [assets, setAssets] = useState<DraftAsset[]>([])
  const [assetUrl, setAssetUrl] = useState('')
  const [assetName, setAssetName] = useState('')
  const [assetKind, setAssetKind] = useState('image')

  function togglePlatform(p: Platform) {
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])
  }

  function addLink() {
    if (!linkUrl.trim()) return
    setLinks((l) => [...l, { url: linkUrl.trim(), label: linkLabel.trim() }])
    setLinkUrl(''); setLinkLabel('')
  }

  function addAsset() {
    if (!assetUrl.trim()) return
    setAssets((a) => [...a, {
      external_url: assetUrl.trim(),
      // Fall back to the last path segment so the row is never nameless.
      file_name: assetName.trim() || assetUrl.split('/').pop() || 'Asset',
      kind: assetKind,
    }])
    setAssetUrl(''); setAssetName('')
  }

  function submit() {
    if (!title.trim()) { setError('Give it a title or the idea in one line'); return }
    if (!platforms.length) { setError('Pick at least one platform'); return }
    setError(null)

    // Someone who types a link and hits Create without pressing + still meant
    // to attach it. Fold the pending rows in rather than dropping them.
    const allLinks = linkUrl.trim()
      ? [...links, { url: linkUrl.trim(), label: linkLabel.trim() }]
      : links
    const allAssets = assetUrl.trim()
      ? [...assets, {
          external_url: assetUrl.trim(),
          file_name: assetName.trim() || assetUrl.split('/').pop() || 'Asset',
          kind: assetKind,
        }]
      : assets

    start(async () => {
      const r = await createContentFull({
        title, hook: hook || null, notes: notes || null,
        kind, platforms, status,
        pillar: pillar || null,
        owner_id: owner,
        publish_date: publishDate || null,
        publish_method: method,
        links: allLinks.map((l) => ({ url: l.url, label: l.label || undefined })),
        assets: allAssets,
      })
      if (!r.ok) { setError(r.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <Panel className="mb-3">
      <PanelHeader
        title="New content"
        action={
          <button onClick={onCancel} aria-label="Cancel"
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
            <X className="h-3.5 w-3.5" />
          </button>
        }
      />

      <div className="space-y-4 p-4">
        <div>
          <Label>The idea</Label>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
                 placeholder="Why defense hiring is not SaaS hiring"
                 className="h-9 text-sm" />
        </div>

        <div>
          <Label>The angle, what is the point?</Label>
          <Input value={hook} onChange={(e) => setHook(e.target.value)}
                 placeholder="Clearance timelines break every playbook you brought from tech" />
        </div>

        {/* Platforms: multi-select chips with the real marks. */}
        <div>
          <Label>Where is it going?</Label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-transparent text-white'
                       : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
                  )}
                  style={on ? { backgroundColor: PLATFORM[p].hex } : undefined}
                >
                  <PlatformIcon platform={p} color={!on} className="h-3 w-3" />
                  {PLATFORM[p].label}
                </button>
              )
            })}
          </div>
          {platforms.length > 1 && (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {PLATFORM[platforms[0]].label} is the primary, the draft is written for it.
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label>Format</Label>
            <Select className="w-full" value={kind}
                    onChange={(e) => setKind(e.target.value as ContentKind)}>
              {CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>{CONTENT_KIND[k].label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Start at</Label>
            <Select className="w-full" value={status}
                    onChange={(e) => setStatus(e.target.value as ContentStatus)}>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>{CONTENT_STATUS[s].label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Pillar</Label>
            <Select className="w-full" value={pillar}
                    onChange={(e) => setPillar(e.target.value)}>
              <option value="">None</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Owner</Label>
            <Select className="w-full" value={owner}
                    onChange={(e) => setOwner(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Publish date</Label>
            <Input type="date" value={publishDate}
                   onChange={(e) => setPublishDate(e.target.value)} />
          </div>
          <div className="col-span-3">
            <Label>How does it go out?</Label>
            <Select className="w-full" value={method}
                    onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PUBLISH_METHOD).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              {PUBLISH_METHOD[method].hint}
            </p>
          </div>
        </div>

        {/* Reference links */}
        <div className="rounded border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold">Links</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              articles, LinkedIn posts, research, Drive docs
            </span>
          </div>

          {links.length > 0 && (
            <ul className="mb-2 space-y-1">
              {links.map((l, i) => (
                <li key={i} className="flex items-center gap-2 rounded bg-[var(--surface-sunken)] px-2 py-1">
                  <Link2 className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {l.label || l.url}
                  </span>
                  <button onClick={() => setLinks((c) => c.filter((_, x) => x !== i))}
                          aria-label="Remove link">
                    <X className="h-3 w-3 text-[var(--text-muted)] hover:text-rose-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-1.5">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                   placeholder="https://…" className="h-7 flex-1 text-[11px]" />
            <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                   placeholder="Label (optional)" className="h-7 w-40 text-[11px]" />
            <Button size="sm" variant="subtle" onClick={addLink}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Photos, video, thumbnails */}
        <div className="rounded border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold">Assets</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              photos, thumbnails, the Drive link to the video
            </span>
          </div>

          {assets.length > 0 && (
            <ul className="mb-2 space-y-1">
              {assets.map((a, i) => (
                <li key={i} className="flex items-center gap-2 rounded bg-[var(--surface-sunken)] px-2 py-1">
                  <span className="rounded bg-[var(--surface-hover)] px-1 text-[9px] uppercase text-[var(--text-muted)]">
                    {a.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{a.file_name}</span>
                  <button onClick={() => setAssets((c) => c.filter((_, x) => x !== i))}
                          aria-label="Remove asset">
                    <X className="h-3 w-3 text-[var(--text-muted)] hover:text-rose-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-1.5">
            <Select className="h-7 w-24 text-[11px]" value={assetKind}
                    onChange={(e) => setAssetKind(e.target.value)}>
              <option value="image">Photo</option>
              <option value="video">Video</option>
              <option value="thumbnail">Thumb</option>
              <option value="audio">Audio</option>
              <option value="file">File</option>
            </Select>
            <Input value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAsset() } }}
                   placeholder="Drive link or image URL" className="h-7 flex-1 text-[11px]" />
            <Input value={assetName} onChange={(e) => setAssetName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAsset() } }}
                   placeholder="Name (optional)" className="h-7 w-36 text-[11px]" />
            <Button size="sm" variant="subtle" onClick={addAsset}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the person producing this needs to know" />
        </div>

        {error && (
          <p className="rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Creating…' : 'Create content'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            <kbd className="rounded border border-[var(--border-strong)] px-1">⌘↵</kbd> to save
          </span>
        </div>
      </div>
    </Panel>
  )
}
