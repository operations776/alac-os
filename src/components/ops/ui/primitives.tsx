/**
 * Base UI primitives.
 *
 * Small, unopinionated building blocks shared across every view. Domain-aware
 * badges (priority, status, health) live in components/badges.tsx so this file
 * stays free of product vocabulary.
 */
'use client'

import * as React from 'react'
import { cn, initials as toInitials, avatarColor } from '@/lib/ops/utils'

// --- Button -----------------------------------------------------------------

/**
 * Buttons are the desk's `.btn` family from globals.css, so an operations
 * screen and a desk screen share one control: a rectangle with a mono,
 * uppercase, tracked label. Primary is the light fill, secondary is outlined,
 * ghost is the accent, danger is red, subtle is an outlined surface.
 *
 * `.btn` is sized for a page-level action (40px). A dense board needs smaller
 * controls, so every size restates height, padding, type size and tracking.
 * `.btn` lives in @layer components, so these utilities win without
 * !important, and `min-h-0` releases its min-height so a call site's own
 * `h-*` still lands. Disabled and focus come from `.btn:disabled` and the
 * global focus-visible ring.
 */
const BUTTON_VARIANTS = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  danger:    'btn-danger',
  subtle:    'border-[var(--alac-line)] bg-[var(--alac-surface-2)] text-[var(--alac-text-2)] hover:border-[var(--alac-line-strong)] hover:text-[var(--alac-text)]',
} as const

const BUTTON_SIZES = {
  xs: 'h-6 px-2 gap-1 text-[10px] tracking-[0.08em]',
  sm: 'h-7 px-2.5 gap-1.5 text-[10px] tracking-[0.1em]',
  md: 'h-8 px-3 gap-1.5 text-[11px] tracking-[0.1em]',
  lg: 'h-10 px-5 gap-2 text-xs tracking-[0.12em]',
  icon: 'h-7 w-7 px-0',
  'icon-sm': 'h-6 w-6 px-0',
} as const

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS
  size?: keyof typeof BUTTON_SIZES
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'btn min-h-0 leading-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        // An icon-only ghost is a close or overflow control, not an action:
        // it stays quiet until hovered rather than wearing the accent.
        variant === 'ghost' && (size === 'icon' || size === 'icon-sm') &&
          'text-[var(--alac-text-3)] hover:text-[var(--alac-text)]',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

// --- Kbd --------------------------------------------------------------------

const noSubscribe = () => () => {}
function isMac() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform || nav.platform || '')
}

/**
 * A keycap for a shortcut that needs the platform modifier: "Ctrl K" on
 * Windows and Linux, "⌘K" on a Mac. The server cannot know the platform, so
 * it renders the Ctrl form and the client swaps after hydration (the server
 * snapshot keeps the first client render identical, so there is no mismatch).
 * `mod={false}` renders the key alone, for Esc and the like. It never shrinks
 * or wraps, so it cannot be what overflows a crowded row.
 */
export function Kbd({
  k, mod = true, className,
}: { k: string; mod?: boolean; className?: string }) {
  const mac = React.useSyncExternalStore(noSubscribe, isMac, () => false)
  return (
    <kbd
      className={cn(
        'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[3px] border border-[var(--border-strong)]',
        'bg-[var(--surface-sunken)] px-1.5 font-mono text-[10px] leading-none text-[var(--text-muted)]',
        className,
      )}
    >
      {mod ? (mac ? `⌘${k}` : `Ctrl ${k}`) : k}
    </kbd>
  )
}

// --- Badge ------------------------------------------------------------------

export function Badge({
  className, children, ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        'text-2xs font-medium whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// --- Avatar -----------------------------------------------------------------

export function Avatar({
  name, src, id, size = 'md', className,
}: {
  name: string | null | undefined
  src?: string | null
  id?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    xs: 'h-4 w-4 text-[8px]',
    sm: 'h-5 w-5 text-[9px]',
    md: 'h-6 w-6 text-[10px]',
    lg: 'h-9 w-9 text-xs',
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? ''}
        title={name ?? undefined}
        className={cn('rounded-full object-cover shrink-0', sizes[size], className)}
      />
    )
  }

  return (
    <span
      title={name ?? undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-full shrink-0',
        'font-semibold text-white select-none',
        avatarColor(id ?? name ?? '?'),
        sizes[size],
        className,
      )}
    >
      {toInitials(name)}
    </span>
  )
}

