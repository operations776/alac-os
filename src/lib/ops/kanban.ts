/**
 * The one way a card changes column.
 *
 * Every board previously had its own copy of the drag handler. They agreed by
 * accident rather than by construction, and a fix applied to one did not reach
 * the others, which is how an empty-column drop target stayed broken on two
 * boards after being found on the first.
 *
 * This module owns the whole contract:
 *
 *   - which field defines the column (one per board, named here)
 *   - how a droppable id becomes a stage
 *   - what happens optimistically, and when that ends
 *   - what happens when the server disagrees
 *
 * The rule the boards must satisfy: where a card is dropped is where it stays,
 * unless the write genuinely failed, in which case it returns and says why.
 */
'use client'

import { startTransition, useCallback, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { DragEndEvent } from '@dnd-kit/core'

/** The house ease, shared by the drop animation and a refused card's return. */
export const MOVE_EASE = 'cubic-bezier(0.2, 0, 0, 1)'
export const MOVE_MS = 200

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Put refused cards back where they came from, visibly.
 *
 * `commit` moves them in the DOM synchronously. Each card's rect is read
 * before and after, and a fixed-position copy travels the difference while the
 * real card waits hidden. A copy rather than a transform on the card itself,
 * because the columns scroll and would clip a card sliding in from next door.
 * Cards are found by the `data-card` attribute DragCard puts on them.
 */
function returnHome(ids: string[], commit: () => void) {
  const find = (id: string) =>
    document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
  const before = ids.map((id) => [id, find(id)?.getBoundingClientRect()] as const)
  commit()
  if (prefersReducedMotion()) return

  for (const [id, from] of before) {
    const node = find(id)
    if (!node || !from) continue
    const to = node.getBoundingClientRect()
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (!dx && !dy) continue

    const ghost = node.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-card')
    ghost.inert = true
    Object.assign(ghost.style, {
      position: 'fixed', left: `${to.left}px`, top: `${to.top}px`,
      width: `${to.width}px`, height: `${to.height}px`,
      margin: '0', zIndex: '999', pointerEvents: 'none',
    })
    document.body.appendChild(ghost)
    node.style.visibility = 'hidden'
    ghost.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: MOVE_MS, easing: MOVE_EASE },
    ).finished.finally(() => { ghost.remove(); node.style.visibility = '' })
  }
}

/** A record that lives in a column. */
export interface Movable {
  id: string
}

export interface MoveResult {
  ok: boolean
  error?: string
}

/**
 * Drive one board's drag-and-drop.
 *
 * `field` names the single property that determines the column, so the
 * grouping logic and the mutation can never read different things.
 */
export function useKanban<T extends Movable, S extends string>({
  rows,
  field,
  stages,
  save,
  saveMany,
  selectedIds,
  onMovedSelection,
}: {
  rows: T[]
  field: keyof T
  /** Valid destinations. A drop resolving to anything else is refused. */
  stages: readonly S[]
  save: (id: string, stage: S) => Promise<MoveResult>
  /**
   * Move a whole group in ONE server action.
   *
   * Next dispatches Server Actions one at a time per client, so a
   * `Promise.all` of single-card saves is not parallel, the later calls
   * queue behind the first and its revalidation, and in practice some never
   * landed. The framework's own guidance is to do the parallel work inside a
   * single action, which is what this is. A board without it can still select
   * cards; the group simply moves one card at a time.
   */
  saveMany?: (ids: string[], stage: S) => Promise<MoveResult>
  /**
   * Cards selected right now, if the board offers selection.
   *
   * Dragging one of them moves all of them: having ticked five cards, the
   * expectation is that dragging one carries the set. Dragging an unselected
   * card moves only that card, so a selection left on screen cannot make an
   * ordinary drag do something unexpected.
   */
  selectedIds?: Set<string>
  /** Called once the group has moved, so the board can clear its ticks. */
  onMovedSelection?: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState<Record<string, S>>({})
  const [error, setError] = useState<string | null>(null)

  // Guards against a slow earlier response landing after a newer move and
  // reinstating the older column (Phase 26).
  const seq = useRef<Record<string, number>>({})

  /**
   * What the board renders.
   *
   * An optimistic entry applies only while the server still disagrees. Once
   * the saved value matches, it is ignored rather than stored, so a stale
   * entry can never pin a card to an old column.
   */
  const view = useMemo(
    () => rows.map((r) => {
      const want = pending[r.id]
      return want && want !== r[field] ? { ...r, [field]: want } : r
    }),
    [rows, pending, field],
  )

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setError(null)

    const id = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null
    // Phase 30: released outside a column. Nothing happens, nothing is written.
    if (!overId) return

    // Droppable ids may be "<lane>::<stage>" on a swimlane board.
    const to = overId.split('::').pop() as S

    // Phase 5: an unrecognised destination is refused outright rather than
    // being coerced into some default column.
    if (!stages.includes(to)) {
      setError(`"${to}" is not a column on this board.`)
      return
    }

    const row = view.find((r) => r.id === id)
    if (!row) return

    // Dragging a selected card carries the whole selection; dragging an
    // unselected one moves just it.
    const group = selectedIds?.has(id)
      ? view.filter((r) => selectedIds.has(r.id) && r[field] !== to).map((r) => r.id)
      : row[field] === to ? [] : [id]
    if (!group.length) return

    const tickets: Record<string, number> = {}
    for (const gid of group) {
      tickets[gid] = (seq.current[gid] ?? 0) + 1
      seq.current[gid] = tickets[gid]
    }
    setPending((p) => {
      const next = { ...p }
      for (const gid of group) next[gid] = to
      return next
    })

    startTransition(async () => {
      // One action for the group where the board provides one. Otherwise the
      // moves go sequentially, slower, but never silently dropped.
      let r: MoveResult = { ok: true }
      if (group.length > 1 && saveMany) {
        r = await saveMany(group, to)
      } else {
        for (const gid of group) {
          const one = await save(gid, to)
          if (!one.ok) { r = one; break }
        }
      }
      // A newer move for a card started while this one was in flight: leave
      // its optimistic entry alone, this response is obsolete for it.
      const live = group.filter((gid) => seq.current[gid] === tickets[gid])
      const settle = () => setPending((p) => {
        const n = { ...p }
        for (const gid of live) delete n[gid]
        return n
      })

      if (r.ok) {
        if (group.length > 1) onMovedSelection?.()
        // The entry is cleared in the SAME transition as the refresh, so the
        // card holds its new column until the refreshed rows commit with it.
        // Clearing it first (as this did) showed the stale rows for a round
        // trip: the card snapped back to its old column, then jumped again.
        startTransition(() => { settle(); router.refresh() })
      } else {
        // Refused: back at once, animated, with the reason.
        returnHome(live, () => flushSync(settle))
        setError(r.error ?? 'That move could not be saved.')
        startTransition(() => router.refresh())
      }
    })
  }, [view, field, stages, save, saveMany, router, selectedIds, onMovedSelection])

  return {
    /** Rows with any in-flight move applied. */
    view,
    onDragEnd,
    error,
    dismissError: () => setError(null),
    isMoving: Object.keys(pending).length > 0,
  }
}
