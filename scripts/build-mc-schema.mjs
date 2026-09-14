// Folds the 75 Mission Control Supabase migrations into one alac-os migration
// that lives in the `mc` schema. Usage: node build-mc-schema.mjs <mc repo> <out.sql>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , repo, out] = process.argv;
const dir = join(repo, "supabase", "migrations");

// Split SQL into statements, respecting quotes, dollar quotes and comments.
// Comments are dropped: the reasoning lives in the Mission Control history.
export function split(text) {
  const stmts = [];
  let cur = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === "--") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (two === "/*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
        if (text[j] === "'") break;
        j++;
      }
      cur += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end === -1 ? text.length : end + tag.length;
        // Comments inside a function body are kept verbatim; stripping them
        // would need a second parser and they are harmless.
        cur += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ";") {
      if (cur.trim()) stmts.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

const DROP = [
  /^create\s+policy\b/i,
  /^drop\s+policy\b/i,
  /^alter\s+policy\b/i,
  /^grant\b/i,
  /^revoke\b/i,
  /^alter\s+default\s+privileges\b/i,
  /^alter\s+table\s+[\w.]+\s+(enable|force|disable)\s+row\s+level\s+security$/i,
  /\bstorage\.(buckets|objects)\b/i,
  /\bon\s+auth\.users\b/i,
  /^create\s+extension\b/i,
  // The SOP library seed carries the client's own document links. It is data,
  // loaded by import:ops from ALAC_DATA_DIR, never committed.
  /^insert\s+into\s+sops\b/i,
  // Two loops that only create per-table policies.
  /^do\s+\$\$\s*declare\s+t\s+text;\s*begin\s*foreach[\s\S]*create\s+policy[\s\S]*end\s+loop;\s*end;?\s*\$\$$/i,
];

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const kept = [];
const dropped = {};
for (const f of files) {
  for (let s of split(readFileSync(join(dir, f), "utf8"))) {
    const rule = DROP.find((r) => r.test(s));
    if (rule) {
      dropped[rule.source] = (dropped[rule.source] ?? 0) + 1;
      continue;
    }
    s = s
      .replace(/\bpublic\./g, "mc.")
      .replace(/\bauth\.users\b/g, "public.users")
      .replace(/\bauth\.uid\(\)/g, "mc.uid()")
      // A person looked up by first name. content_reviewer() is the same
      // founder, found by role, and is what every later review path uses.
      .replace(/\(select id from people where is_admin and name = '[^']+'\)/g, "content_reviewer()")
      .replace(/new\.raw_user_meta_data\s*->>\s*'name'/g, "new.full_name")
      .replace(/set\s+search_path\s*=\s*(public|'')/gi, "set search_path = mc, public")
      // House rule: no em dashes, in copy or in comments.
      .replace(/\s*—\s*/g, ", ");
    kept.push(`-- ${f}\n${s};`);
  }
}

const leftovers = kept.filter((s) => /\bauth\.|\bstorage\.|\bauthenticated\b|\bservice_role\b|\banon\b/.test(s));

const header = `-- Mission Control, folded into ALAC OS.
--
-- The 75 Supabase migrations of ALAC Mission Control, applied in order inside
-- their own schema so no table, type or function can collide with the desk.
-- Generated, not hand written: see scripts/build-mc-schema.mjs. Comments are
-- stripped because this repo is public; the reasoning lives in the Mission
-- Control history.
--
-- What changed on the way in, and nothing else:
--   RLS policies and grants are gone. Neon has no JWT layer, so enforcement is
--   in server code, ARCHITECTURE.md section 3 and section 11.
--   auth.uid() is mc.uid(), read from the app.user_id setting that the ops
--   transaction helper sets. Triggers keep their actor attribution.
--   auth.users is public.users: one human, one row, shared with the desk.
--   The storage bucket is gone; attachments are links.

create schema if not exists mc;
set local search_path = mc, public;

create or replace function mc.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$fn$;
`;

const footer = `
-- One human, one row. A desk user is a Mission Control person the moment
-- they exist, through the same provisioning function Supabase Auth called.
create trigger on_user_created
  after insert on public.users
  for each row execute function mc.handle_new_user();

insert into mc.people (id, email, name, role, state)
select u.id, u.email,
       coalesce(nullif(u.full_name, ''), split_part(u.email, '@', 1)),
       (select case when bool_or(m.role = 'owner') then 'owner'
                    when bool_or(m.role = 'admin') then 'admin'
                    else 'member' end
          from public.org_memberships m where m.user_id = u.id)::mc.user_role,
       'active'
  from public.users u
on conflict (id) do nothing;
-- Every function resolves names inside mc first, whatever the caller's path.
do $do$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'mc' and p.prokind in ('f', 'p')
  loop
    execute format('alter function %s set search_path = mc, public', f.sig);
  end loop;
end $do$;
`;

writeFileSync(out, header + "\n" + kept.join("\n\n") + "\n" + footer);
console.log(`statements kept ${kept.length}`, dropped);
console.log(`leftover supabase references: ${leftovers.length}`);
for (const l of leftovers) console.log("----\n" + l.slice(0, 400));
