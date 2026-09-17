/**
 * Update Analytics.
 *
 * The numbers live on LinkedIn, Instagram and YouTube; this is where they get
 * copied in, once a post has had time to breathe. It has to be fast, open,
 * type, save, done, because a chore that takes two minutes per post gets
 * skipped, and skipped metrics make the whole dashboard lie.
 *
 * Everything is optional. No platform reports all of these, and requiring a
 * number a platform does not give you just means people invent one. Blank
 * means "not reported", which is not the same as zero and is not treated the
 * same way.
 *
 * The derived figures are shown live as you type, so a fat-fingered zero is
 * obvious before it is saved rather than after it has skewed a month.
 */
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, Input, Label } from '@/components/ops/ui/primitives'
import { recordContentMetrics, setPublishedUrl } from '@/lib/server/ops/actions'
import { useSave } from '@/lib/ops/use-save'
import { PLATFORM } from '@/lib/ops/constants'
import { cn, formatDate } from '@/lib/ops/utils'
import type { Platform, PublicationRow } from '@/types/ops'

/** The metrics, grouped the way the funnel runs. */
const GROUPS: { title: string; hint: string; fields: [string, string][] }[] = [
  { title: 'Awareness', hint: 'How many people saw it',
    fields: [
      ['impressions', 'Impressions'],
      ['reach', 'Reach'],
      ['video_views', 'Video views'],
    ] },
  { title: 'Engagement', hint: 'What they did with it',
    fields: [
      ['reactions', 'Reactions / likes'],
      ['comments', 'Comments'],
      ['shares', 'Shares / reposts'],
      ['saves', 'Saves'],
    ] },
  { title: 'Traffic', hint: 'Whether they clicked',
    fields: [
      ['clicks', 'Clicks'],
      ['link_clicks', 'Link clicks'],
    ] },
  { title: 'Audience', hint: 'Who followed as a result',
    fields: [
      ['new_followers', 'New followers'],
      ['new_connections', 'New connections'],
    ] },
  { title: 'Business', hint: 'Whether it created anything',
    fields: [
      ['inbound_dms', 'Inbound DMs'],
      ['leads', 'Leads generated'],
      ['meetings', 'Meetings generated'],
    ] },
]

/** A rate, or an em dash when its denominator is missing or zero. */
export function rate(top: number | null, bottom: number | null): string {
  if (top == null || !bottom) return '-'
  return `${((top / bottom) * 100).toFixed(2)}%`
}

export const num = (n: number | null | undefined) =>
  n == null ? '-' : n.toLocaleString()

export function MetricsDrawer({
  publication, onClose,
}: {
  publication: PublicationRow
  onClose: () => void
}) {
  const m = publication.metrics
  const persist = useSave()

  // Held as strings: an empty box is "not reported", and a number input that
  // coerces blank to 0 would silently claim a post got zero impressions.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const g of GROUPS) {
      for (const [key] of g.fields) {
        const v = (m as Record<string, number | null> | null | undefined)?.[key]
        seed[key] = v == null ? '' : String(v)
      }
    }
    return seed
  })
  const [url, setUrl] = useState(publication.published_url ?? '')

  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }))
  const n = (k: string): number | null => {
    const raw = vals[k]?.trim()
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  // Live arithmetic, matching the database view exactly. Shown while typing so
  // a wrong number is caught here rather than in a month-end report.
  const engaged = ['reactions', 'comments', 'shares', 'saves']
  const anyEngagement = engaged.some((k) => n(k) != null)
  const engagements = anyEngagement
    ? engaged.reduce((t, k) => t + (n(k) ?? 0), 0) : null
  const impressions = n('impressions')

  const negative = Object.keys(vals).some((k) => (n(k) ?? 0) < 0)

  function save() {
    if (negative) return
    const payload: Record<string, number | null> = {}
    for (const g of GROUPS) for (const [key] of g.fields) payload[key] = n(key)

    void persist.save(async () => {
      const r = await recordContentMetrics(
        publication.content.id, publication.platform as Platform, payload)
      if (!r.ok) return r
      if (url.trim() !== (publication.published_url ?? '')) {
        return setPublishedUrl(
          publication.content.id, publication.platform as Platform, url)
      }
      return r
    }).then((ok) => { if (ok) onClose() })
  }

  return (
    <>
      <div className="anim-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      {/* The wrapper centres, the panel animates. They cannot be the same
          element: anim-pop animates a transform, and a transform on a fixed
          element makes it the containing block for its own inset-0, so the
          m-auto centring resolved against the panel rather than the viewport.
          This is the split .overlay already uses everywhere else. */}
      <div
        className="fixed inset-0 z-50 grid place-items-center p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <aside
        className="anim-pop flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--alac-radius)] border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl"
        role="dialog" aria-label="Update analytics"
      >
        <div className="flex items-start gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{publication.content.title}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              {PLATFORM[publication.platform].label} ·{' '}
              {formatDate(publication.published_at)}
              {m?.updated_at && (
                <> · updated {formatDate(m.updated_at)}</>
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          {persist.error && (
            <div role="alert"
                 className="mb-3 flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              <span>{persist.error}</span>
              <button type="button" onClick={persist.clearError}
                      className="shrink-0 font-medium hover:underline">Dismiss</button>
            </div>
          )}

          {/* What the numbers add up to, live. */}
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
            <Derived label="Engagements" value={num(engagements)} />
            <Derived label="Engagement rate" value={rate(engagements, impressions)} />
            <Derived label="CTR" value={rate(n('clicks'), impressions)} />
            <Derived label="Link CTR" value={rate(n('link_clicks'), impressions)} />
            <Derived label="Lead rate" value={rate(n('leads'), n('clicks'))} />
            <Derived label="Meeting rate" value={rate(n('meetings'), n('leads'))} />
          </div>

          <div className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-1.5">
                  <span className="text-[11px] font-semibold">{g.title}</span>
                  <span className="ml-2 text-[10px] text-[var(--text-muted)]">{g.hint}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.fields.map(([key, label]) => (
                    <div key={key}>
                      {/* Bound to the input so clicking the label focuses the
                          box, and so assistive tech reads them as one thing. */}
                      <Label htmlFor={`m-${key}`} className="text-[10px]">
                        {label}
                      </Label>
                      <Input
                        id={`m-${key}`}
                        type="number" min={0} inputMode="numeric"
                        value={vals[key]}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder="-"
                        className={cn('h-7 text-xs',
                          (n(key) ?? 0) < 0 && 'border-rose-400')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <Label htmlFor="m-post-url" className="text-[10px]">Post URL</Label>
              <Input
                id="m-post-url"
                value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…" className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button size="sm" variant="primary" onClick={save}
                  disabled={persist.saving || negative}>
            {persist.saving ? 'Saving…' : 'Save analytics'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          {negative && (
            <span className="text-[10px] text-rose-600">
              Numbers cannot be negative.
            </span>
          )}
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            Blank means not reported
          </span>
        </div>
      </aside>
      </div>
    </>
  )
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-semibold tabular">{value}</p>
    </div>
  )
}
