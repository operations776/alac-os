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
function mpcScore(c: { title: string | null; clearance: string | null; domains: string | null; summary: string | null }) {
  let s = 40;
  const lvl = levelOf(c.title ?? "");
  s += lvl.rank * 8;
  if (c.clearance) s += 15;
  const domainCount = (c.domains ?? "").split(",").filter(Boolean).length;
  s += Math.min(15, domainCount * 5);
  if ((c.summary ?? "").length > 400) s += 5;
  return Math.max(0, Math.min(100, s));
}

export async function addCandidate(_prev: CandidateState, formData: FormData): Promise<CandidateState> {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Not signed in" };

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: "The candidate needs a name" };

  const summary = String(formData.get("summary") ?? "").trim().slice(0, 20000);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || null;
  const company = String(formData.get("company") ?? "").trim().slice(0, 200) || null;
  const geography = String(formData.get("geography") ?? "").trim().slice(0, 200) || null;
  const linkedin = String(formData.get("linkedin") ?? "").trim().slice(0, 300) || null;
  const comp = String(formData.get("comp") ?? "").trim().slice(0, 100) || null;

  const auto = classify(`${title ?? ""} ${summary}`);
  const clearance = String(formData.get("clearance") ?? "").trim().slice(0, 100) || auto.clearance;
  const domains = String(formData.get("domains") ?? "").trim().slice(0, 500) || auto.domains;

  const score = mpcScore({ title, clearance, domains, summary });

  const rows = (await sql`
    insert into candidates
      (org_id, full_name, title, company, location, linkedin_url, summary,
       domains, geography, clearance, comp_target, mpc_score)
    values
      (${orgId}, ${name}, ${title}, ${company}, ${geography}, ${linkedin}, ${summary || null},
       ${domains}, ${geography}, ${clearance}, ${comp}, ${score})
    returning id
  `) as { id: string }[];

  revalidatePath("/talent");
  redirect(`/talent/${rows[0].id}`);
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
