#!/usr/bin/env node
// One time copy of the live Mission Control database into the mc schema.
//
//   MC_DATABASE_URL=postgres://... npm run import:ops              plan, reads only
//   MC_DATABASE_URL=postgres://... npm run import:ops -- --apply   copies
//   --source-schema <name>   where the Mission Control tables live in the source
//                            (default public, which is where Supabase kept them)
//
// MC_DATABASE_URL is the Supabase Postgres connection string. It is never
// committed. The target is DATABASE_URL_UNPOOLED, as for migrations.
//
// What it does, in one transaction on the target:
//
//   1. Identity. Every source people row becomes a public.users row, found by
//      lower(email) or created with no password (the person sets one through
//      the normal flow), plus a membership in the first org. Creating the user
//      fires on_user_created, which provisions the mc.people row; that row is
//      then updated with the source columns. A person who already has a desk
//      account keeps their user id, so the source id is mapped to it.
//   2. Every other mc table, in foreign key order, copying the columns both
//      sides have. A column referencing people is remapped through the id map.
//      A row whose primary key already exists is skipped, so a rerun is safe.
//      A row skipped because a different unique key already exists (a function
//      the migration seeded under the same key, say) maps its source id to the
//      existing row, so rows that reference it still point somewhere real.
//   3. Every sequence in mc is reset past the highest copied value.
//
// Nothing commits unless every chunk of every table succeeded. A partial copy
// with foreign key checks off (see below) would leave orphans nobody sees.
//
// Known limits, said plainly:
//   - A row whose primary key already exists in the target is kept as the
//     target has it. Rows the migration seeded (slack_settings, voice_profile,
//     scoring_config, integrations, priority_targets) therefore keep their
//     defaults: the skipped count shows it, and those settings are re-entered
//     by hand or copied deliberately.
//   - People ids inside jsonb (activity payloads) are not remapped. Only real
//     columns with a foreign key are.
//   - Whole tables are read into memory. Mission Control is one team's board.

import pg from "pg";
import dotenv from "dotenv";

// An env var already set wins over .env.local: dotenv does not override.
dotenv.config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const schemaFlag = args.indexOf("--source-schema");
const SOURCE_SCHEMA = schemaFlag >= 0 ? args[schemaFlag + 1] : "public";

const sourceUrl = process.env.MC_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL_UNPOOLED;
if (!sourceUrl || !targetUrl) {
  console.error("Set MC_DATABASE_URL (the Mission Control database) and DATABASE_URL_UNPOOLED (the target).");
  process.exit(1);
}
if (!SOURCE_SCHEMA) {
  console.error("--source-schema needs a schema name.");
  process.exit(1);
}

const where = (u) => {
  const x = new URL(u);
  return `${x.hostname}:${x.port || 5432}${x.pathname}`;
};
if (APPLY && where(sourceUrl) === where(targetUrl)) {
  console.error("MC_DATABASE_URL and DATABASE_URL_UNPOOLED are the same database. Refusing to copy onto itself.");
  process.exit(1);
}

// Chunked so no statement comes near Postgres's 65535 parameter ceiling.
// Settings the migration seeds with defaults and the team has since edited in
// production: the live row wins. Left to "do nothing", Slack would arrive with
// is_connected false (silently dropping every DM) and the voice profile blank.
const OVERWRITE = new Set(["slack_settings", "voice_profile", "scoring_config", "integrations", "priority_targets"]);

const MAX_PARAMS = 60_000;
const MAX_ROWS = 1_000;

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });
await src.connect();
await dst.connect();
const qi = (s) => dst.escapeIdentifier(s);
const S = qi(SOURCE_SCHEMA);

// --- Target catalog ----------------------------------------------------------

const { rows: tableRows } = await dst.query(
  `select relname from pg_class where relnamespace = 'mc'::regnamespace and relkind in ('r', 'p') order by relname`,
);
const tables = tableRows.map((r) => r.relname);

const { rows: colRows } = await dst.query(
  `select c.relname, a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attgenerated <> '' as generated
     from pg_attribute a join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'mc'::regnamespace and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`,
);
const targetCols = new Map(tables.map((t) => [t, []]));
for (const r of colRows) if (!r.generated) targetCols.get(r.relname).push({ name: r.attname, type: r.type });

