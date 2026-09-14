/**
 * The drag surface every board shares.
 *
 * Each board used to wire dnd-kit by hand, and all of them had the same
 * faults: the lifted overlay vanished on drop instead of landing, the source
 * card never faded (its `.dragging` class had no CSS behind it), columns never
 * lit up (nor did `.drop-target`), and the overlay was a fixed width, so a card
 * visibly resized the moment it was picked up. The column logic itself lives
 * in `useKanban`; this is only what the pointer sees.
 */
'use client'

import {
  useLayoutEffect, useRef, useState, useSyncExternalStore,
  type HTMLAttributes, type ReactNode,
} from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, defaultDropAnimationSideEffects,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DropAnimation,
} from '@dnd-kit/core'
import { MOVE_EASE, MOVE_MS, prefersReducedMotion } from '@/lib/ops/kanban'
import { cn } from '@/lib/ops/utils'

const LIFT = 'scale(1.03)'
const SHADOW = '0 14px 32px -10px rgb(0 0 0 / 0.45)'
const FLAT = '0 0 0 0 rgb(0 0 0 / 0)'

/**
 * The column under the pointer, so the highlight follows the hand rather than
 * the middle of a card held off-centre. Keyboard drags have no pointer, and
 * the gap between columns has no column, so both fall back to overlap.
 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

/**
 * The overlay lands on the card's new home (the column move is already
 * committed by the time this runs) and settles from lifted to flat on the
 * way. The real card stays invisible until the overlay arrives.
 */
const drop: DropAnimation = {
  duration: MOVE_MS,
  easing: MOVE_EASE,
  sideEffects: (args) => {
    const cleanup = defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } })(args)
    ;(args.dragOverlay.node.firstElementChild as HTMLElement | null)?.animate(
      [{ transform: LIFT, boxShadow: SHADOW }, { transform: 'none', boxShadow: FLAT }],
      { duration: MOVE_MS, easing: MOVE_EASE, fill: 'forwards' },
    )
    return cleanup
  },
}

const noop = () => () => {}
function useReducedMotion() {
  return useSyncExternalStore(noop, prefersReducedMotion, () => false)
}

export function BoardDnd({
  id, onDragEnd, overlay, children,
}: {
  id: string
  onDragEnd: (e: DragEndEvent) => void
  /** The card to lift, looked up by id from the board's own rows. */
  overlay: (id: string) => ReactNode
  children: ReactNode
}) {
  const [active, setActive] = useState<string | null>(null)
  const reduced = useReducedMotion()
  // 6px of travel before a drag starts, so a click still opens the card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setActive(String(e.active.id))}
      onDragEnd={(e) => { setActive(null); onDragEnd(e) }}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={reduced ? null : drop}>
        {active && <Lifted reduced={reduced}>{overlay(active)}</Lifted>}
      </DragOverlay>
    </DndContext>
  )
}

/** The card in hand: the source card's exact size, raised a little. */
function Lifted({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (reduced) return
    ref.current?.animate(
      [{ transform: 'none', boxShadow: FLAT }, { transform: LIFT, boxShadow: SHADOW }],
      { duration: 150, easing: MOVE_EASE },
    )
  }, [reduced])
  return (
    <div ref={ref} className="cursor-grabbing rounded-md"
         style={{ transform: LIFT, boxShadow: SHADOW }}>
      {children}
    </div>
  )
}

/** A column's card area. Lights up while a card is over it. */
export function DropColumn({
  id, className, children, ...rest
}: { id: string } & HTMLAttributes<HTMLDivElement>) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      data-column={id}
      {...rest}
      className={cn(
        className,
        'transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
        isOver && 'bg-brand-50 shadow-[inset_0_0_0_1px_var(--color-brand-500)]',
      )}
    >
      {children}
    </div>
  )
}

/** A card that can be picked up. It stays behind, faded, while it is in hand. */
export function DragCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div ref={setNodeRef} data-card={id} {...listeners} {...attributes}
         className={cn('rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                       isDragging && 'opacity-40')}>
      {children}
    </div>
  )
}

/** Why a move was refused. Without it the card returns and the board looks broken. */
export function MoveError({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="mb-2 flex items-start justify-between gap-3 rounded-[3px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-[3px] px-1 font-medium hover:underline"
      >
        Dismiss
      </button>
    </div>
  )
}
