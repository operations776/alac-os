// The full pipeline for one or two named accounts.
//
//   npm run enrich -- "Anduril" "Astranis"           plan, shows the cost
//   npm run enrich -- --apply "Anduril" "Astranis"   fetch, score, reason, write
//   npm run enrich -- --apply --no-ai "Anduril"      skip the OpenAI pass
//
// It answers the desk's actual question for an account: what changed, what are
// they hiring for, who do I contact, and why them.
//
// Order matters and follows cost. Free and already-owned data first, then the
// cheap searches, then the model. Nothing chargeable runs without --apply, and
// the estimate is printed before it does, so nothing chargeable is a surprise
// and a good one regardless.
//
//   1. the account, its warm network and its live signals   free, already here
//   2. open roles                          PredictLeads, one request per company
//   3. people to target                    Prospeo, 1 credit per request
//   4. score                               local, deterministic, free
//   5. narrative                           OpenAI, grounded, cents

import { config } from "dotenv";
import pg from "pg";
import { companyJobs, PredictLeadsError } from "../src/lib/server/integrations/predictleads.mjs";
import {
  searchPerson, normalizePerson, rankTarget, accountInformation,
  SENIORITY, DEPARTMENT,
} from "../src/lib/server/integrations/prospeo.mjs";
import { scoreHeat, heatVsTam } from "../src/lib/scoring/heat.mjs";
import { writeNarrative } from "../src/lib/server/ai/narrative.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const NO_AI = process.argv.includes("--no-ai");
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (names.length === 0) {
  console.error('Name at least one account, e.g.  npm run enrich -- "Anduril"');
  process.exit(1);
}

const AS_OF = new Date().toISOString().slice(0, 10);

// Job postings bill one credit each, and a big defence prime can have thousands
// open. The scorer saturates its volume term at ten qualified roles, so a
// sample is worth exactly as much to it as the full set and costs two orders of
// magnitude less. The count is always reported in full, so the cap never hides
// how much hiring is really happening.
const ROLE_LIMIT = 25;

// Who the desk wants to reach. Talent owns the requisition, engineering owns
// the team, C-suite owns the budget.
const TARGET_SENIORITY = [SENIORITY.cSuite, SENIORITY.vp, SENIORITY.head, SENIORITY.director];
const TARGET_DEPARTMENTS = [DEPARTMENT.engineering, DEPARTMENT.hr];

/**
 * Is this a role ALAC would be engaged on?
 *
 * Senior individual contributor through executive, in a technical or program
 * function. An intern or an office manager is a real posting and not a reason
 * to call, so it is recorded and marked unqualified rather than dropped: the
 * count of what was excluded is itself informative.
 */
function qualifyRole(title = "") {
  const t = title.toLowerCase();
  if (/\b(intern|internship|apprentice|student)\b/.test(t)) return false;
  if (/\b(receptionist|office manager|janitor|barista|driver)\b/.test(t)) return false;
  return /\b(engineer|engineering|scientist|architect|developer|technician|program|product|director|vp|vice president|head|chief|principal|staff|lead|manager)\b/.test(t);
}

