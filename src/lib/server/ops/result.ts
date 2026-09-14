import "server-only";

import { revalidatePath } from "next/cache";

// Conventions carried from Mission Control, each one a fix for silent data
// loss there. Keep them on every ops write path.

export type Result<T = void> =
  | { ok: true; data?: T }
  // A failure can carry context: a capacity refusal names the stage that was
  // full so the interface can offer the right choices.
  | { ok: false; error: string; data?: Record<string, unknown> };

/**
 * Did that write change a row? An UPDATE or DELETE matching nothing is not a
 * Postgres error, so without this a write against a deleted row reports
 * "Saved" having changed nothing. Pass the rows a `returning` gave back.
 */
export function wrote(
  rows: unknown[] | null | undefined,
  noun = "record",
): { ok: true } | { ok: false; error: string } {
  if (rows?.length) return { ok: true };
  return {
    ok: false,
    error: `That ${noun} could not be updated. It may have been deleted, or you may not have permission.`,
  };
}

/** Anything thrown, as a sentence a person can act on. pg errors carry detail and hint. */
export function fail(e: unknown): { ok: false; error: string } {
  if (e && typeof e === "object") {
    const err = e as { message?: string; detail?: string; hint?: string; code?: string };
    const parts = [err.message, err.detail, err.hint].filter(Boolean);
    if (parts.length) return { ok: false, error: parts.join(". ") };
    if (err.code) return { ok: false, error: `Database error ${err.code}` };
  }
  return { ok: false, error: "Something went wrong. Try again." };
}

/** Anything that shows work state goes stale on a task change. */
export function refresh(projectId?: string | null) {
  revalidatePath("/ops");
  revalidatePath("/my-work");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/**
 * Nudge Slack delivery after a write that may have queued a message. Vercel
 * Hobby runs cron once a day, too slow for a ping. Fire and forget: a failed
 * nudge is caught by the daily cron, and delivery never blocks the board.
 */
export async function flushSlack(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/cron/slack`, {
      headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    // The daily cron picks it up.
  }
}

/**
 * Build `set a = $n, b = $n+1` from a patch, so a partial update writes only
 * the fields the caller sent. A server action's argument is a request body, so
 * the keys are checked against the columns that action may write: under
 * Supabase a patch could name any column, and this is where that stops.
 */
export function setClause(patch: Record<string, unknown>, allowed: readonly string[], start = 1) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  for (const k of keys) if (!allowed.includes(k)) throw new Error(`${k} cannot be changed here.`);
  return {
    sql: keys.map((k, i) => `${k} = $${start + i}`).join(", "),
    values: keys.map((k) => patch[k]),
    empty: keys.length === 0,
  };
}
