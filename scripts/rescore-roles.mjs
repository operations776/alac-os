// Recompute relevance for every stored role.
//
//   npm run rescore
//
// The scorer changed shape: it is difficulty x time open now, per section
// 17.1 of the brief, rather than freshness first. Every stored score was
// computed by the old model, so they all have to be redone or the board
// ranks two different models against each other.

import { config } from "dotenv";
import pg from "pg";
import { roleScore } from "../src/lib/scoring/roles.mjs";

config({ path: ".env.local" });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 4,
});

async function main() {
  const { rows } = await pool.query(
    `select r.id, r.title, r.occupation, r.salary_text, r.first_seen,
            (select count(*)::int from account_roles x
              where x.account_id = r.account_id and x.qualified) as open_at_company
       from account_roles r
      where r.qualified`,
  );
  console.log(`${rows.length} qualified roles`);

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const params = [];
    const values = slice.map((r) => {
      params.push(r.id, roleScore(r));
      const n = params.length;
      return `($${n - 1}::uuid, $${n}::int)`;
    });
    await pool.query(
      `update account_roles r set relevance = v.score
         from (values ${values.join(",")}) as v(id, score)
        where r.id = v.id`,
      params,
    );
    written += slice.length;
  }
  console.log(`rescored ${written}`);

  const top = await pool.query(
    `select a.company_name, r.title, r.relevance, r.first_seen,
            (current_date - r.first_seen) as age
       from account_roles r join tam_accounts a on a.id = r.account_id
      where r.qualified order by r.relevance desc nulls last limit 12`,
  );
  console.log("\nHighest value openings now:");
  for (const r of top.rows) {
    console.log(`  ${String(r.relevance).padStart(3)}  ${String(r.age ?? "?").padStart(3)}d  ${r.company_name.slice(0, 28).padEnd(30)}${r.title.slice(0, 52)}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(String(err.message).slice(0, 300));
  await pool.end().catch(() => {});
  process.exit(1);
});
