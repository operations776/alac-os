/**
 * Content editor.
 *
 * Everything about one piece in one panel, plus the Draft button that writes
 * it in Adrian's voice. Copy-to-clipboard on each field, because the last step
 * is always pasting it somewhere else.
 */
'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Copy, Image as ImageIcon, Link2, Loader2, Plus, Sparkles, Trash2, X,
} from 'lucide-react'
import { Button, Input, Label, Select, Textarea } from '@/components/ops/ui/primitives'
import { PlatformIcon } from '@/components/ops/platform-icon'
import { MediaPanel } from '@/components/ops/media-panel'
import {
  addContentLink, deleteContent, loadContentDetail, signAssetUrls,
  removeContentLink, setContentPlatforms, updateContent,
} from '@/lib/server/ops/actions'
import {
  atLeast,
  CONTENT_KIND, CONTENT_KINDS, CONTENT_STATUS, CONTENT_STATUSES,
  PLATFORM, PLATFORMS,
} from '@/lib/ops/constants'
import { cn, formatDate, toDateInput } from '@/lib/ops/utils'
import type {
  ContentKind, ContentRow, ContentStatus, Person, Platform,
} from '@/types/ops'

export function ContentDrawer(props: {
  me?: Person
  item: ContentRow | null
  people: Person[]
  hasVoice: boolean
  onClose: () => void
}) {
  // Remount per item so the field mirrors start from the right values.
  const { item, ...rest } = props
  if (!item) return null
  return <Body key={item.id} item={item} {...rest} />
}

