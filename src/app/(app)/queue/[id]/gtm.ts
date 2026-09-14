"use server";

import { redirect } from "next/navigation";
import { sql, asPerson } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { requirePerson } from "@/lib/server/ops/context";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Start GTM execution on a desk company: the hand off from deciding to doing.
 *
 * Upserts on external_id = Record ID, so pressing it twice, or from two tabs,
 * lands on the same GTM account. The account's external_url points back at
 * the desk page, so the GTM screen links home. Insert triggers still fire
 * (company_for, activity, the target-added notification) because this goes
 * through asPerson like any other ops write.
 */
export async function startGtm(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  const accountId = String(formData.get("accountId") ?? "");
  if (!orgId || !UUID.test(accountId)) return;
  const { me } = await requirePerson("member");

  const [a] = (await sql`
    select record_id, company_name, domain
      from tam_accounts
     where org_id = ${orgId} and id = ${accountId}
  `) as { record_id: string; company_name: string; domain: string | null }[];
  if (!a) return;

  const id = await asPerson(me.id, async (q) => {
    const [created] = await q<{ id: string }>(
      `insert into mc.gtm_accounts (company, website, external_id, external_url, owner_id, created_by, signal_source)
       values ($1, $2, $3, $4, $5, $5, 'Desk')
       on conflict (external_id) where external_id is not null do nothing
       returning id`,
      [a.company_name, a.domain ? `https://${a.domain.replace(/^https?:\/\//, "")}` : null, a.record_id, `/queue/${accountId}`, me.id],
    );
    if (created) return created.id;
    const [existing] = await q<{ id: string }>(`select id from mc.gtm_accounts where external_id = $1`, [a.record_id]);
    return existing.id;
  });

  redirect(`/gtm/${id}`);
}
