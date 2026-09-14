#!/usr/bin/env node
// Loads the operations file boundary into the mc schema.
//
// Claude writes what it reads from the Outlook and Drive MCP connections into
// ALAC_DATA_DIR/sync/inbox/ as calendar.json and drive.json. This loads them.
// The files hold real meeting subjects, attendees and document links, which is
// why they live under ALAC_DATA_DIR and never in this repo.
//
//   npm run sync:ops             writes, and records one mc.sync_runs row
//   npm run sync:ops -- --plan   runs every statement, reports, rolls back
//
// Idempotent: every row is an upsert on its existing unique key
// (calendars.email, calendar_events (calendar_id, external_id),
// drive_files.external_id), so a rerun updates in place and never duplicates.
// Everything runs in one transaction, so a bad file leaves nothing half loaded.
//
// Ported from Mission Control scripts/sync-lib.ts (the SQL) and
// scripts/sync-http.ts (the inbox reading and the Outlook timezone fix).
// The original did not write sync/outbox in the HTTP runner; Slack delivery
// is the /api/cron/slack route now, so there is no outbox file here.
//
// Shapes:
//   calendar.json { calendars: [{ email, label, person_email?, color? }],
//                   events: [{ calendar_email, external_id, subject, start, end?,
//                              location?, organizer?, attendees?, show_as?,
//                              is_all_day?, is_cancelled?, web_link?, categories? }] }
//   drive.json    { files: [{ external_id, title, mime_type?, folder?, view_url,
//                             size_bytes?, modified_at?, project? }] }

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

// dotenv never overrides a variable already in the environment, so a
// DATABASE_URL_UNPOOLED set on the command line wins over .env.local.
dotenv.config({ path: ".env.local", quiet: true });

const APPLY = !process.argv.includes("--plan");

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set. Run: vercel env pull .env.local");
  process.exit(1);
}
const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. It must point at the folder holding sync/inbox/.");
  process.exit(1);
}
const INBOX = path.join(dataDir, "sync", "inbox");

function read(name) {
  const file = path.join(INBOX, name);
  if (!existsSync(file)) return null;
  // A malformed file throws: loading half of a broken export is worse than none.
  return JSON.parse(readFileSync(file, "utf8"));
}

// Outlook reports wall-clock times and labels them "UTC" when it cannot read
// the mailbox's timezone, but the numbers are the local times you see in
// Outlook. Taking that label at face value shifted every event by the UTC
// offset (a 9 AM gym slot rendered as 5 AM). So a wall-clock is interpreted in
// TEAM_TZ instead, whatever zone the file claims. Set TEAM_TZ if the company
// ever moves.
const TEAM_TZ = process.env.TEAM_TZ ?? "America/New_York";

/** Offset of a zone from UTC, in minutes, at a given instant. */
function offsetMinutes(wall, tz) {
  const d = new Date(`${wall}Z`);
  const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return (local.getTime() - utc.getTime()) / 60000;
}

// ponytail: the offset is read at the wall-clock taken as UTC, so an event
// within a few hours of a DST switch can land an hour off. Re-read the offset
// at the corrected instant if that ever matters.
function stamp(v) {
  if (!v) return null;
  // Already an instant (Z or an explicit offset such as -04:00): keep it.
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(v)) return new Date(v).toISOString();
  const wall = v.slice(0, 19);
  return new Date(new Date(`${wall}Z`).getTime() - offsetMinutes(wall, TEAM_TZ) * 60000).toISOString();
}

/** Map a Google MIME type to something the UI can put an icon on. */
function iconFor(mime) {
  if (!mime) return "file";
  if (mime.includes("folder")) return "folder";
  if (mime.includes("spreadsheet")) return "sheet";
  if (mime.includes("presentation")) return "slides";
  if (mime.includes("document")) return "doc";
  if (mime.includes("pdf")) return "pdf";
  return "file";
}

// Each loader is one statement over a jsonb array, so the whole file is one
// round trip with one parameter: no per-row statements, no 65535 ceiling.
// `xmax = 0` is true only for a row this statement inserted.
const tally = (rows) => ({
  created: rows.filter((r) => r.inserted).length,
  updated: rows.filter((r) => !r.inserted).length,
});

