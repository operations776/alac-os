"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { levelOf } from "@/lib/scoring/match.mjs";

// Analyze Candidate, section 19.1. Paste a profile, get a classified
// candidate that the Demand Radar can search with.
//
// The classification is deterministic string work rather than a model call:
// it is free, instant, and every field it fills is one the producer can see
// and correct. The brief asks for owner refinement regardless.

export type CandidateState = { error?: string | null };

/** Pull what we can out of pasted profile text. Everything is editable after. */
function classify(text: string) {
  const t = text.toLowerCase();

  const clearance =
    /\bts\/?sci\b|top secret/.test(t) ? "TS/SCI"
    : /\bpoly(graph)?\b/.test(t) ? "Polygraph"
    : /\bsecret\b/.test(t) ? "Secret"
    : /\bclearance|cleared\b/.test(t) ? "Clearance held"
    : null;

  const DOMAINS = [
    "uas", "uav", "drone", "loitering munition", "autonomy", "isr", "gnc",
    "avionics", "propulsion", "hypersonic", "radar", "electronic warfare",
    "rf", "satellite", "space", "maritime", "submarine", "navy", "navsea",
    "navair", "socom", "army", "air force", "marine corps", "dod", "defense",
    "robotics", "manufacturing", "embedded", "flight software",
  ];
  const domains = DOMAINS.filter((d) => t.includes(d));

  return { clearance, domains: domains.join(", ") || null };
}

/**
 * Marketability, out of 100. Separate from candidate quality on purpose:
 * a strong engineer with no clearance in a cleared market is a good candidate
 * and a weak MPC.
 */
function mpcScore(c: {
  title: string | null; clearance: string | null; domains: string | null;
  summary: string | null; transcript?: string | null;
}) {
  let s = 40;
  const lvl = levelOf(c.title ?? "");
  s += lvl.rank * 8;
  if (c.clearance) s += 15;
  const domainCount = (c.domains ?? "").split(",").filter(Boolean).length;
  s += Math.min(15, domainCount * 5);
  if ((c.summary ?? "").length > 400) s += 5;
  // A screened candidate is a more marketable one: you know what they want
  // and can answer a client's questions without going back to them.
  if ((c.transcript ?? "").length > 200) s += 5;
  return Math.max(0, Math.min(100, s));
}

export async function addCandidate(_prev: CandidateState, formData: FormData): Promise<CandidateState> {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Not signed in" };

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: "The candidate needs a name" };

  const summary = String(formData.get("summary") ?? "").trim().slice(0, 20000);
  // A call runs long, so the cap is generous. It is evidence, kept whole.
  const transcript = String(formData.get("transcript") ?? "").trim().slice(0, 200000);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || null;
  const company = String(formData.get("company") ?? "").trim().slice(0, 200) || null;
  const geography = String(formData.get("geography") ?? "").trim().slice(0, 200) || null;
  const linkedin = String(formData.get("linkedin") ?? "").trim().slice(0, 300) || null;
  const comp = String(formData.get("comp") ?? "").trim().slice(0, 100) || null;

  // The transcript is read by the classifier too: a clearance or a programme
  // is usually said on the call and written down nowhere else.
  const auto = classify(`${title ?? ""} ${summary} ${transcript}`);
  const clearance = String(formData.get("clearance") ?? "").trim().slice(0, 100) || auto.clearance;
  const domains = String(formData.get("domains") ?? "").trim().slice(0, 500) || auto.domains;

  const score = mpcScore({ title, clearance, domains, summary, transcript });

  const rows = (await sql`
    insert into candidates
      (org_id, full_name, title, company, location, linkedin_url, summary,
       domains, geography, clearance, comp_target, mpc_score,
       transcript, transcript_at)
    values
      (${orgId}, ${name}, ${title}, ${company}, ${geography}, ${linkedin}, ${summary || null},
       ${domains}, ${geography}, ${clearance}, ${comp}, ${score},
       ${transcript || null}, ${transcript ? new Date().toISOString() : null})
    returning id
  `) as { id: string }[];

  revalidatePath("/talent");
  redirect(`/talent/${rows[0].id}`);
}


/**
 * Take a candidate off the market.
 *
 * Nothing is deleted. The row keeps its classification, its score and every
 * role it was pitched for; it leaves the Talent list and the radar, and one
 * click puts it back. A placed candidate is a record worth keeping.
 */
export async function deactivateCandidate(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("candidateId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 120) || null;

  await sql`
    update candidates
       set active = false, inactive_reason = ${reason}, deactivated_at = now(), updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidatePath("/talent");
  revalidatePath(`/talent/${id}`);
}

/** Put a candidate back on the market, exactly as they were. */
export async function reactivateCandidate(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("candidateId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  await sql`
    update candidates
       set active = true, inactive_reason = null, deactivated_at = null, updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidatePath("/talent");
  revalidatePath(`/talent/${id}`);
}

/**
 * Correct what the classifier read.
 *
 * The brief asks for owner refinement regardless of what classification
 * decided, and until now the only way to fix a wrong title or a missed
 * clearance was to add the candidate again. Every field the parser fills is
 * editable here, and the marketability score is recomputed from the result
 * so it cannot drift from what the fields say.
 */
export async function updateCandidate(_prev: CandidateState, formData: FormData): Promise<CandidateState> {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Not signed in" };
  const id = String(formData.get("candidateId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Bad candidate" };

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: "The candidate needs a name" };

  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || null;
  const company = String(formData.get("company") ?? "").trim().slice(0, 200) || null;
  const geography = String(formData.get("geography") ?? "").trim().slice(0, 200) || null;
  const linkedin = String(formData.get("linkedin") ?? "").trim().slice(0, 300) || null;
  const clearance = String(formData.get("clearance") ?? "").trim().slice(0, 100) || null;
  const domains = String(formData.get("domains") ?? "").trim().slice(0, 500) || null;
  const comp = String(formData.get("comp") ?? "").trim().slice(0, 100) || null;
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 20000) || null;
  const transcript = String(formData.get("transcript") ?? "").trim().slice(0, 200000) || null;

  const score = mpcScore({ title, clearance, domains, summary, transcript });

  await sql`
    update candidates
       set full_name = ${name}, title = ${title}, company = ${company},
           location = ${geography}, geography = ${geography},
           linkedin_url = ${linkedin}, clearance = ${clearance},
           domains = ${domains}, comp_target = ${comp},
           summary = coalesce(${summary}, summary),
           transcript = coalesce(${transcript}, transcript),
           transcript_at = case
             when ${transcript}::text is null then transcript_at
             when ${transcript}::text is distinct from transcript then now()
             else transcript_at end,
           mpc_score = ${score}, updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidatePath("/talent");
  revalidatePath(`/talent/${id}`);
  return {};
}

/** Record that a role was raised with the client for this candidate. */
export async function togglePitch(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const candidateId = String(formData.get("candidateId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const on = String(formData.get("on") ?? "1") === "1";
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(candidateId) || !uuid.test(roleId)) return;

  if (on) {
    await sql`
      insert into candidate_pitches (org_id, candidate_id, role_id)
      values (${orgId}, ${candidateId}, ${roleId})
      on conflict do nothing
    `;
  } else {
    await sql`
      delete from candidate_pitches
       where org_id = ${orgId} and candidate_id = ${candidateId} and role_id = ${roleId}
    `;
  }
  revalidatePath(`/talent/${candidateId}`);
}
