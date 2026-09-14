/**
 * One way to save an editable field.
 *
 * Every inline-save form in the app had written its own version of this, and
 * they had all made the same two mistakes:
 *
 *   1. The action's result was awaited and then thrown away, so the "Saved"
 *      flash appeared whether or not the write succeeded. A field could
 *      report success and hold nothing.
 *
 *   2. Nothing tracked whether a write was still in flight, so a slow save
 *      landing after a newer one could not be detected.
 *
 * This hook owns both. A field calls `save(...)`, and gets back a status it
 * can render honestly: idle, saving, saved, or an error with the reason. Only
 * a confirmed `{ ok: true }` from the server produces "Saved".
 *
 * Every editable control in the app goes through this, so a new field added
 * later inherits the same guarantees without repeating the plumbing.
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface SaveResult { ok: boolean; error?: string }

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string }

export function useSave(opts: { onSaved?: () => void } = {}) {
  const router = useRouter()
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })

  // Each save takes a ticket. A response whose ticket is no longer the newest
  // is stale, its result must not overwrite the status of a later write.
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (
    run: () => Promise<SaveResult | void>,
  ): Promise<boolean> => {
    const ticket = ++seq.current
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setStatus({ state: 'saving' })

    let result: SaveResult
    try {
      // A void-returning action is treated as success: it had no result to
      // report, and throwing is how it signals failure.
      result = (await run()) ?? { ok: true }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : 'Save failed' }
    }

    // A newer save started while this one was in flight. Its outcome owns the
    // status; this one is history.
    if (seq.current !== ticket) return result.ok

    if (!result.ok) {
      setStatus({
        state: 'error',
        message: result.error || 'That did not save. Your change is still here, try again.',
      })
      return false
    }

    setStatus({ state: 'saved' })
    timer.current = setTimeout(() => {
      // Only clear the flash if nothing newer has happened since.
      if (seq.current === ticket) setStatus({ state: 'idle' })
    }, 1600)

    opts.onSaved?.()
    router.refresh()
    return true
  }, [router, opts])

  const clearError = useCallback(() => setStatus({ state: 'idle' }), [])

  return {
    save,
    status,
    /** True while a write is in flight, for disabling a submit button. */
    saving: status.state === 'saving',
    /** Set only when the server confirmed the write. */
    saved: status.state === 'saved',
    error: status.state === 'error' ? status.message : null,
    clearError,
  }
}
