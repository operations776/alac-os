"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

/** The metrics that can be counted by hand. Anything else is rejected. */
const METRICS = new Set([
  "bd_calls",
  "client_conversations",
  "discoveries",
  "qualified_opps",
  "commercial_asks",
  "searches_won",
  "placements",
]);

/**
 * The Monday of the current week, as yyyy-mm-dd.
 *
 * Every click has to land in exactly one bucket, so the week is derived here
 * rather than sent from the browser. A date from the client would put a
 * counter in a different week depending on the reader's timezone, and two
 * people could then increment two different rows for the same Tuesday.
 */
function currentWeekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  // getUTCDay is 0 for Sunday, so Sunday belongs to the week that began six
  // days earlier rather than starting a new one.
  const back = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Add or subtract one from a counter.
 *
 * Written as a single upsert with the arithmetic in SQL rather than read,
 * add, write. Two people clicking at the same moment would otherwise both read
 * 4, both write 5, and one click would vanish. `greatest(...,0)` holds the
 * floor at zero inside the same statement, so it cannot be raced either.
 */
export async function adjustMetric(
  _prev: { ok: boolean; value?: number; error?: string | null },
  formData: FormData,
): Promise<{ ok: boolean; value?: number; error?: string | null }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  const metric = String(formData.get("metric") ?? "");
  if (!METRICS.has(metric)) return { ok: false, error: "Unknown metric" };

  const delta = Number(formData.get("delta"));
  // Only single steps. A free number here would let a crafted request set the
  // counter to anything, and the control only ever sends 1 or -1.
  if (delta !== 1 && delta !== -1) return { ok: false, error: "Bad step" };

  const week = currentWeekStart();

  const rows = (await sql`
    insert into manual_metrics (org_id, week_starting, metric, value)
    values (${orgId}, ${week}, ${metric}, greatest(${delta}, 0))
    on conflict (org_id, week_starting, metric) do update
      set value = greatest(manual_metrics.value + ${delta}, 0),
          updated_at = now()
    returning value
  `) as { value: number }[];

  revalidatePath("/performance");
  revalidatePath("/command");

  return { ok: true, value: rows[0]?.value ?? 0 };
}
