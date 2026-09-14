#!/usr/bin/env node
// Loads the SOP library into mc.sops from ALAC_DATA_DIR/sops.json.
//
// The library used to be a seed block in the Mission Control migration. It
// holds the client's own document links, so it is data, kept outside this
// public repo and loaded here.
//
//   npm run import:sops             inserts every SOP whose url is not already there
//   npm run import:sops -- --plan   reports what would be inserted, writes nothing
//
// Keyed on url, like the original seed: running it twice changes nothing, and
// an SOP someone edited in the app is never overwritten. mc.sops has no unique
// index on url (and adding one is a migration, not an importer's job), so the
// table is locked for the one statement instead: two concurrent runs queue
// rather than both inserting the same link.
//
// File shape (placeholder URLs only, the real file never enters this repo):
//
//   [
//     { "title": "The Playbook (read this first)",
//       "url": "https://docs.example.com/document/d/PLACEHOLDER-1/edit",
//       "function_key": null, "is_essential": true, "sort_order": 1,
//       "summary": "How the firm operates." },
//     { "title": "Take-to-Market SOP",
//       "url": "https://docs.example.com/document/d/PLACEHOLDER-2/edit",
//       "function_key": "gtm", "is_essential": false, "sort_order": 10,
//       "summary": "Taking a candidate to market." }
//   ]
//
// function_key is mc.functions.key. A key that does not exist is loaded with
// no function rather than failing the whole file, and is reported.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

// An env var already set (DATABASE_URL_UNPOOLED on the command line) wins:
// dotenv does not override.
dotenv.config({ path: ".env.local", quiet: true });

const APPLY = !process.argv.includes("--plan");

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set. Run: vercel env pull .env.local");
  process.exit(1);
}
const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set.");
  process.exit(1);
}
const file = path.join(dataDir, "sops.json");
if (!existsSync(file)) {
  console.error(`${file} not found.`);
  process.exit(1);
}

const sops = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(sops)) {
  console.error("sops.json must be an array.");
  process.exit(1);
}
const bad = sops.filter((s) => !s || typeof s.title !== "string" || !s.title || typeof s.url !== "string" || !s.url);
if (bad.length) {
  console.error(`${bad.length} entries have no title or url. Fix the file; nothing was loaded.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let exitCode = 0;
try {
  await client.query("begin");
  await client.query("lock table mc.sops in share row exclusive mode");

  // distinct on url: a link listed twice in the file is inserted once.
  const { rows } = await client.query(
    `insert into mc.sops (title, url, function_id, is_essential, sort_order, summary)
     select distinct on (r.url)
            r.title, r.url, f.key, coalesce(r.is_essential, false), coalesce(r.sort_order, 0), r.summary
       from jsonb_to_recordset($1::jsonb) as r(
              title text, url text, function_key text, is_essential boolean,
              sort_order int, summary text)
       left join mc.functions f on f.key = r.function_key
      where not exists (select 1 from mc.sops s where s.url = r.url)
      order by r.url
     returning title, function_id`,
    [JSON.stringify(sops)],
  );

  const { rows: unknown } = await client.query(
    `select distinct r.function_key
       from jsonb_to_recordset($1::jsonb) as r(function_key text)
      where r.function_key is not null
        and not exists (select 1 from mc.functions f where f.key = r.function_key)`,
    [JSON.stringify(sops)],
  );

  await client.query(APPLY ? "commit" : "rollback");

  const skipped = sops.length - rows.length;
  console.log(
    `${APPLY ? "Loaded" : "Plan (rolled back, run without --plan to write)"}: ` +
      `${rows.length} inserted, ${skipped} skipped (url already present or listed twice), 0 failed.`,
  );
  if (unknown.length) {
    console.log(`Unknown function_key, loaded with no function: ${unknown.map((u) => u.function_key).join(", ")}`);
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`Import failed, nothing was written: ${e.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