function Body({
  me, item, people, hasVoice, onClose,
}: {
  me?: Person
  item: ContentRow
  people: Person[]
  hasVoice: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [, start] = useTransition()

  const [title, setTitle] = useState(item.title)
  const [hook, setHook] = useState(item.hook ?? '')
  const [body, setBody] = useState(item.body ?? '')
  const [script, setScript] = useState(item.script ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')

  // Links, photos and the Drive video live in their own tables, so the drawer
  // fetches them itself and re-reads after every mutation.
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadContentDetail>> | null>(null)
  const [linkUrl, setLinkUrl] = useState('')

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  const reload = useCallback(
    () => loadContentDetail(item.id).then(setDetail),
    [item.id],
  )
  useEffect(() => { reload() }, [reload])

  // The media bucket is private, so every stored asset needs a signed URL
  // before it can be previewed (§45).
  useEffect(() => {
    const paths = (detail?.assets ?? [])
      .map((a) => (a as { storage_path?: string | null }).storage_path)
      .filter((p): p is string => !!p)
    // Resolved asynchronously either way, so the state update never happens
    // synchronously inside the effect.
    void signAssetUrls(paths).then(setSignedUrls)
  }, [detail])

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = (patch: Parameters<typeof updateContent>[1]) =>
    start(async () => { await updateContent(item.id, patch); router.refresh() })

  // Shorts and long-form get a script; everything else gets body copy.
  const isScript = item.kind === 'short' || item.kind === 'long'

  async function generate() {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          title,
          hook: hook || null,
          platform: item.platform,
          kind: item.kind,
          existing: isScript ? script || null : body || null,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        setGenError(json.message ?? json.error ?? 'Could not draft that.')
        return
      }
      if (isScript) setScript(json.text)
      else setBody(json.text)
      router.refresh()
    } catch (e) {
      setGenError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    }).catch(() => setCopied(null))
  }

  return (
    <>
      <div className="anim-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        className="anim-pop fixed inset-0 z-50 m-auto flex h-fit max-h-[88dvh] w-[calc(100%-32px)] max-w-2xl flex-col overflow-hidden rounded-[var(--alac-radius)] border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        role="dialog"
        aria-label="Content"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <PlatformIcon platform={item.platform} />
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                              CONTENT_STATUS[item.status].chip)}>
            {CONTENT_STATUS[item.status].label}
          </span>
          {item.generated_at && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Sparkles className="h-2.5 w-2.5" />
              drafted {formatDate(item.generated_at)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon-sm" variant="ghost" title="Delete"
              onClick={() => {
                if (!confirm('Delete this piece?')) return
                start(async () => { await deleteContent(item.id); onClose(); router.refresh() })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onClose} title="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== item.title && save({ title })}
              rows={2}
              className="w-full resize-none bg-transparent text-base font-semibold leading-snug outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Platform</Label>
                <Select className="w-full" value={item.platform}
                        onChange={(e) => save({ platform: e.target.value as Platform })}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{PLATFORM[p].label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Format</Label>
                <Select className="w-full" value={item.kind}
                        onChange={(e) => save({ kind: e.target.value as ContentKind })}>
                  {CONTENT_KINDS.map((k) => (
                    <option key={k} value={k}>{CONTENT_KIND[k].label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Stage</Label>
                <Select className="w-full" value={item.status}
                        onChange={(e) => save({ status: e.target.value as ContentStatus })}>
                  {CONTENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{CONTENT_STATUS[s].label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select className="w-full" value={item.owner_id ?? ''}
                        onChange={(e) => save({ owner_id: e.target.value || null })}>
                  <option value="">Nobody</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Publish date</Label>
                <Input type="date" value={toDateInput(item.publish_date)}
                       onChange={(e) => save({ publish_date: e.target.value || null })} />
              </div>
            </div>

            <div>
              <Label>Angle</Label>
              <Textarea
                rows={2}
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                onBlur={() => hook !== (item.hook ?? '') && save({ hook })}
                placeholder="What's the point? One line."
              />
            </div>

            {/* Draft */}
            <div className="rounded border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/30">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={generate} disabled={generating}>
                  {generating
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…</>
                    : <><Sparkles className="h-3.5 w-3.5" />
                        {(isScript ? script : body) ? 'Rewrite' : 'Draft it'}</>}
                </Button>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {hasVoice
                    ? 'Written in Adrian’s voice for this platform.'
                    : 'Set up the voice profile first for better output.'}
                </p>
              </div>
              {genError && (
                <p className="mt-2 text-[11px] text-rose-600">{genError}</p>
              )}
            </div>

            {/* The draft itself */}
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Label className="mb-0">{isScript ? 'Script' : 'Post'}</Label>
                <button
                  onClick={() => copy(isScript ? script : body, 'main')}
                  className="ml-auto flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600"
                >
                  {copied === 'main'
                    ? <><Check className="h-3 w-3" /> Copied</>
                    : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
              {isScript ? (
                <Textarea
                  rows={14}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  onBlur={() => script !== (item.script ?? '') && save({ script })}
                  placeholder="[0:00] Hook…"
                  className="font-mono text-[11px] leading-relaxed"
                />
              ) : (
                <Textarea
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => body !== (item.body ?? '') && save({ body })}
                  placeholder="The post…"
                  className="text-[12px] leading-relaxed"
                />
              )}
              {(isScript ? script : body) && (
                <p className="mt-1 text-right text-[10px] text-[var(--text-muted)] tabular">
                  {(isScript ? script : body).trim().split(/\s+/).length} words
                </p>
              )}
            </div>

            {/* Every platform this piece ships to. */}
            <div>
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => {
                  const on = detail?.platforms.some((x) => x.platform === p) ?? false
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={async () => {
                        const cur = detail?.platforms.map((x) => x.platform as Platform) ?? []
                        const next = on ? cur.filter((x) => x !== p) : [...cur, p]
                        if (!next.length) return
                        await setContentPlatforms(item.id, next)
                        reload(); router.refresh()
                      }}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
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
            </div>

            {/* Reference links */}
            <div>
              <Label>
                <span className="inline-flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Links
                </span>
              </Label>
              {detail?.links.map((l) => (
                <div key={l.id}
                     className="mb-1 flex items-center gap-2 rounded bg-[var(--surface-sunken)] px-2 py-1">
                  <a href={l.url} target="_blank" rel="noreferrer"
                     className="min-w-0 flex-1 truncate text-[11px] text-[var(--accent)] hover:underline">
                    {l.label || l.url}
                  </a>
                  <button aria-label="Remove link"
                          onClick={async () => { await removeContentLink(l.id); reload() }}>
                    <X className="h-3 w-3 text-[var(--text-muted)] hover:text-rose-600" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                       onKeyDown={async (e) => {
                         if (e.key !== 'Enter' || !linkUrl.trim()) return
                         e.preventDefault()
                         await addContentLink(item.id, linkUrl.trim())
                         setLinkUrl(''); reload()
                       }}
                       placeholder="https://…" className="h-7 flex-1 text-[11px]" />
                <Button size="sm" variant="subtle"
                        onClick={async () => {
                          if (!linkUrl.trim()) return
                          await addContentLink(item.id, linkUrl.trim())
                          setLinkUrl(''); reload()
                        }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Media (§6). Uploads and links live here together, grouped by
                where each asset sits in production. */}
            <div>
              <Label>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Media
                </span>
              </Label>
              <MediaPanel
                contentId={item.id}
                assets={(detail?.assets ?? []) as never}
                urls={signedUrls}
                canApprove={!!me && atLeast(me.role, 'manager')}
              />

            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (item.notes ?? '') && save({ notes })}
                placeholder="Hashtags, links, alt text…"
              />
            </div>

            {item.status === 'published' && (
              <div>
                <Label>Published link</Label>
                <Input
                  defaultValue={item.published_url ?? ''}
                  onBlur={(e) => e.target.value !== (item.published_url ?? '') &&
                                 save({ published_url: e.target.value || null })}
                  placeholder="https://…"
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