async function syncCalendar(c, report) {
  const file = read("calendar.json");
  if (!file) {
    report.notes.push("calendar.json not present, skipped.");
    return;
  }

  const cals = await c.query(
    `insert into mc.calendars (email, label, person_id, color, is_active, last_synced_at, last_error)
     select r.email, r.label,
            (select p.id from mc.people p where lower(p.email) = lower(coalesce(r.person_email, r.email)) limit 1),
            coalesce(r.color, '#2a78d6'), true, now(), null
       from jsonb_to_recordset($1::jsonb) as r(email text, label text, person_email text, color text)
     on conflict (email) do update set
       label = excluded.label,
       person_id = coalesce(excluded.person_id, mc.calendars.person_id),
       color = excluded.color,
       is_active = true,
       last_synced_at = now(),
       last_error = null
     returning (xmax = 0) as inserted`,
    [JSON.stringify(file.calendars ?? [])],
  );

  const events = (file.events ?? []).map((e) => ({
    calendar_email: e.calendar_email,
    external_id: e.external_id,
    subject: e.subject,
    starts_at: stamp(e.start),
    ends_at: stamp(e.end),
    is_all_day: e.is_all_day ?? false,
    location: e.location ?? null,
    organizer: e.organizer ?? null,
    attendees: e.attendees ?? [],
    show_as: e.show_as ?? "busy",
    is_cancelled: e.is_cancelled ?? false,
    web_link: e.web_link ?? null,
    categories: e.categories ?? [],
  }));

  // The join drops an event whose calendar is not in mc.calendars, as the
  // original did; the report counts them as skipped.
  const ev = await c.query(
    `insert into mc.calendar_events (calendar_id, external_id, subject, starts_at, ends_at,
       time_zone, is_all_day, location, organizer, attendees, show_as, is_cancelled,
       web_link, categories, synced_at)
     select cal.id, r.external_id, r.subject, r.starts_at, r.ends_at,
            $2, r.is_all_day, r.location, r.organizer,
            array(select jsonb_array_elements_text(r.attendees)),
            r.show_as, r.is_cancelled, r.web_link,
            array(select jsonb_array_elements_text(r.categories)),
            now()
       from jsonb_to_recordset($1::jsonb) as r(
              calendar_email text, external_id text, subject text,
              starts_at timestamptz, ends_at timestamptz, is_all_day boolean,
              location text, organizer text, attendees jsonb, show_as text,
              is_cancelled boolean, web_link text, categories jsonb)
       join mc.calendars cal on lower(cal.email) = lower(r.calendar_email)
     on conflict (calendar_id, external_id) do update set
       subject = excluded.subject, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
       time_zone = excluded.time_zone, is_all_day = excluded.is_all_day,
       location = excluded.location, organizer = excluded.organizer,
       attendees = excluded.attendees, show_as = excluded.show_as,
       is_cancelled = excluded.is_cancelled, web_link = excluded.web_link,
       categories = excluded.categories, synced_at = now()
     returning (xmax = 0) as inserted`,
    [JSON.stringify(events), TEAM_TZ],
  );

  await c.query(
    `update mc.integrations set is_connected = true, last_synced_at = now(), last_error = null
      where key = 'outlook'`,
  );

  const a = tally(cals.rows);
  const b = tally(ev.rows);
  const skipped = events.length - ev.rowCount;
  report.created += a.created + b.created;
  report.updated += a.updated + b.updated;
  report.flagged += skipped;
  report.notes.push(
    `calendar: ${cals.rowCount} calendars (${a.created} new), ${ev.rowCount} events ` +
      `(${b.created} new, ${b.updated} updated)` +
      (skipped ? `, ${skipped} skipped: their calendar_email is not in calendars` : "") +
      `. Wall clock read in ${TEAM_TZ}.`,
  );
}

async function syncDrive(c, report) {
  const file = read("drive.json");
  if (!file) {
    report.notes.push("drive.json not present, skipped.");
    return;
  }

  const files = (file.files ?? []).map((f) => ({
    external_id: f.external_id,
    title: f.title,
    mime_type: f.mime_type ?? null,
    folder: f.folder ?? null,
    view_url: f.view_url,
    icon_kind: iconFor(f.mime_type),
    size_bytes: f.size_bytes ?? null,
    modified_at: f.modified_at ?? null,
    project: f.project ?? null,
  }));

  // A project named in the file attaches by case-insensitive substring of the
  // project name. position() rather than ilike, so a % in a name is literal.
  // A file with no match is simply indexed, and a match found earlier is kept.
  const res = await c.query(
    `insert into mc.drive_files (external_id, title, mime_type, folder, view_url, icon_kind,
       size_bytes, modified_at, project_id, synced_at)
     select r.external_id, r.title, r.mime_type, r.folder, r.view_url, r.icon_kind,
            r.size_bytes, r.modified_at,
            (select p.id from mc.projects p
              where r.project is not null and position(lower(r.project) in lower(p.name)) > 0
              limit 1),
            now()
       from jsonb_to_recordset($1::jsonb) as r(
              external_id text, title text, mime_type text, folder text, view_url text,
              icon_kind text, size_bytes bigint, modified_at timestamptz, project text)
     on conflict (external_id) do update set
       title = excluded.title, mime_type = excluded.mime_type, folder = excluded.folder,
       view_url = excluded.view_url, icon_kind = excluded.icon_kind,
       size_bytes = excluded.size_bytes, modified_at = excluded.modified_at,
       project_id = coalesce(excluded.project_id, mc.drive_files.project_id),
       synced_at = now()
     returning (xmax = 0) as inserted`,
    [JSON.stringify(files)],
  );

  await c.query(
    `update mc.integrations set is_connected = true, last_synced_at = now(), last_error = null
      where key = 'drive'`,
  );

  const t = tally(res.rows);
  report.created += t.created;
  report.updated += t.updated;
  report.notes.push(`drive: ${res.rowCount} files (${t.created} new, ${t.updated} updated).`);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const startedAt = new Date().toISOString();
const report = { created: 0, updated: 0, flagged: 0, errors: 0, error: null, notes: [] };

try {
  await client.query("begin");
  await syncCalendar(client, report);
  await syncDrive(client, report);
  await client.query(APPLY ? "commit" : "rollback");
} catch (e) {
  await client.query("rollback").catch(() => {});
  report.errors += 1;
  report.error = e.message;
}

for (const n of report.notes) console.log(`  ${n}`);
console.log(
  `\n${APPLY ? "Applied" : "Plan (rolled back, run without --plan to write)"}: ` +
    `${report.created} created, ${report.updated} updated, ${report.flagged} skipped, ${report.errors} failed.`,
);
if (report.error) console.error(`Sync failed, nothing was written: ${report.error}`);

// The run is recorded outside the data transaction, so a failed sync still
// leaves a row saying it failed and why.
if (APPLY) {
  await client.query(
    `insert into mc.sync_runs (source, started_at, finished_at, ok, created, updated, flagged,
       errors, error_text, notes)
     values ('ops_inbox', $1, now(), $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      startedAt,
      report.errors === 0,
      report.created,
      report.updated,
      report.flagged,
      report.errors,
      report.error,
      JSON.stringify(report.notes),
    ],
  );
}

await client.end();
process.exit(report.errors ? 1 : 0);