// Unique keys on plain columns, the primary key flagged.
const { rows: keyRows } = await dst.query(
  `select c.relname, i.indisprimary as primary,
          array_agg(a.attname::text order by x.ord) as cols
     from pg_index i
     join pg_class c on c.oid = i.indrelid
     cross join lateral unnest(i.indkey) with ordinality as x(n, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = x.n
    where c.relnamespace = 'mc'::regnamespace and i.indisunique
      and i.indexprs is null and i.indpred is null
    group by c.relname, i.indexrelid, i.indisprimary`,
);
const pkOf = new Map();
const uniquesOf = new Map();
for (const r of keyRows) {
  if (r.primary) pkOf.set(r.relname, r.cols);
  else uniquesOf.set(r.relname, [...(uniquesOf.get(r.relname) ?? []), r.cols]);
}

// Single column foreign keys: table.column -> referenced table.
const { rows: fkRows } = await dst.query(
  `select c.relname as tbl, a.attname as col, rn.nspname || '.' || rc.relname as ref
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_class rc on rc.oid = k.confrelid
     join pg_namespace rn on rn.oid = rc.relnamespace
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.contype = 'f' and c.relnamespace = 'mc'::regnamespace and cardinality(k.conkey) = 1`,
);
const refsOf = new Map(tables.map((t) => [t, new Map()]));
for (const r of fkRows) refsOf.get(r.tbl).set(r.col, r.ref === "public.users" ? "mc.people" : r.ref);

// Dependency order: a table after every mc table it references. With foreign
// key checks off the order is not about constraints; it is about id maps: a
// table's remapped ids must exist before a table referencing it is read.
// people comes first because the identity step builds its map. A remaining
// cycle is broken at the table with the fewest unresolved references.
const order = ["people"];
{
  const pending = new Set(tables.filter((t) => t !== "people"));
  const unresolved = (t) =>
    [...refsOf.get(t).values()].filter((ref) => {
      const name = ref.replace(/^mc\./, "");
      return ref.startsWith("mc.") && name !== t && pending.has(name);
    }).length;
  while (pending.size) {
    const ready = [...pending].filter((t) => unresolved(t) === 0);
    const next = ready.length
      ? ready
      : [[...pending].sort((a, b) => unresolved(a) - unresolved(b) || a.localeCompare(b))[0]];
    for (const t of next.sort()) {
      order.push(t);
      pending.delete(t);
    }
  }
}

// --- Source catalog ----------------------------------------------------------

const { rows: srcColRows } = await src.query(
  `select c.relname, a.attname
     from pg_attribute a join pg_class c on c.oid = a.attrelid
    where c.relnamespace = $1::regnamespace and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped`,
  [SOURCE_SCHEMA],
);
const sourceCols = new Map();
for (const r of srcColRows) sourceCols.set(r.relname, [...(sourceCols.get(r.relname) ?? []), r.attname]);
if (!sourceCols.has("people")) {
  console.error(`No people table in source schema ${SOURCE_SCHEMA}. Wrong database or --source-schema?`);
  process.exit(1);
}

const shared = (t) => targetCols.get(t).filter((c) => sourceCols.get(t)?.includes(c.name));

// One snapshot for the whole copy, so a table read later cannot disagree with
// one read earlier while the source app is still in use. Plan mode only counts,
// so it reads without one.
if (APPLY) await src.query("begin transaction isolation level repeatable read read only");

// --- Plan ----------------------------------------------------------------------

const { rows: srcPeople } = await src.query(
  `select id::text, email, name, role::text as role from ${S}.people order by created_at nulls last, id`,
);
const { rows: [{ matched }] } = await dst.query(
  `select count(*)::int as matched from users where lower(email) = any($1::text[])`,
  [srcPeople.map((p) => (p.email ?? "").toLowerCase())],
);
const { rows: [org] } = await dst.query("select id, name from orgs order by created_at limit 1");

console.log(`Source schema: ${SOURCE_SCHEMA}. Target schema: mc.`);
console.log(
  `\nIdentity: ${srcPeople.length} people, ${matched} already have a desk account, ` +
    `${srcPeople.length - matched} would be created. Org: ${org ? org.name : "NONE (import cannot run)"}.`,
);

console.log("\nTables in copy order:");
for (const [i, t] of order.entries()) {
  if (!sourceCols.has(t)) {
    console.log(`  ${String(i + 1).padStart(2)}. ${t}: not in source, skipped`);
    continue;
  }
  const cols = shared(t).map((c) => c.name);
  const onlyTarget = targetCols.get(t).map((c) => c.name).filter((c) => !cols.includes(c));
  const generated = colRows.filter((r) => r.relname === t && r.generated).map((r) => r.attname);
  const onlySource = sourceCols.get(t).filter((c) => !cols.includes(c) && !generated.includes(c));
  const remapped = cols.filter((c) => refsOf.get(t).has(c) && refsOf.get(t).get(c) === "mc.people");
  const { rows: [{ n }] } = await src.query(`select count(*)::int as n from ${S}.${qi(t)}`);
  console.log(
    `  ${String(i + 1).padStart(2)}. ${t}: ${n} rows, ${cols.length} columns` +
      (onlyTarget.length ? `; target only (default): ${onlyTarget.join(", ")}` : "") +
      (onlySource.length ? `; source only (dropped): ${onlySource.join(", ")}` : "") +
      (generated.length ? `; generated in target: ${generated.join(", ")}` : "") +
      (remapped.length ? `; people remapped: ${remapped.join(", ")}` : "") +
      (t === "people" ? "; handled by the identity step" : ""),
  );
}

