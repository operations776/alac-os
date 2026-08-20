#!/usr/bin/env node
// Applies pending migrations over the UNPOOLED connection.
//
// Rules this enforces, per ARCHITECTURE.md data law 10:
//   - migrations run in filename order, once each, recorded in schema_migrations
//   - each runs inside a transaction, so a failure leaves nothing half applied
//   - an advisory lock means two processes cannot migrate at the same time,
//     which is why the unpooled connection is mandatory here
//   - a file whose checksum changed after being applied is an error, not a
//     silent no-op, because editing an applied migration desyncs environments

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const LOCK_KEY = 8471_2026; // arbitrary but stable for this app

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set. Run: vercel env pull .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let exitCode = 0;
try {
  await client.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )
  `);

  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows: applied } = await client.query("select filename, checksum from schema_migrations");
  const seen = new Map(applied.map((r) => [r.filename, r.checksum]));

  let count = 0;
  for (const filename of files) {
    const body = await readFile(path.join(dir, filename), "utf8");
    // Checksum the content with line endings normalized, not the raw bytes.
    //
    // On Windows with core.autocrlf, git rewrites these files to CRLF in the
    // working tree. The bytes change, the SQL does not, and a byte checksum
    // then reports every already-applied migration as tampered with, which
    // blocks all future migrations on that machine. Normalizing first makes
    // the checksum mean "did the SQL change", which is what it is guarding.
    //
    // This keeps matching the checksums stored by earlier runs: those files
    // were LF when applied, and normalizing a CRLF copy reproduces exactly
    // that LF content.
    const normalized = body.replace(/\r\n/g, "\n");
    const checksum = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    const previous = seen.get(filename);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `${filename} was already applied but its contents changed.\n` +
            `Applied migrations are immutable. Write a new migration instead.`,
        );
      }
      continue;
    }

    process.stdout.write(`  applying ${filename} ... `);
    try {
      await client.query("begin");
      await client.query(body);
      await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [
        filename,
        checksum,
      ]);
      await client.query("commit");
      console.log("ok");
      count++;
    } catch (error) {
      await client.query("rollback");
      console.log("FAILED");
      throw error;
    }
  }

  console.log(count === 0 ? "Nothing to apply, schema is current." : `Applied ${count} migration(s).`);
} catch (error) {
  console.error(`\nMigration failed: ${error.message}`);
  exitCode = 1;
} finally {
  try {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  } catch {
    // The connection may already be gone; the lock dies with the session anyway.
  }
  await client.end();
}

process.exit(exitCode);
