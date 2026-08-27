"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { normCompany } from "@/lib/server/import/normalize.mjs";

export type AddState = { error?: string | null };

/** A bare domain from whatever was typed: a URL, a host, or a slug. */
function cleanDomain(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

/**
 * Add a company that is not in the TAM.
 *
 * It lands in Up next straight away so it is visible and worked, and the next
 * refresh pulls its signals and roles and re-ranks it with everyone else.
 * Priority and final score stay empty: those are the master list's to set.
 */
export async function addCompany(_prev: AddState, formData: FormData): Promise<AddState> {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Not signed in" };

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const linkedin = String(formData.get("linkedin") ?? "").trim().slice(0, 300) || null;
  const hq = String(formData.get("hq") ?? "").trim().slice(0, 200) || null;
  const rawDomain = String(formData.get("domain") ?? "");
  const domain = rawDomain.trim() ? cleanDomain(rawDomain) : null;
  if (!name) return { error: "The company needs a name" };
  if (rawDomain.trim() && !domain) return { error: "That does not look like a domain. Try acme.com" };
  if (linkedin && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedin)) {
    return { error: "The LinkedIn link should start with linkedin.com" };
  }

  const norm = normCompany(name);
  const existing = (await sql`
    select id from tam_accounts
     where org_id = ${orgId} and (norm_name = ${norm} or (${domain}::text is not null and domain = ${domain}))
     limit 1
  `) as { id: string }[];
  if (existing[0]) redirect(`/queue/${existing[0].id}`);

  // MAN-<n>, counted rather than random, so the id reads as a hand-added row
  // in the workbook if it is ever exported back.
  const rows = (await sql`
    insert into tam_accounts
      (org_id, record_id, company_name, norm_name, linkedin_url, domain, domain_source, hq,
       work_band, work_reason, work_score, banded_at)
    values
      (${orgId},
       'MAN-' || (select count(*) + 1 from tam_accounts where org_id = ${orgId} and record_id like 'MAN-%'),
       ${name}, ${norm}, ${linkedin}, ${domain}, ${domain ? "manual" : null}, ${hq},
       'next', 'Added by hand. The next refresh pulls its signals and roles and ranks it.', 50, now())
    returning id
  `) as { id: string }[];

  revalidatePath("/queue");
  revalidatePath("/targets");
  revalidatePath("/command");
  redirect(`/queue/${rows[0].id}`);
}
