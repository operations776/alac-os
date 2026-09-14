/**
 * Drawer state plus lazy loading of a task's checklist and comments.
 *
 * The drawer's sub-resources are fetched, not passed down, so the board does
 * not carry every comment thread. That means a mutation inside the drawer has
 * to explicitly reload them, `router.refresh()` re-renders the page but does
 * nothing for a client-side fetch.
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import type { DrawerData } from './task-drawer'
import type { TaskRow } from '@/types/ops'

const EMPTY: DrawerData = { checklist: [], comments: [], activity: [], collaborators: [] }

export function useDrawer() {
  const [task, setTask] = useState<TaskRow | null>(null)
  const [data, setData] = useState<DrawerData | null>(null)
  // Tracks which task the newest request belongs to, so a slow response for a
  // task the user already closed cannot overwrite the current one.
  const current = useRef<string | null>(null)

  const load = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = (await res.json()) as DrawerData
      if (current.current === id) setData(payload)
    } catch {
      /* the drawer still renders from the row it was opened with */
    }
  }, [])

  const open = useCallback((next: TaskRow) => {
    current.current = next.id
    setTask(next)
    setData(EMPTY)
    void load(next.id)
  }, [load])

  /** Re-read after adding a checklist item, a comment, or any sub-resource. */
  const reload = useCallback(() => {
    if (current.current) void load(current.current)
  }, [load])

  const close = useCallback(() => {
    current.current = null
    setTask(null)
    setData(null)
  }, [])

  return { task, data, open, reload, close }
}