if (!APPLY) {
  console.log("\nPlan only. Nothing was written. Pass --apply to copy.");
  await src.end();
  await dst.end();
  process.exit(0);
}
if (!org) {
  console.error("\nThe target has no org. Create the desk org and its owner first.");
  process.exit(1);
}

// --- Apply ---------------------------------------------------------------------

// source id -> target id, per referenced table ("mc.people", "mc.functions").
const maps = new Map([["mc.people", new Map()]]);
const report = [];
let failedTotal = 0;

try {
  await dst.query("begin");

  // 1. Identity, with triggers on: on_user_created must provision mc.people.
  // ponytail: one round trip per person, fine for a team, batch it if the
  // source ever holds thousands of people.
  const identity = { table: "people (identity)", created: 0, skipped: 0, failed: 0, errors: [] };
  for (const p of srcPeople) {
    const { rowCount } = await dst.query(
      `insert into users (id, email, full_name, password_hash) values ($1::uuid, $2, $3, null)
       on conflict do nothing`,
      [p.id, p.email, p.name ?? ""],
    );
    const { rows } = await dst.query("select id::text from users where lower(email) = lower($1)", [p.email]);
    if (!rows[0]) {
      // The id is taken by a user with a different email. Never guess who that is.
      identity.failed++;
      identity.errors.push(`${p.email}: user id already belongs to another email`);
      continue;
    }
    maps.get("mc.people").set(p.id, rows[0].id);
    if (rowCount) identity.created++;
    else identity.skipped++;
    await dst.query(
      `insert into org_memberships (org_id, user_id, role) values ($1, $2, $3::org_role)
       on conflict (org_id, user_id) do nothing`,
      [org.id, rows[0].id, p.role === "owner" || p.role === "admin" ? "admin" : "member"],
    );
  }
  report.push(identity);

  // From here on the copy writes rows that already carry their history:
  // activity, notifications, review tasks and outbox messages were produced
  // by the source's triggers when those events happened, and are copied as
  // rows. Firing triggers again would log every copied task as newly created
  // and notify everyone about work that is months old. The house rule against
  // bulk loading with triggers off exists so derived state is never skipped;
  // here the derived state is being copied verbatim, which is the one case it
  // does not cover. Replica mode also skips foreign key checks, which is why
  // nothing commits unless every chunk succeeded.
  await dst.query("set local session_replication_role = replica");

  const mapValue = (table, col, v) => {
    const ref = refsOf.get(table).get(col);
    return v !== null && ref && maps.has(ref) ? (maps.get(ref).get(v) ?? v) : v;
  };

  // 2a. Everything else.
  for (const t of order) {
    if (t === "people" || !sourceCols.has(t)) continue;
    const cols = shared(t);
    const pk = pkOf.get(t);
    const single = pk?.length === 1 ? pk[0] : null;
    const step = { table: t, created: 0, skipped: 0, failed: 0, errors: [] };

    const { rows } = await src.query({
      text: `select ${cols.map((c) => `${qi(c.name)}::text`).join(", ")} from ${S}.${qi(t)}`,
      rowMode: "array",
    });
    const values = rows.map((r) => r.map((v, i) => mapValue(t, cols[i].name, v)));
    const pkIndex = single ? cols.findIndex((c) => c.name === single) : -1;

    const size = Math.max(1, Math.min(MAX_ROWS, Math.floor(MAX_PARAMS / cols.length)));
    for (let i = 0; i < values.length; i += size) {
      const slice = values.slice(i, i + size);
      const params = [];
      const tuples = slice.map(
        (row) => `(${row.map((v, j) => (params.push(v), `$${params.length}::${cols[j].type}`)).join(", ")})`,
      );
      await dst.query("savepoint chunk");
      try {
        const res = await dst.query(
          `insert into mc.${qi(t)} (${cols.map((c) => qi(c.name)).join(", ")}) values ${tuples.join(", ")}
           ${OVERWRITE.has(t) && pk?.length
             ? `on conflict (${pk.map(qi).join(", ")}) do update set ${
                 cols.filter((c) => !pk.includes(c.name)).map((c) => `${qi(c.name)} = excluded.${qi(c.name)}`).join(", ")
               }`
             : "on conflict do nothing"}
           returning ${single ? `${qi(single)}::text as pk` : "1"}`,
          params,
        );
        step.created += res.rowCount;
        step.skipped += slice.length - res.rowCount;

        // Skipped rows whose primary key is absent collided on another unique
        // key: point their source id at the row that already holds that key.
        if (single && pkIndex >= 0 && res.rowCount < slice.length && uniquesOf.has(t)) {
          const inserted = new Set(res.rows.map((r) => r.pk));
          const skipped = slice.filter((r) => !inserted.has(r[pkIndex]));
          for (const key of uniquesOf.get(t)) {
            const idx = key.map((k) => cols.findIndex((c) => c.name === k));
            if (idx.some((x) => x < 0)) continue;
            const { rows: hits } = await dst.query(
              `select s.src, t.${qi(single)}::text as tgt
                 from jsonb_to_recordset($1::jsonb) as s(src text, ${key.map((_, j) => `k${j} text`).join(", ")})
                 join mc.${qi(t)} t on ${key.map((k, j) => `t.${qi(k)}::text = s.k${j}`).join(" and ")}
                where t.${qi(single)}::text <> s.src`,
              [JSON.stringify(skipped.map((r) => Object.fromEntries([["src", r[pkIndex]], ...idx.map((x, j) => [`k${j}`, r[x]])])))],
            );
            if (hits.length) {
              const m = maps.get(`mc.${t}`) ?? new Map();
              for (const h of hits) m.set(h.src, h.tgt);
              maps.set(`mc.${t}`, m);
            }
          }
        }
        await dst.query("release savepoint chunk");
      } catch (e) {
        await dst.query("rollback to savepoint chunk");
        step.failed += slice.length;
        step.errors.push(e.message);
      }
    }
    report.push(step);
  }

  // 2b. The provisioned mc.people rows take the source's columns. After the
  // tables, so function_id and invited_by resolve through every id map.
  const peopleCols = shared("people").filter((c) => c.name !== "id" && c.name !== "email");
  const { rows: fullPeople } = await src.query(
    `select id::text, ${peopleCols.map((c) => `${qi(c.name)}::text`).join(", ")} from ${S}.people`,
  );
  const peopleStep = { table: "people (columns)", created: 0, skipped: 0, failed: 0, errors: [] };
  for (const p of fullPeople) {
    const target = maps.get("mc.people").get(p.id);
    if (!target) continue; // failed in the identity step, already counted
    const { rowCount } = await dst.query(
      `update mc.people set ${peopleCols.map((c, i) => `${qi(c.name)} = $${i + 2}::${c.type}`).join(", ")}
        where id = $1::uuid`,
      [target, ...peopleCols.map((c) => mapValue("people", c.name, p[c.name]))],
    );
    if (rowCount) peopleStep.created++;
    else {
      peopleStep.failed++;
      peopleStep.errors.push(`${p.id}: no mc.people row was provisioned`);
    }
  }
  report.push(peopleStep);

  // 3. Sequences past the highest copied value.
  const { rows: seqs } = await dst.query(
    `select s.oid::regclass::text as seq, t.relname as tbl, a.attname as col
       from pg_depend d
       join pg_class s on s.oid = d.objid and s.relkind = 'S'
       join pg_class t on t.oid = d.refobjid
       join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      where s.relnamespace = 'mc'::regnamespace and d.deptype in ('a', 'i')`,
  );
  for (const s of seqs) {
    await dst.query(
      `select setval($1::regclass, coalesce((select max(${qi(s.col)}) from mc.${qi(s.tbl)}), 0) + 1, false)`,
      [s.seq],
    );
  }

  failedTotal = report.reduce((n, r) => n + r.failed, 0);
  await dst.query(failedTotal ? "rollback" : "commit");
} catch (e) {
  await dst.query("rollback").catch(() => {});
  console.error(`\nImport failed, nothing was written: ${e.message}`);
  failedTotal = Math.max(failedTotal, 1);
}

console.log("\nResult:");
for (const r of report) {
  console.log(`  ${r.table}: ${r.created} created, ${r.skipped} skipped, ${r.failed} failed`);
  for (const e of r.errors.slice(0, 3)) console.log(`      ${e}`);
}
for (const [ref, m] of maps) if (ref !== "mc.people" && m.size) console.log(`  remapped ${m.size} ${ref} ids onto existing rows`);
console.log(failedTotal ? "\nRolled back: nothing was written. Fix the failures above and rerun." : "\nCommitted.");

await src.query("rollback").catch(() => {});
await src.end();
await dst.end();
process.exit(failedTotal ? 1 : 0);