/** Overlapping avatar row for project teams. */
export function AvatarStack({
  people, max = 4, size = 'md',
}: {
  people: { id: string; full_name: string; avatar_url?: string | null }[]
  max?: number
  size?: 'xs' | 'sm' | 'md'
}) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  const ring = 'ring-2 ring-[var(--surface-raised)]'

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar
          key={p.id}
          id={p.id}
          name={p.full_name}
          src={p.avatar_url}
          size={size}
          className={ring}
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'bg-[var(--surface-hover)] text-[var(--text-secondary)]',
            'font-semibold text-[9px] h-5 w-5',
            ring,
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

// --- Progress ---------------------------------------------------------------

export function ProgressBar({
  value, className, barClassName, showLabel = false,
}: {
  value: number
  className?: string
  barClassName?: string
  showLabel?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-hover)]',
          className,
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', barClassName ?? 'bg-brand-600')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="tabular text-2xs text-[var(--text-muted)] w-8 text-right">
          {pct}%
        </span>
      )}
    </div>
  )
}

// --- Layout helpers ---------------------------------------------------------

export function Panel({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel', className)} {...props}>
      {children}
    </div>
  )
}

export function PanelHeader({
  title, action, className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5',
        className,
      )}
    >
      <h2 className="text-xs font-semibold text-[var(--text-primary)]">{title}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {Icon && <Icon className="h-6 w-6 text-[var(--text-muted)]" />}
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

// --- Form controls ----------------------------------------------------------

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface)]',
      'px-2.5 text-[13px] text-[var(--text-primary)]',
      'placeholder:text-[var(--text-muted)]',
      'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface)]',
      'px-2.5 py-2 text-[13px] text-[var(--text-primary)] resize-y',
      'placeholder:text-[var(--text-muted)]',
      'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-8 rounded-md border border-[var(--border-strong)] bg-[var(--surface)]',
      'px-2 pr-7 text-[13px] text-[var(--text-primary)]',
      'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'

export function Label({
  className, children, ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-xs font-medium text-[var(--text-secondary)] mb-1', className)}
      {...props}
    >
      {children}
    </label>
  )
}

export function Checkbox({
  className, ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-3.5 w-3.5 rounded border-[var(--border-strong)] text-brand-600',
        'focus:ring-1 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer',
        className,
      )}
      {...props}
    />
  )
}

// --- Tabs -------------------------------------------------------------------

export function Tabs({
  tabs, active, onChange, className,
}: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div
      className={cn('flex items-center gap-0.5 border-b border-[var(--border)]', className)}
      role="tablist"
    >
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative px-3 py-2 text-xs font-medium transition-colors -mb-px',
              'border-b-2',
              on
                ? 'border-brand-600 text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  'ml-1.5 rounded px-1 py-0.5 text-[10px] tabular',
                  on
                    ? 'bg-brand-600 text-white'
                    : 'bg-[var(--surface-hover)] text-[var(--text-muted)]',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// --- Tooltip ----------------------------------------------------------------
// CSS-only: no portal, no state, no layout thrash on dense tables.

export function Tooltip({
  label, children, side = 'top',
}: {
  label: string
  children: React.ReactNode
  side?: 'top' | 'bottom'
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap',
          'rounded bg-slate-900 px-1.5 py-1 text-[10px] font-medium text-white',
          'opacity-0 transition-opacity group-hover/tip:opacity-100',
          'dark:bg-slate-700',
          side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
        )}
      >
        {label}
      </span>
    </span>
  )
}

// --- Skeleton ---------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-[var(--surface-hover)]', className)}
      aria-hidden
    />
  )
}
