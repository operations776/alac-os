'use client'

import {
  createContext, useContext, useMemo, useState, useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragStartEvent,
} from '@dnd-kit/core'
import { Plus, Sparkles } from 'lucide-react'
import { Avatar, Button, Select } from '@/components/ops/ui/primitives'
import { PlatformIcon } from '@/components/ops/platform-icon'
import { ContentDrawer } from './content-drawer'
import { NewContent } from '@/components/ops/new-content'
import { WorkspaceTabs } from '@/components/ops/workspace-tabs'
import { BulkBar, SelectBox, useSelection } from '@/components/ops/board-selection'
import { moveContent, updateContent } from '@/lib/server/ops/actions'
import {
  CONTENT_KIND, CONTENT_STATUS, CONTENT_STATUSES, PLATFORM, PLATFORMS, SOURCE_LINKS,
} from '@/lib/ops/constants'
import { useKanban } from '@/lib/ops/kanban'
import { SourceLink } from '@/components/ops/source-link'
import { cn, daysAway, formatDateShort } from '@/lib/ops/utils'
import type {
  ContentPillar, ContentRow, ContentStatus, Person, Platform, VoiceProfile,
} from '@/types/ops'

export function ContentClient({
  me, content, people, voice, pillars,
}: {
  me: Person
  content: ContentRow[]
  people: Person[]
  voice: VoiceProfile | null
  pillars: ContentPillar[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [open, setOpen] = useState<ContentRow | null>(null)
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [who, setWho] = useState('')
  const [dragging, setDragging] = useState<ContentRow | null>(null)
  const [adding, setAdding] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  // One shared implementation across every board (Phase 25): the same
  // validation, the same optimistic lifecycle, the same failure handling.
  const selection = useSelection()

  const kanban = useKanban<ContentRow, ContentStatus>({
    rows: content,
    field: 'status',
    stages: CONTENT_STATUSES,
    save: (id, stage) => updateContent(id, { status: stage }),
    saveMany: (ids, stage) => moveContent(ids, stage),
    // Drag one card of a selection and the whole selection travels with it.
    selectedIds: selection.ids,
    onMovedSelection: () => selection.clear(),
  })

  const visible = useMemo(() => {
    let out = kanban.view
    if (platform) out = out.filter((c) => c.platform === platform)
    if (who) out = out.filter((c) => c.owner_id === who)
    return out
  }, [kanban.view, platform, who])



  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Content Studio</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {visible.filter((c) => c.status !== 'published').length} in flight ·{' '}
            {visible.filter((c) => c.status === 'published').length} published
          </p>
          {/* Finished assets live in Drive; this board tracks the work. */}
          <SourceLink className="mt-1.5" {...SOURCE_LINKS.marketing} />
        </div>

        <div className="flex items-center gap-1.5">
          <WorkspaceTabs tabs={[
            { href: '/content', label: 'Board' },
            { href: '/content/analytics', label: 'Analytics' },
          ]} />
          <Select className="h-7 text-xs" value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform | '')}>
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{PLATFORM[p].label}</option>
            ))}
          </Select>
          <Select className="h-7 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === me.id ? 'Me' : p.name}</option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={selection.toggleMode}>
            {selection.active ? 'Cancel select' : 'Select'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3.5 w-3.5" />
            New content
          </Button>
        </div>
      </div>

      {adding && (
        <NewContent
          people={people}
          pillars={pillars}
          me={me}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      <BulkBar
        kind="content"
        selection={selection}
        me={me}
        allIds={visible.map((c) => c.id)}
      />

      {/* A refused move must say why. Without this the card simply springs
          back to its old column and the board looks broken. */}
      {kanban.error && (
        <div
          role="alert"
          className="mb-2 flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
        >
          <span>{kanban.error}</span>
          <button
            type="button"
            onClick={kanban.dismissError}
            className="shrink-0 rounded-[3px] px-1 font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Selection.Provider value={selection}>
      <DndContext
        id="content-board"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) =>
          setDragging(visible.find((c) => c.id === e.active.id) ?? null)}
        onDragEnd={kanban.onDragEnd}
      >
        <div className="scrollbar-thin flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-3">
          {CONTENT_STATUSES.map((s) => (
            <Column
              key={s}
              status={s}
              items={visible.filter((c) => c.status === s)}
              onOpen={setOpen}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="w-56 rotate-2 opacity-90">
              <Card item={dragging} onOpen={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </Selection.Provider>

      <ContentDrawer
        key={open?.id ?? 'none'}
        me={me}
        item={open}
        people={people}
        hasVoice={!!voice?.tone}
        onClose={() => setOpen(null)}
      />
    </div>
  )
}

function Column({
  status, items, onOpen,
}: {
  status: ContentStatus
  items: ContentRow[]
  onOpen: (c: ContentRow) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className={cn('h-1.5 w-1.5 rounded-full', CONTENT_STATUS[status].dot)} />
        <span className="text-[11px] font-semibold">{CONTENT_STATUS[status].label}</span>
        <span className="text-[10px] tabular text-[var(--text-muted)]">{items.length}</span>
      </div>

      <div
        ref={setNodeRef} data-column={status}
        className={cn(
          'scrollbar-thin flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--surface)] p-1.5 transition-colors',
          'min-h-[60vh] max-h-[calc(100vh-13rem)]',
          isOver && 'drop-target',
        )}
      >
        {items.map((c) => (
          <Draggable key={c.id} item={c} onOpen={onOpen} />
        ))}
        {!items.length && (
          <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">Empty</p>
        )}
      </div>
    </div>
  )
}

function Draggable({ item, onOpen }: { item: ContentRow; onOpen: (c: ContentRow) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  return (
    <div ref={setNodeRef} data-card={item.id} {...listeners} {...attributes} className={cn(isDragging && 'dragging')}>
      <Card item={item} onOpen={onOpen} />
    </div>
  )
}

/** Selection state, read by the leaf card. */
const Selection = createContext<{
  active: boolean
  has: (id: string) => boolean
  toggle: (id: string) => void
} | null>(null)

function Card({ item, onOpen }: { item: ContentRow; onOpen: (c: ContentRow) => void }) {
  const sel = useContext(Selection)
  const days = daysAway(item.publish_date)
  const soon = days !== null && days >= 0 && days <= 2 && item.status !== 'published'
  const written = !!(item.body || item.script)

  return (
    <article
      onClick={() => onOpen(item)}
      className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-2 transition-shadow hover:shadow-sm"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {sel?.active && (
          <SelectBox checked={sel.has(item.id)}
                     onChange={() => sel.toggle(item.id)} />
        )}
        <PlatformIcon platform={item.platform} />
        <span className="truncate text-[10px] text-[var(--text-muted)]">
          {CONTENT_KIND[item.kind].label}
        </span>
        {item.generated_at && (
          <Sparkles className="ml-auto h-2.5 w-2.5 shrink-0 text-brand-500"
                    aria-label="Drafted with AI" />
        )}
      </div>

      <p className="mb-1 line-clamp-2 text-[11px] font-medium leading-snug">{item.title}</p>

      {item.hook && !written && (
        <p className="mb-1 line-clamp-2 text-[10px] italic text-[var(--text-muted)]">
          {item.hook}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        {item.owner && (
          <Avatar id={item.owner.id} name={item.owner.name}
                  src={item.owner.avatar_url} size="xs" />
        )}
        {written && (
          <span className="rounded bg-[var(--surface-hover)] px-1 text-[9px] text-[var(--text-muted)]">
            drafted
          </span>
        )}
        {item.publish_date && (
          <span className={cn('ml-auto text-[10px] tabular',
            soon ? 'font-medium text-amber-600' : 'text-[var(--text-muted)]')}>
            {formatDateShort(item.publish_date)}
          </span>
        )}
      </div>
    </article>
  )
}
