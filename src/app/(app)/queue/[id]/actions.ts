"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

/**
 * Reveal one person's work email.
 *
 * Costs one Prospeo credit per email found, nothing when there is no match, and
 * nothing at all if the same person was enriched in the last 90 days. That is
 * why this is a per person button rather than a bulk job: revealing 25 people
 * on an account nobody has decided to work is 25 credits spent on a maybe.
 *
 * The target id comes from the form, so it is checked against the caller's org
 * before anything is fetched. Tenant scoping is an argument, and a server
 * action is exactly where forgetting that turns into one org reading another's
 * contacts.
 */
export async function revealEmail(
  _prev: { ok: boolean; email?: string | null; error?: string | null },
  formData: FormData,
): Promise<{ ok: boolean; email?: string | null; error?: string | null }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  const targetId = String(formData.get("targetId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return { ok: false, error: "Bad target" };

  const rows = (await sql`
    select id, full_name, linkedin_url, email, email_revealed, account_id
      from account_targets
     where org_id = ${orgId} and id = ${targetId}
     limit 1
  `) as {
    id: string;
    full_name: string;
    linkedin_url: string | null;
    email: string | null;
    email_revealed: boolean;
    account_id: string;
  }[];

  const target = rows[0];
  if (!target) return { ok: false, error: "Not found" };

  // Already revealed. Return what is stored rather than paying again.
  if (target.email_revealed && target.email) {
    return { ok: true, email: target.email };
  }
  if (!target.linkedin_url) {
    return { ok: false, error: "No LinkedIn profile to look up" };
  }

  const key = process.env.PROSPEO_API_KEY;
  if (!key) return { ok: false, error: "Contact lookup is not configured" };

  let res: Response;
  try {
    res = await fetch("https://api.prospeo.io/enrich-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": key },
      body: JSON.stringify({ data: { linkedin_url: target.linkedin_url } }),
    });
  } catch {
    return { ok: false, error: "Lookup service unreachable" };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    // The upstream message can name the vendor and its error codes, which means
    // nothing to the person clicking. It is logged, not shown.
    console.error("[revealEmail]", json?.error_code ?? res.status);
    return { ok: false, error: "Could not find an address" };
  }

  const e = json?.person?.email;
  const email = e?.revealed ? (e.email ?? null) : null;

  if (!email) {
    // Record that the attempt happened so the button can stop offering. Nothing
    // was charged, and saying "none found" is more useful than an empty retry.
    await sql`
      update account_targets
         set email_status = ${e?.status ?? "NONE"}, email_revealed = false
       where org_id = ${orgId} and id = ${targetId}
    `;
    return { ok: false, error: "No verified address on file" };
  }

  await sql`
    update account_targets
       set email = ${email},
           email_status = ${e?.status ?? "VERIFIED"},
           email_revealed = true
     where org_id = ${orgId} and id = ${targetId}
  `;

  // Refresh the account page so the address shows for everyone, not just the
  // person who clicked. There is no open dialog here, so revalidating is safe:
  // the known bug class is revalidating underneath a layer holding typed input.
  revalidatePath(`/queue/${target.account_id}`);

  return { ok: true, email };
}