/** Provider seniority strings, mapped to the scorer's vocabulary. */
function normSeniority(level = "") {
  const s = String(level).toLowerCase();
  if (/executive|chief|c-level/.test(s)) return "executive";
  if (/vice president|^vp/.test(s)) return "vp";
  if (/director/.test(s)) return "director";
  if (/senior|principal|staff|lead|mid-senior/.test(s)) return "senior";
  return "other";
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const run = async () => {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  // Resolve each name to exactly one account. An ambiguous name stops the run
  // rather than guessing: enriching the wrong company wastes credits and, worse,
  // puts a stranger on Adrian's target list.
  const accounts = [];
  for (const name of names) {
    const { rows } = await client.query(
      `select id, record_id, company_name, linkedin_url, priority::text as priority, final_score
         , domain
         from tam_accounts
        where org_id = $1 and company_name ilike $2
        order by final_score desc nulls last limit 5`,
      [orgId, `%${name}%`],
    );
    if (rows.length === 0) {
      console.error(`No account matches "${name}".`);
      process.exit(1);
    }
    if (rows.length > 1 && rows[0].company_name.toLowerCase() !== name.toLowerCase()) {
      console.error(`"${name}" is ambiguous: ${rows.map((r) => r.company_name).join(", ")}`);
      console.error("Use a more specific name.");
      process.exit(1);
    }
    accounts.push(rows[0]);
  }

  console.log(`Accounts: ${accounts.map((a) => a.company_name).join(", ")}\n`);

  // ---- 1. what is already known, free -----------------------------------
  const plans = [];
  for (const a of accounts) {
    const slug = linkedinSlug(a.linkedin_url);
    const domain = a.domain ?? null;

    const warm = await client.query(
      `select full_name, title, linkedin_url, is_decision_maker
         from people where org_id = $1 and account_id = $2
        order by is_decision_maker desc, full_name`,
      [orgId, a.id],
    );
    const signals = await client.query(
      `select id, signal_key, what_happened, the_number, signal_date, primary_source,
              rule_type, heat_score, source::text as source
         from heat_signals where org_id = $1 and account_id = $2
        order by signal_date desc nulls last`,
      [orgId, a.id],
    );

    plans.push({ account: a, slug, domain, warm: warm.rows, signals: signals.rows });
    console.log(`  ${a.company_name}`);
    console.log(`    slug ${slug ?? "none"}   domain ${domain ?? "NOT RESOLVED, run: npm run map -- --domains"}`);
    console.log(`    warm contacts ${warm.rowCount}   existing signals ${signals.rowCount}`);
  }

  // ---- estimate ----------------------------------------------------------
  console.log("Cost estimate:");
  // No per posting count call. Fiber charged a credit per posting found, so
  // counting first was the only protection against a company with 2,697 open
  // roles emptying the balance in one call. PredictLeads is not metered that
  // way, so the roles arrive in one request per company.
  const peopleEstimate = plans.length; // one request each
  console.log(`  people search: ${peopleEstimate} request(s), 1 Prospeo credit each`);
  console.log(`  TOTAL: ${peopleEstimate} Prospeo credits, plus one PredictLeads request per company`);

  const acct = await accountInformation().catch(() => null);
  if (acct?.response) {
    console.log(`  Prospeo balance: ${acct.response.remaining_credits} remaining`);
  }

  if (!APPLY) {
    console.log("\nPlan only. Nothing was fetched and nothing was written.");
    console.log(`Rerun with --apply to proceed:\n  npm run enrich -- --apply ${names.map((n) => `"${n}"`).join(" ")}`);
    await client.end();
    return;
  }

  // ---- claim the run before any side effect ------------------------------
  const runRow = await client.query(
    `insert into agent_runs (org_id, kind, status, trigger, params, started_at)
     values ($1, 'import', 'running', 'manual', $2::jsonb, now()) returning id`,
    [orgId, JSON.stringify({ source: "enrich_account", accounts: names })],
  );
  const runId = runRow.rows[0].id;

  let totalCost = 0;
  try {
    for (const p of plans) {
      const a = p.account;
      console.log(`\n=== ${a.company_name} ===`);

      // ---- 2. open roles, PredictLeads ----------------------------------
      let roles = [];
      if (a.domain) {
        try {
          const pulled = await companyJobs(a.domain, { limit: ROLE_LIMIT });
          roles = pulled.map((j) => ({
            external_id: j.external_id,
            title: j.title ?? "(untitled)",
            url: j.url,
            location: j.location,
            seniority: j.seniority,
            job_function: j.categories?.[0] ?? null,
            posted_at: j.first_seen,
            qualified: qualifyRole(j.title ?? ""),
            description: null,
          }));
          console.log(`  roles fetched: ${roles.length}, qualified ${roles.filter((r) => r.qualified).length}`);
        } catch (err) {
          if (err instanceof PredictLeadsError && err.status === 404) {
            console.log("  roles: no PredictLeads record for this domain");
          } else {
            console.log(`  roles failed: ${String(err.message).slice(0, 90)}`);
          }
        }
      }

      for (const r of roles) {
        await client.query(
          `insert into account_roles (org_id, account_id, external_id, title, url, location,
             seniority, job_function, posted_at, qualified)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (org_id, account_id, external_id) do update set
             title=excluded.title, url=excluded.url, location=excluded.location,
             seniority=excluded.seniority, job_function=excluded.job_function,
             posted_at=excluded.posted_at, qualified=excluded.qualified, fetched_at=now()`,
          [orgId, a.id, r.external_id, r.title, r.url, r.location, r.seniority, r.job_function, r.posted_at, r.qualified],
        );
      }

      // ---- 3. people to target, Prospeo ---------------------------------
      let targets = [];
      if (p.domain) {
        try {
          const res = await searchPerson({
            website: p.domain,
            seniorities: TARGET_SENIORITY,
            departments: TARGET_DEPARTMENTS,
          });
          const found = (res?.results ?? []).map(normalizePerson).filter((t) => t.full_name);
          // The warm network wins on identity: if Adrian already knows this
          // person, that fact outranks anything a vendor says about them.
          const warmUrls = new Set(
            p.warm.map((w) => (w.linkedin_url ?? "").replace(/\/+$/, "").toLowerCase()).filter(Boolean),
          );
          targets = found.map((t) => {
            const { score, reasons } = rankTarget(t);
            const isWarm = warmUrls.has((t.linkedin_url ?? "").replace(/\/+$/, "").toLowerCase());
            return { ...t, rank: isWarm ? Math.min(100, score + 25) : score, reasons: isWarm ? [...reasons, "Already a first degree connection"] : reasons, isWarm };
          });
          console.log(`  targets found: ${targets.length}${res.free ? " (cached, free)" : " (1 credit)"}, warm overlap ${targets.filter((t) => t.isWarm).length}`);
        } catch (err) {
          console.log(`  targets failed: ${err.message}`);
        }
      } else {
        console.log("  targets skipped: no domain known for this account");
      }

      for (const t of targets) {
        if (!t.linkedin_url) continue;
        await client.query(
          `insert into account_targets (org_id, account_id, source, external_id, full_name, title,
             headline, linkedin_url, location, email, email_status, email_revealed,
             rank_score, rank_terms, is_warm)
           values ($1,$2,'prospeo',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
           on conflict (org_id, account_id, linkedin_url) do update set
             full_name=excluded.full_name, title=excluded.title, headline=excluded.headline,
             location=excluded.location, email=excluded.email, email_status=excluded.email_status,
             email_revealed=excluded.email_revealed, rank_score=excluded.rank_score,
             rank_terms=excluded.rank_terms, is_warm=excluded.is_warm, fetched_at=now()`,
          [orgId, a.id, t.external_id, t.full_name, t.title, t.headline, t.linkedin_url,
           t.location, t.email, t.email_status, t.email_revealed, t.rank, JSON.stringify(t.reasons), t.isWarm],
        );
      }

      // ---- 4. rescore every signal, now with real job data ---------------
      const jobsForScorer = roles.map((r) => ({
        title: r.title,
        description: r.description,
        seniority: normSeniority(r.seniority),
        posted_at: r.posted_at,
        qualified: r.qualified,
      }));
      const warmCount = p.warm.length;
      const dmCount = p.warm.filter((w) => w.is_decision_maker).length;

      for (const s of p.signals) {
        const scored = scoreHeat({
          asOf: AS_OF,
          signalDate: s.signal_date,
          priority: a.priority,
          finalScore: a.final_score != null ? Number(a.final_score) : null,
          amountUsd: null,
          warmContacts: warmCount,
          decisionMakers: dmCount,
          jobs: jobsForScorer,
        });
        await client.query(
          `update heat_signals set
             hiring_urgency=$2, icp_fit=$3, capital=coalesce(capital,$4), talent_scarcity=$5,
             access=$6, freshness=$7, heat_score=$8, heat_vs_tam=$9,
             breakdown=$10::jsonb, coverage=$11, scored_at=now()
           where id=$1`,
          [s.id, scored.components.hiring_urgency, scored.components.icp_fit,
           scored.components.capital, scored.components.talent_scarcity,
           scored.components.access, scored.components.freshness,
           scored.heat_score, heatVsTam(scored.heat_score, a.final_score),
           JSON.stringify({ terms: scored.terms, gaps: scored.gaps, asOf: AS_OF }), scored.coverage],
        );
        console.log(`  rescored "${s.what_happened?.slice(0, 46)}": heat ${scored.heat_score}, coverage ${scored.coverage}%`);
      }

      // ---- 5. the narrative, OpenAI, grounded ----------------------------
      if (!NO_AI && p.signals.length > 0) {
        // The warm network joins the candidate pool, it does not merely
        // annotate it. The first pilot run surfaced this: Anduril has 28 first
        // degree contacts and none of them appeared in the vendor's 25 results,
        // so the model was choosing a stranger to cold approach while Adrian
        // already knew people there. Sourced targets and known contacts are
        // ranked together, and the known ones carry the bonus.
        const warmAsTargets = p.warm.map((w) => {
          const { score, reasons } = rankTarget({ title: w.title ?? "" });
          return {
            full_name: w.full_name,
            title: w.title,
            linkedin_url: w.linkedin_url,
            isWarm: true,
            rank: Math.min(100, score + 25),
            reasons: [...reasons, "Already a first degree connection"],
          };
        });
        const seen = new Set();
        const pool = [...warmAsTargets, ...targets].filter((t) => {
          const k = (t.linkedin_url ?? t.full_name ?? "").toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const top = pool.sort((x, y) => y.rank - x.rank).slice(0, 12);
        const { narrative, cost, model } = await writeNarrative({
          company: a.company_name,
          priority: a.priority,
          finalScore: a.final_score,
          signals: p.signals,
          roles: roles.filter((r) => r.qualified),
          targets: top,
          warm: p.warm,
        });
        totalCost += cost ?? 0;

        if (narrative) {
          await client.query(
            `update heat_signals set why_now=$2, contact_first=$3, next_step=$4, risks=$5,
                    reasoning_model=$6, reasoning_at=now()
               where id=$1`,
            [p.signals[0].id, narrative.why_now, narrative.contact_first,
             narrative.next_step, narrative.risks, model],
          );
          console.log(`\n  WHY NOW:       ${narrative.why_now}`);
          console.log(`  CONTACT FIRST: ${narrative.contact_first}`);
          console.log(`  NEXT STEP:     ${narrative.next_step}`);
          if (narrative.risks) console.log(`  RISKS:         ${narrative.risks}`);
        } else {
          console.log("  narrative: not generated");
        }
      }
    }

    await client.query(
      `update agent_runs set status='complete', items_total=$2, items_ok=$2,
              cost_usd=$3, finished_at=now(),
              duration_ms=extract(epoch from (now()-started_at))*1000 where id=$1`,
      [runId, plans.length, totalCost],
    );
    console.log(`\nDone. OpenAI cost this run: $${totalCost.toFixed(4)}`);
  } catch (err) {
    await client.query("update agent_runs set status='failed', error=$2, finished_at=now() where id=$1",
      [runId, String(err?.message ?? err).slice(0, 2000)]).catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
};

/**
 * The company domain, which Prospeo matches on.
 *
 * Derived from the account's own data where possible. A domain guessed from a
 * company name would silently search the wrong company, so an unknown domain
 * skips the people search rather than guessing.
 */
// The guess is gone. It used to derive "astranis.com" from the slug
// "astranis", which measured 9 wrong out of the first 14 resolved:
//
//   neros.tech        was guessed neros-tech.com
//   varda.com         was guessed varda-space-industries.com
//   trueanomaly.space was guessed true-anomaly.com
//
// Every one of those would have searched a domain nobody owns, or worse, one
// somebody else owns. `npm run map -- --domains` resolves the real value from
// the LinkedIn URL and stores it, so this file now reads a fact instead of
// inventing one, and an account without a resolved domain is skipped rather
// than guessed at.

run().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
