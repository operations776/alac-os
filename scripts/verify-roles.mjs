// Check that the roles on screen are still open.
//
//   npm run verify:roles            check what needs checking
//   npm run verify:roles -- --all   recheck everything, ignoring the 3 day window
//
// The same check the app runs from the button on Open roles and from the
// nightly cron route, available on the command line so it can be run without
// a browser. A posting whose page has gone is closed and leaves every screen.
//
// What this can and cannot tell you: Greenhouse and Lever answer 404 for a
// filled role, which is a real answer. A board that keeps dead pages up
// answers 200, and that is a limit of the check rather than a claim the role
// is open. Unreachable is recorded as unknown, never as dead.

import { config } from "dotenv";
import pg from "pg";
import { DESK } from "../src/config/desk.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const ALL = process.argv.includes("--all");
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const LIMIT = Number(arg("--limit", "400"));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 4,
});

async function main() {
  const org = await pool.query("select id from orgs where slug=$1", [ORG_SLUG]);
  if (org.rowCount === 0) throw new Error(`no org with slug ${ORG_SLUG}`);
  const orgId = org.rows[0].id;

  // Exactly the roles the screens offer: the live leads Today gates on
  // difficulty, and the top tenth the month view gates on the score.
  const { rows } = await pool.query(
    `select r.id, r.url, a.company_name, r.title,
            (r.first_seen >= current_date - 7 and r.difficulty >= $2::int) as on_today
       from account_roles r
       join account_desk a on a.id = r.account_id
      where r.org_id = $1 and r.qualified and r.closed_at is null and r.url is not null
        and a.disposition = 'Active'
        and ($3::bool or r.url_checked_at is null or r.url_checked_at < now() - interval '3 days')
        and (
          (r.first_seen >= current_date - 7 and r.difficulty >= $2::int)
          or r.relevance >= (select percentile_cont(0.9) within group (order by relevance)
                               from account_roles
                              where org_id = $1 and qualified and closed_at is null
                                and relevance is not null)
        )
      order by (r.first_seen >= current_date - 7) desc, r.relevance desc
      limit $4`,
    [orgId, DESK.LEAD_MIN_DIFFICULTY, ALL, LIMIT],
  );

  console.log(`${rows.length} to check, ${rows.filter((r) => r.on_today).length} of them on Today`);

  let live = 0, gone = 0, unknown = 0;
  const dead = [];

  const check = async (r) => {
    let alive = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      let res = await fetch(r.url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
      // Some boards refuse HEAD outright. A GET is the honest fallback.
      if (res.status === 405 || res.status === 403) {
        res = await fetch(r.url, { method: "GET", redirect: "follow", signal: ctrl.signal });
      }
      clearTimeout(t);
      alive = res.status < 400;
    } catch {
      alive = null;
    }
    if (alive === true) live += 1;
    else if (alive === false) { gone += 1; dead.push(r); }
    else unknown += 1;

    await pool.query(
      `update account_roles set url_ok = $2, url_checked_at = now(),
              closed_at = case when $2 = false then current_date else closed_at end
        where id = $1`,
      [r.id, alive],
    );
  };

  // Eight at a time: fast enough to finish 400 in a couple of minutes, few
  // enough that no employer's board sees a burst from one address.
  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(rows.slice(i, i + 8).map(check));
    if ((i + 8) % 80 === 0) process.stdout.write(`\r  ${Math.min(i + 8, rows.length)}/${rows.length}`);
  }

  console.log(`\n${live} live, ${gone} gone, ${unknown} unreachable`);
  if (dead.length) {
    console.log("\nClosed, page has gone:");
    for (const r of dead.slice(0, 20)) {
      console.log(`  ${r.company_name.slice(0, 26).padEnd(28)}${r.title.slice(0, 50)}`);
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(String(err?.message ?? err).slice(0, 300));
  await pool.end().catch(() => {});
  process.exit(1);
});
