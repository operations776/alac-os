import "server-only";

import { opsQuery } from "@/lib/server/db";

// Where the desk and the operations board meet. One company is one company in
// both when the GTM account's external_id is the desk's Record ID. That column
// carries a unique index, so the join can never fork a company, and a name is
// never used to match. ARCHITECTURE.md section 11.

export type GtmLink = { id: string; stage: string; owner_name: string | null };

/** The GTM account already working this desk company, if any. */
export async function gtmForRecord(recordId: string): Promise<GtmLink | null> {
  const [row] = await opsQuery<GtmLink>(
    `select g.id, g.stage::text as stage, p.name as owner_name
       from mc.gtm_accounts g
       left join mc.people p on p.id = g.owner_id
      where g.external_id = $1
      limit 1`,
    [recordId],
  );
  return row ?? null;
}
