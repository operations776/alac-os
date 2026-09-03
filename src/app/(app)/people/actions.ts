"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { parseCsvObjects, normCompany } from "@/lib/server/import/normalize.mjs";
import { laneOf } from "@/lib/scoring/personas.mjs";

// Section 18: the network is added to by hand and by CSV, deduped, and
// matched to accounts by normalised company name. Nothing here invents a
// person: an unmatched company stays unmatched rather than being guessed at.

export type PeopleState = {
  ok?: boolean;
  error?: string | null;
  added?: number;
  updated?: number;
  matched?: number;
  skipped?: number;
  unmatched?: string[];
};

/** The column names a real export uses, mapped to what we store. */
const FIELDS: Record<string, string[]> = {
  full_name: ["full name", "name", "fullname"],
  first_name: ["first name", "firstname", "given name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  title: ["title", "position", "job title", "role", "headline"],
  company: ["company", "company name", "organisation", "organization", "employer", "current company"],
  linkedin_url: ["linkedin url", "linkedin", "profile url", "url", "linkedin profile"],
  email: ["email", "email address", "e-mail", "work email"],
  notes: ["about", "aboutme", "about me", "notes", "note", "summary", "relationship"],
  connected_on: ["connected on", "connected", "date connected"],
};

function pick(row: Record<string, string>, field: string): string | null {
  const keys = FIELDS[field] ?? [field];
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (keys.includes(norm)) {
      const v = String(row[k] ?? "").trim();
      if (v) return v;
    }
  }
  return null;
}

/** A LinkedIn URL without its tracking tail, for deduping. */
function cleanLinkedIn(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().split("?")[0].replace(/\/+$/, "");
  return /linkedin\.com\//.test(s) ? (s.startsWith("http") ? s : `https://${s}`) : null;
}

/**
 * A decision maker by title. Section 18 wants access weighted by whether the
 * person owns the problem, and the title is the only evidence we hold.
 */
function isDecisionMaker(title: string | null): boolean {
  if (!title) return false;
  const lane = laneOf(title);
  return lane === "executive" || lane === "functional" || lane === "hiring_leader" || lane === "talent";
}

type Incoming = {
  full_name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  email: string | null;
  notes: string | null;
  connected_on: string | null;
};

/** Write people, matching each to an account by normalised company name. */
async function writePeople(orgId: string, rows: Incoming[]): Promise<PeopleState> {
  if (rows.length === 0) return { ok: false, error: "Nothing to import" };

  // Every account's normalised name, so matching is one pass in memory rather
  // than a query per person.
  const accounts = (await sql`
    select id, norm_name from tam_accounts where org_id = ${orgId}
  `) as { id: string; norm_name: string }[];
  const byName = new Map(accounts.map((a) => [a.norm_name, a.id]));

  let added = 0;
  let updated = 0;
  let matched = 0;
  const unmatched = new Set<string>();

  for (const r of rows) {
    const norm = r.company ? normCompany(r.company) : null;
    const accountId = norm ? byName.get(norm) ?? null : null;
    if (r.company && !accountId) unmatched.add(r.company);
    if (accountId) matched += 1;

    // Dedupe on the LinkedIn URL where there is one, otherwise on name plus
    // company. A unique index would be better, but the existing table has
    // neither, and adding one would reject the rows already in there.
    const existing = (await sql`
      select id from people
       where org_id = ${orgId}
         and (
           (${r.linkedin_url}::text is not null and linkedin_url = ${r.linkedin_url})
           or (${r.linkedin_url}::text is null
               and lower(full_name) = lower(${r.full_name})
               and coalesce(lower(company_text), '') = coalesce(lower(${r.company}), ''))
         )
       limit 1
    `) as { id: string }[];

    if (existing[0]) {
      await sql`
        update people
           set title = coalesce(${r.title}, title),
               company_text = coalesce(${r.company}, company_text),
               norm_company = coalesce(${norm}, norm_company),
               account_id = coalesce(${accountId}, account_id),
               email = coalesce(${r.email}, email),
               linkedin_url = coalesce(${r.linkedin_url}, linkedin_url),
               is_decision_maker = ${isDecisionMaker(r.title)} or is_decision_maker,
               updated_at = now()
         where org_id = ${orgId} and id = ${existing[0].id}
      `;
      updated += 1;
    } else {
      await sql`
        insert into people
          (org_id, account_id, full_name, title, company_text, norm_company,
           linkedin_url, email, is_first_degree, is_decision_maker, connected_on)
        values
          (${orgId}, ${accountId}, ${r.full_name}, ${r.title}, ${r.company}, ${norm},
           ${r.linkedin_url}, ${r.email}, true, ${isDecisionMaker(r.title)},
           ${r.connected_on})
      `;
      added += 1;
    }
  }

  revalidatePath("/people");
  revalidatePath("/command");
  revalidatePath("/targets");
  return { ok: true, added, updated, matched, unmatched: [...unmatched].slice(0, 12) };
}

/** One person, typed in. */
export async function addPerson(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  const full_name = String(formData.get("full_name") ?? "").trim().slice(0, 200);
  if (!full_name) return { ok: false, error: "The person needs a name" };

  return writePeople(orgId, [{
    full_name,
    title: String(formData.get("title") ?? "").trim().slice(0, 200) || null,
    company: String(formData.get("company") ?? "").trim().slice(0, 200) || null,
    linkedin_url: cleanLinkedIn(String(formData.get("linkedin_url") ?? "")),
    email: String(formData.get("email") ?? "").trim().slice(0, 200) || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 1000) || null,
    connected_on: null,
  }]);
}

/**
 * A CSV of people. Column names are matched loosely against what real
 * exports use, so a LinkedIn export and a hand-built sheet both work without
 * the operator renaming headers.
 */
export async function importPeople(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV first" };
  if (file.size > 8_000_000) return { ok: false, error: "That file is over 8MB. Split it." };

  let text = await file.text();
  // A LinkedIn connections export starts with a Notes: preamble before the
  // real header row. Everything before the line that looks like headers goes.
  const headerAt = text.search(/^[^\n]*(first name|full name|name)[^\n]*,/im);
  if (headerAt > 0) text = text.slice(headerAt);

  let rows: Record<string, string>[];
  try {
    rows = parseCsvObjects(text) as Record<string, string>[];
  } catch {
    return { ok: false, error: "That file could not be read as a CSV" };
  }
  if (rows.length === 0) return { ok: false, error: "No rows found in that file" };
  if (rows.length > 20_000) return { ok: false, error: `${rows.length} rows is too many for one import` };

  const people: Incoming[] = [];
  let skipped = 0;
  for (const row of rows) {
    const first = pick(row, "first_name");
    const last = pick(row, "last_name");
    const name = pick(row, "full_name") ?? [first, last].filter(Boolean).join(" ").trim();
    if (!name) { skipped += 1; continue; }
    people.push({
      full_name: name.slice(0, 200),
      title: pick(row, "title")?.slice(0, 200) ?? null,
      company: pick(row, "company")?.slice(0, 200) ?? null,
      linkedin_url: cleanLinkedIn(pick(row, "linkedin_url")),
      email: pick(row, "email")?.slice(0, 200) ?? null,
      notes: pick(row, "notes")?.slice(0, 1000) ?? null,
      connected_on: null,
    });
  }

  const result = await writePeople(orgId, people);
  return { ...result, skipped };
}
