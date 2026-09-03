// Rank the whole market into Work Now, Up Next and Backlog.
//
//   npm run map                 rank and write the bands. Free, no API calls.
//   npm run map -- --domains    also resolve real company domains via Prospeo
//   npm run map -- --domains --limit 100
//
// The ranking itself costs nothing: it reads what is already stored and runs a
// pure function over it. Only --domains spends, and only on accounts that do
// not already have one.
//
// This replaces the guess that the pilot exposed. Deriving "astranis.com" from
// the slug "astranis" is right often enough to be dangerous, because when it is
// wrong the people search returns a different company's staff and those names
// look exactly as credible as the real ones.

import { config } from "dotenv";
import pg from "pg";
import { enrichCompany, normalizeCompany } from "../src/lib/server/integrations/prospeo.mjs";
import { workScore, assignBands, describeMove } from "../src/lib/scoring/bands.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const DO_DOMAINS = process.argv.includes("--domains");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) || 0 : 0;
})();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const run = async () => {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  // The working market. Priority 3 is a 2,072 row tail nobody is working, so it
  // is excluded from banding rather than ranked and then ignored: putting two
  // thousand rows into a backlog nobody opens is not a market map.
  const { rows } = await client.query(
    `select a.id, a.company_name, a.priority::text as priority, a.final_score, a.domain,
            a.linkedin_url, a.next_week,
            (select count(*)::int from people p
              where p.account_id = a.id) as warm_contacts,
            (select count(*)::int from people p
              where p.account_id = a.id and p.is_decision_maker) as decision_makers,
            (select count(*)::int from account_roles r
              where r.account_id = a.id and r.qualified) as qualified_roles,
            (select max(h.heat_score) from heat_signals h
              where h.account_id = a.id) as heat_score,
            (select max(h.heat_vs_tam) from heat_signals h
              where h.account_id = a.id) as heat_vs_tam,
            (select max(h.signal_date) from heat_signals h
              where h.account_id = a.id and h.heat_score >= 60) as heat_date,
            (select count(*)::int from account_roles r
              where r.account_id = a.id and r.qualified
                and r.first_seen >= current_date - 7) as fresh_roles,
            a.prep_status,
            a.work_band as prev_band,
            -- Worked: any sign a human has touched it recently. These never
            -- get demoted by the ranking.
            (a.prep_status <> 'NOT STARTED'
              or exists (select 1 from account_notes n where n.account_id = a.id)
              or exists (select 1 from desk_marks m where m.account_id = a.id and m.done)
              or exists (select 1 from outreach_drafts d where d.account_id = a.id
                          and d.sent_at >= now() - interval '21 days')) as active
       from tam_accounts a
      where a.org_id = $1
        and (a.priority in ('priority_1','priority_2','unscored') or a.next_week)`,
    [orgId],
  );

  console.log(`Market: ${rows.length} accounts in scope\n`);

  // ---- optional: resolve real domains -----------------------------------
  if (DO_DOMAINS) {
    const need = rows.filter((r) => !r.domain && r.linkedin_url);
    const todo = LIMIT > 0 ? need.slice(0, LIMIT) : need;
    console.log(`Domains: ${need.length} missing, resolving ${todo.length}`);
    console.log("  1 Prospeo credit per match, nothing when there is no match,");
    console.log("  and free to repeat within 90 days.\n");

    let ok = 0;
    let miss = 0;
    let free = 0;
    for (const [i, r] of todo.entries()) {
      try {
        const res = await enrichCompany(r.linkedin_url);
        const c = normalizeCompany(res);
        if (c.free) free += 1;
        if (c.domain) {
          await client.query(
            `update tam_accounts
                set domain = $2, domain_source = 'prospeo',
                    employee_count = coalesce($3, employee_count), enriched_at = now()
              where id = $1`,
            [r.id, c.domain, c.employee_count],
          );
          r.domain = c.domain;
          ok += 1;
        } else {
          miss += 1;
        }
      } catch (err) {
        miss += 1;
        console.log(`  ${r.company_name}: ${String(err.message).slice(0, 90)}`);
      }
      if ((i + 1) % 25 === 0) process.stdout.write(`\r  ${i + 1}/${todo.length}`);
    }
    console.log(`\r  ${ok} resolved, ${miss} no match, ${free} were free\n`);
  }

  // ---- rank, free --------------------------------------------------------
  const scored = rows.map((r) => {
    const { score, reasons } = workScore({
      priority: r.priority,
      finalScore: r.final_score,
      heatScore: r.heat_score,
      heatVsTam: r.heat_vs_tam,
      warmContacts: r.warm_contacts,
      decisionMakers: r.decision_makers,
      qualifiedRoles: r.qualified_roles,
      freshRoles: r.fresh_roles,
    });
    return { ...r, work_score: score, work_reason: reasons.join(". ") };
  });

  const banded = assignBands(scored);

  // Written in chunks: 960 single updates would be 960 round trips to a remote
  // database, which is the same mistake the first importer made.
  const CHUNK = 200;
  for (let i = 0; i < banded.length; i += CHUNK) {
    const slice = banded.slice(i, i + CHUNK);
    const params = [orgId];
    const values = slice.map((r) => {
      params.push(r.id, r.work_band, r.work_reason, r.work_score);
      const n = params.length;
      return `($${n - 3}::uuid, $${n - 2}::text, $${n - 1}::text, $${n}::int)`;
    });
    await client.query(
      `update tam_accounts a
          set work_band = v.band, work_reason = v.reason,
              work_score = v.score, banded_at = now()
         from (values ${values.join(",")}) as v(id, band, reason, score)
        where a.id = v.id and a.org_id = $1`,
      params,
    );
  }

  // The move log. One row per company whose band changed, with the reason
  // as ranked. First run against an unranked market records every entry.
  const moves = banded
    .filter((r) => r.prev_band !== r.work_band)
    .map((r) => ({ id: r.id, name: r.company_name, from: r.prev_band ?? null, to: r.work_band,
                   why: describeMove(r.prev_band ?? null, r.work_band, r.work_reason) }));
  for (let i = 0; i < moves.length; i += CHUNK) {
    const slice = moves.slice(i, i + CHUNK);
    const params = [orgId];
    const values = slice.map((m) => {
      params.push(m.id, m.from, m.to, m.why);
      const n = params.length;
      return `($1, $${n - 3}::uuid, $${n - 2}::text, $${n - 1}::text, $${n}::text)`;
    });
    await client.query(
      `insert into band_moves (org_id, account_id, from_band, to_band, reason) values ${values.join(",")}`,
      params,
    );
  }
  const up = moves.filter((m) => m.from && m.why.startsWith("Up")).length;
  const down = moves.filter((m) => m.why.startsWith("Down")).length;
  console.log(`Moved: ${moves.length} (${up} up, ${down} down, ${moves.length - up - down} new)`);
  for (const m of moves.filter((m) => m.from).slice(0, 20)) {
    console.log(`  ${m.name.slice(0, 34).padEnd(36)}${m.why}`);
  }

  const counts = banded.reduce((m, r) => ({ ...m, [r.work_band]: (m[r.work_band] ?? 0) + 1 }), {});
  console.log(`Banded: ${counts.now ?? 0} work now, ${counts.next ?? 0} up next, ${counts.backlog ?? 0} backlog\n`);

  console.log("Work now, top 12:");
  for (const r of banded.slice(0, 12)) {
    console.log(
      `  ${String(r.work_score).padStart(3)}  ${r.company_name.slice(0, 34).padEnd(36)}${r.work_reason.slice(0, 74)}`,
    );
  }

  const withDomain = banded.filter((r) => r.domain).length;
  console.log(`\nDomains known: ${withDomain} of ${banded.length}`);
  if (withDomain < banded.length) {
    console.log(`Run with --domains to resolve the rest before sourcing people.`);
  }

  await client.end();
};

run().catch(async (err) => {
  console.error(String(err?.message ?? err));
  await client.end().catch(() => {});
  process.exit(1);
});
