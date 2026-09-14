'use client'

/**
 * A number you change by clicking it.
 *
 * Opening a form to change a 3 to a 4 is enough friction that people stop
 * doing it, and a pipeline count nobody updates is worse than no count, * every decision downstream is made on a stale number.
 *
 * Enter saves, Escape cancels, blur saves. The value only changes on screen
 * once the server has agreed, so the display never claims something the
 * database did not accept.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/ops/utils'

export function InlineNumber({
  value, onSave, min = 0, max = 999, title, className, suffix,
}: {
  value: number
  onSave: (next: number) => Promise<{ ok: boolean; error?: string }>
  min?: number
  max?: number
  title?: string
  className?: string
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  // Track the value this draft was seeded from. When the server sends a new
  // one and nobody is typing, reseed during render rather than in an effect, // an effect would paint the stale number first, then correct it.
  const [seed, setSeed] = useState(value)
  if (!editing && seed !== value) { setSeed(value); setDraft(String(value)) }
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select() }
  }, [editing])

  const commit = async () => {
    const n = Number(draft)
    if (!Number.isFinite(n) || n < min || n > max) {
      setDraft(String(value)); setEditing(false); return
    }
    if (n === value) { setEditing(false); return }

    setSaving(true)
    const r = await onSave(n)
    setSaving(false)
    setEditing(false)
    if (!r.ok) {
      // Never leave a number on screen the server refused.
      setDraft(String(value))
      setFailed(r.error ?? 'Could not save')
      setTimeout(() => setFailed(null), 4000)
    }
  }

  if (editing) {
    return (
      <input
        ref={input}
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
        }}
        className={cn(
          'w-14 rounded-[3px] border border-brand-400 bg-[var(--surface)] px-1 py-0.5',
          'text-xs tabular outline-none', className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={failed ?? title ?? 'Click to edit'}
      className={cn(
        'rounded-[3px] px-1 py-0.5 text-left tabular transition-colors',
        'hover:bg-[var(--surface-hover)] hover:ring-1 hover:ring-[var(--border-strong)]',
        failed && 'text-rose-600 ring-1 ring-rose-400',
        className,
      )}
    >
      {value}{suffix}
    </button>
  )
}
