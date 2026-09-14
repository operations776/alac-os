#!/usr/bin/env node
// Demo data for the operations board, and the team it is assigned to.
//
//   npm run seed:demo                      plan: runs every statement, reports, rolls back
//   npm run seed:demo -- --apply           loads the team and the demo week, commits
//   npm run seed:demo -- --remove          deletes exactly the rows the demo inserted
//   npm run seed:demo -- --team-only       the team only (add --apply to write)
//
// Connects over DATABASE_URL_UNPOOLED. An env var already set wins over
// .env.local, so point it at a local database on the command line to try it.
//
// The team. ALAC_DATA_DIR/team.json is an array of
//   { name, email, title, role, function_key, department? }
// It names real people, so it lives outside this repo. A person with no
// public.users row (matched on lower(email)) gets one with no password and a
// member org membership, which provisions mc.people through the users trigger.
// Every listed person then gets the file's title, role, function and
// department. People not in the file are never touched, and the team is not
// demo data: --remove leaves it alone.
//
// The demo week. Fictional companies only, this repo is public. Everything is
// written through the tables the app uses, in ONE transaction, with
// app.user_id set to an owner so the triggers attribute history and open the
// same review tasks and notifications real work does. GTM accounts walk their
// stages one update at a time, confirming the SourceWhale load before the
// outreach stages, so the gate triggers run rather than being bypassed.
//
// The ledger (mc.demo_rows, migration 0028). The transaction runs at
// repeatable read and snapshots the id of every row in every mc table keyed by
// a uuid id before seeding. After seeding, every id that is new is recorded in
// the ledger: the rows this script inserted AND the rows its inserts made
// through triggers (activity, notifications, review tasks, companies). Under
// repeatable read nobody else's concurrent commit is visible, so the
// difference is exactly this run. Slack outbox rows the triggers queued are
// dropped before commit: demo work must never message a real person in Slack.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const REMOVE = args.includes("--remove");
const TEAM_ONLY = args.includes("--team-only");

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set. Run: vercel env pull .env.local");
  process.exit(1);
}

const ROLES = ["owner", "admin", "manager", "member", "viewer"];

// --- Fixtures --------------------------------------------------------------------
// `who` is an index into the active team, so the week spreads across whoever is
// on it. `due` is days from today; `at` is a due time, used when the column exists.

const PROJECTS = [
  { name: "Northwind Aerospace: VP Supply Chain search", department: "delivery", fn: "delivery",
    health: "watch", who: 0, due: 21,
    description: "Retained search. Shortlist due end of next week." },
  { name: "Q4 Thought Leadership Program", department: "marketing", fn: "marketing",
    health: "on_track", who: 2, due: 45,
    description: "Weekly posts, the monthly newsletter and two short videos." },
  { name: "Helix Orbital Account Expansion", department: "operations", fn: "gtm",
    health: "at_risk", who: 3, due: 14,
    description: "Second search at Helix off the back of the contract award." },
  { name: "Desk Reporting Refresh", department: "admin", fn: "operations",
    health: "on_track", who: 0, due: 30,
    description: "Rebuild the weekly pipeline report on the new board." },
];

const TASKS = [
  // project, title, status, priority, who, due, at, extra
  [0, "Calibration call with Northwind hiring manager", "done", "high", 1, -6],
  [0, "Build target company map for supply chain leaders", "done", "normal", 4, -4],
  [0, "Source 40 profiles from aerospace primes", "doing", "high", 4, 0, "16:00"],
  [0, "Screen first 12 candidates", "doing", "normal", 5, 2],
  [0, "Send shortlist of five to Northwind", "todo", "high", 0, 5],
  [0, "Chase interview feedback on two finalists", "blocked", "high", 3, -2, null,
    "Hiring manager is travelling until Thursday"],
  [0, "Draft offer benchmarking note", "backlog", "low", 0, 12],
  [0, "Reference checks for lead finalist", "review", "normal", 5, -1],
  [1, "Write LinkedIn post on shrinking cleared talent pools", "doing", "normal", 2, 0, "11:00"],
  [1, "Record podcast intro for episode three", "todo", "normal", 1, 3],
  [1, "Design carousel template for hiring market stats", "review", "normal", 2, -1],
  [1, "Publish September hiring market newsletter", "done", "high", 1, -3],
  [1, "Collect three client quotes for the case study", "blocked", "normal", 2, -5, null,
    "Waiting on legal sign off at Cobalt Defense Systems"],
  [1, "Plan October content calendar", "backlog", "normal", 1, 10],
  [1, "Edit short video on the three intake questions", "todo", "low", 2, 4],
  [2, "Map Helix Orbital propulsion org chart", "done", "normal", 3, -5],
  [2, "Identify decision makers in avionics", "doing", "high", 3, 0, "14:30"],
  [2, "Prepare account brief for review", "review", "high", 3, 0, "17:00"],
  [2, "Draft outreach for VP Engineering", "todo", "normal", 4, 1],
  [2, "Confirm SourceWhale sequence is loaded", "todo", "high", 3, -1],
  [2, "Research the recent contract award announcement", "backlog", "low", 4, 9],
  [2, "Follow up on advisor introduction", "blocked", "normal", 0, -3, null,
    "Advisor has not replied to the intro request"],
  [3, "Refresh weekly pipeline report", "doing", "normal", 0, 1],
  [3, "Clean duplicate companies in the tracker", "todo", "low", 3, 6],
  [3, "Set up requisition scoring review", "review", "normal", 0, 2],
  [3, "Archive closed Q2 searches", "done", "low", 5, -2],
  [null, "Renew LinkedIn Recruiter seats", "todo", "high", 0, -4],
  [null, "Onboard new delivery associate", "doing", "normal", 4, 3],
  [null, "Update candidate privacy notice", "backlog", "low", 1, 14],
  [null, "Book quarterly planning offsite", "todo", "normal", 0, 0, "10:00"],
];

const CHECKLISTS = {
  "Source 40 profiles from aerospace primes": [
    ["Pull alumni lists from three primes", true], ["Filter for supplier quality background", true],
    ["Enrich emails", false], ["Tag top 15 for screening", false]],
  "Send shortlist of five to Northwind": [
    ["Write candidate summaries", false], ["Confirm compensation expectations", false],
    ["Book debrief with hiring manager", false]],
  "Prepare account brief for review": [
    ["Summarise the contract award", true], ["List four decision makers", false],
    ["Recommend first persona", false]],
};

const COMMENTS = [
  ["Chase interview feedback on two finalists", 0, "Pinged their EA as well. If nothing by Wednesday I will call."],
  ["Design carousel template for hiring market stats", 1, "Slide three reads better with the percentage first."],
  ["Prepare account brief for review", 0, "Add the propulsion team headcount, it is the strongest hook."],
  ["Source 40 profiles from aerospace primes", 3, "Found a strong pocket of talent at a tier one supplier, adding them today."],
];

const COLLABORATORS = [
  ["Send shortlist of five to Northwind", 1],
  ["Prepare account brief for review", 0],
];

const CONTENT = [
  // title, kind, platform, status, who, publish, hook, extra platforms
  ["Cleared talent is the real bottleneck", "post", "linkedin", "idea", 2, null,
    "Every defense program slips on the same line item: people."],
  ["What a VP Supply Chain search really costs", "article", "linkedin", "idea", 1, null,
    "The fee is the cheapest part of a failed search."],
  ["Three intake questions that save a search", "short", "youtube", "in_progress", 2, 4,
    "Ask these before you source a single profile."],
  ["Hiring market snapshot: space and defense", "carousel", "linkedin", "in_progress", 1, 6,
    "Five charts on where the senior engineers went.", ["instagram"]],
  ["Why exclusive searches close faster", "post", "linkedin", "review", 2, 2,
    "Three agencies on one role is three half searches."],
  ["Behind the search: Northwind Aerospace", "long", "youtube", "review", 1, 8,
    "How a six month vacancy closed in five weeks."],
  ["October hiring market newsletter", "newsletter", "newsletter", "ready", 1, 1,
    "Hiring is up, acceptance rates are down."],
  ["Five signals a company is about to hire", "post", "x", "ready", 2, 3,
    "Funding is the obvious one. The other four are better.", ["linkedin"]],
  ["How we shortlist in 21 days", "post", "linkedin", "published", 2, -5,
    "Twenty one days is a process problem, not a sourcing problem."],
  ["September hiring market report", "newsletter", "newsletter", "published", 1, -9,
    "The numbers behind a busy quarter."],
];

const STAGES = ["target", "researching", "contacts_found", "pending_review", "approved_build",
  "pending_outreach", "outreach_active", "engaged", "complete"];

const GTM = [
  { company: "Helix Orbital", website: "https://helixorbital.example", industry: "Space Systems",
    stage: "engaged", priority: "high", signal: "contract_award", owner: 0, researcher: 3,
    why: "Won a propulsion contract and posted six senior roles in a week.",
    next: "Book discovery call with VP Engineering", nextOn: 1,
    contacts: [["Priya Raman", "VP Engineering", 5, "Propulsion"], ["Tom Keller", "Director of Talent", 4, null]] },
  { company: "Cobalt Defense Systems", website: "https://cobaltdefense.example", industry: "Defense Electronics",
    stage: "outreach_active", priority: "high", signal: "funding", owner: 0, researcher: 4,
    why: "Series C closed last month, hiring plan doubles engineering.",
    next: "Second persona goes out Thursday", nextOn: 3,
    contacts: [["Marcus Lee", "Chief Technology Officer", 5, "Engineering"], ["Dana Ortiz", "Head of Hardware", 4, "Hardware"]] },
  { company: "Northwind Aerospace", website: "https://northwind-aero.example", industry: "Aerostructures",
    stage: "complete", priority: "normal", signal: "hiring_growth", owner: 0, researcher: 3,
    why: "Opened a second plant and lost their supply chain lead.",
    outcome: "meeting", outcomeNote: "Meeting held, retained search signed.",
    contacts: [["Elena Brooks", "COO", 5, "Operations"], ["Sam Whitaker", "VP Operations", 4, "Supply chain"]] },
  { company: "Vantage Propulsion", website: "https://vantagepropulsion.example", industry: "Propulsion",
    stage: "pending_outreach", priority: "normal", signal: "new_program", owner: 0, researcher: 4,
    why: "New hypersonics program announced with a named program lead.",
    next: "Launch once the copy is approved", nextOn: 2,
    contacts: [["Jordan Hale", "Program Director", 4, "Test engineering"], ["Chris Nolan", "VP People", 4, null]] },
  { company: "Aurora Microsystems", website: "https://auroramicro.example", industry: "Semiconductors",
    stage: "approved_build", priority: "normal", signal: "expansion", owner: 0, researcher: 5,
    why: "Expanding the RF design center, three leads hired from competitors.",
    next: "Build the SourceWhale list", nextOn: 2,
    contacts: [["Mei Tanaka", "Director of RF Design", 4, "RF engineering"]] },
  { company: "Tidewater Autonomy", website: "https://tidewater-autonomy.example", industry: "Maritime Autonomy",
    stage: "pending_review", priority: "high", signal: "new_leadership", owner: 0, researcher: 3,
    why: "New CEO from a defense prime, reorganising software.",
    next: "Owner review of the account brief", nextOn: 0,
    contacts: [["Alex Moreno", "CEO", 5, null], ["Ruth Adeyemi", "Head of Autonomy", 4, "Software"]] },
  { company: "Summit Ridge Robotics", website: "https://summitridge.example", industry: "Robotics",
    stage: "contacts_found", priority: "normal", signal: "production_ramp", owner: 0, researcher: 5,
    why: "Moving from pilot to volume production this quarter.",
    next: "Pick the first persona", nextOn: 1,
    contacts: [["Ben Carter", "VP Manufacturing", 4, "Manufacturing"]] },
  { company: "Ironclad Materials", website: "https://ironclad-materials.example", industry: "Advanced Materials",
    stage: "researching", priority: "low", signal: "acquisition", owner: 0, researcher: 4,
    why: "Acquired a composites supplier, integration team forming.",
    next: "Find who runs integration", nextOn: -1 },
  { company: "Meridian Launch", website: "https://meridianlaunch.example", industry: "Space Launch",
    stage: "target", priority: "normal", signal: "funding", owner: 0, researcher: 3,
    why: "Raised a growth round, launch cadence target doubled.",
    next: "Pick up and start research", nextOn: 2 },
];

// Two accounts get drafted outreach: one approved, one waiting for review.
const DRAFTS = [
  { company: "Cobalt Defense Systems", status: "approved", final: true },
  { company: "Vantage Propulsion", status: "ready_for_review", final: false },
];

const REQUISITIONS = [
  { company: "Northwind Aerospace", role: "VP Supply Chain", openings: 1, comp: [210000, 240000, 270000],
    fee: 25, type: "retained", competition: "alac_only", approval: "approved", start: 40, interviews: 10,
    consequence: "mission", intake: "hm_final", hm: "direct", process: "defined", work: "hybrid",
    relocation: "no", clearance: "none", industry: "strong", musts: "one_three", adjacent: "yes",
    difficulty: "medium", viable: 3, best: "interview", likes: 2, feedback: 2, status: "active", who: 0,
    location: "Wichita, KS" },
  { company: "Helix Orbital", role: "Principal Propulsion Engineer", openings: 2, comp: [180000, 200000, 220000],
    fee: 22, type: "exclusive_contingent", competition: "internal_plus_alac", approval: "approved", start: 55,
    interviews: 14, consequence: "operational", intake: "hm_plus_hr", hm: "through_hr", process: "partial",
    work: "onsite", relocation: "yes", clearance: "secret", industry: "preferred", musts: "four_six",
    adjacent: "maybe", difficulty: "hard", viable: 1, best: "submitted", likes: 1, feedback: 5,
    status: "active", who: 5, location: "Denver, CO" },
  { company: "Cobalt Defense Systems", role: "Director of Program Management", openings: 1,
    comp: [190000, 215000, 235000], fee: 20, type: "non_exclusive_contingent", competition: "one_two_agencies",
    approval: "pending", start: 75, interviews: null, consequence: "growth", intake: "hr_only", hm: "through_hr",
    process: "partial", work: "onsite", relocation: "no", clearance: "ts", industry: "strong", musts: "four_six",
    adjacent: "maybe", difficulty: "hard", viable: 0, best: "none", likes: 0, feedback: null,
    status: "calibrating", who: 4, location: "Huntsville, AL" },
  { company: "Aurora Microsystems", role: "Senior RF Design Engineer", openings: 3, comp: [160000, 175000, 190000],
    fee: 20, type: "engaged", competition: "alac_only", approval: "approved", start: 30, interviews: 7,
    consequence: "operational", intake: "hm_final", hm: "direct", process: "defined", work: "hybrid",
    relocation: "no", clearance: "able", industry: "preferred", musts: "one_three", adjacent: "yes",
    difficulty: "medium", viable: 4, best: "final", likes: 3, feedback: 1, status: "active", who: 5,
    location: "San Diego, CA" },
  { company: "Tidewater Autonomy", role: "Head of Autonomy Software", openings: 1, comp: [230000, 260000, 290000],
    fee: 25, type: "retained", competition: "alac_only", approval: "exploratory", start: 120, interviews: null,
    consequence: "normal", intake: "unknown", hm: "unknown", process: "undefined", work: "remote",
    relocation: "no", clearance: "none", industry: "preferred", musts: "one_three", adjacent: "yes",
    difficulty: "medium", viable: 0, best: "none", likes: 0, feedback: null, status: "not_activated", who: 0,
    location: "Remote", unsigned: true },
  { company: "Summit Ridge Robotics", role: "Manufacturing Engineering Manager", openings: 1,
    comp: [140000, 155000, 170000], fee: 22, type: "exclusive_contingent", competition: "alac_only",
    approval: "approved", start: -20, interviews: -40, consequence: "operational", intake: "hm_final", hm: "direct",
    process: "defined", work: "onsite", relocation: "yes", clearance: "none", industry: "strong",
    musts: "one_three", adjacent: "yes", difficulty: "easy", viable: 2, best: "offer", likes: 2, feedback: 1,
    status: "filled", who: 4, location: "Pittsburgh, PA" },
  { company: "Meridian Launch", role: "Launch Operations Lead", openings: 1, comp: [150000, 170000, 185000],
    fee: 20, type: "exclusive_contingent", competition: "alac_only", approval: "pending", start: 90,
    interviews: null, consequence: "growth", intake: "hm_plus_hr", hm: "direct", process: "partial",
    work: "onsite", relocation: "yes", clearance: "able", industry: "strong", musts: "four_six",
    adjacent: "maybe", difficulty: "medium", viable: 0, best: "none", likes: 0, feedback: null,
    status: "on_hold", who: 5, location: "Cape Canaveral, FL", pause: "Budget review until next quarter" },
];

const IDEAS = [
  { title: "Auto-draft the weekly client update from the board", impact: "high", who: 3, status: "planned",
    problem: "Client updates take an hour each Friday.", proposal: "Generate a draft from the week's moves.",
    votes: [0, 1, 2] },
  { title: "Shared library of intake call questions", impact: "medium", who: 5, status: "new",
    problem: "Every recruiter asks different questions.", proposal: "One living doc linked from each requisition.",
    votes: [3, 4] },
  { title: "Flag requisitions with no progress in seven days", impact: "high", who: 4, status: "reviewing",
    problem: "Stalled searches are noticed too late.", proposal: "A badge and a Monday digest.",
    votes: [0, 3, 5], priority: true },
  { title: "Template for candidate submission emails", impact: "low", who: 2, status: "new",
    problem: "Submissions look different per recruiter.", proposal: "One template with the scorecard inline.",
    votes: [1] },
];

const RECURRING = [
  { title: "Weekly pipeline review", project: 3, who: 0, frequency: "weekly",
    rule: { kind: "weekday", day_of_week: 1 },
    checklist: ["Review every active requisition", "Update health on each project", "Set next week's priorities"] },
  { title: "Monthly content performance report", project: 1, who: 2, frequency: "monthly",
    rule: { kind: "day_of_month", day_of_month: 1 },
    checklist: ["Export LinkedIn analytics", "Newsletter open and click rates", "Pick next month's pillars"] },
];

const SOPS = [
  { title: "Running an intake call", slug: "intake-call", fn: "operations", essential: true, order: 1,
    summary: "The questions to ask, what to write down, and what to send after." },
  { title: "Confirming a SourceWhale load", slug: "sourcewhale-load", fn: "gtm", essential: true, order: 2,
    summary: "Every hiring manager and above included before outreach starts." },
  { title: "Publishing a LinkedIn post", slug: "linkedin-post", fn: "marketing", essential: false, order: 3,
    summary: "From approved draft to scheduled post, with the link logged back on the board." },
];

// --- Database ------------------------------------------------------------------------

const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

/** A catalog-sourced table name, checked before it is put into SQL. */
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected table name ${name}`);
  return `mc.${name}`;
}

async function loadTeam() {
  const dataDir = process.env.ALAC_DATA_DIR;
  const file = dataDir && path.join(dataDir, "team.json");
  if (!file || !existsSync(file)) {
    throw new Error("ALAC_DATA_DIR/team.json was not found. It holds the team and never enters the repo.");
  }
  const team = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(team)) throw new Error("team.json must be an array.");

  const [org] = await q("select id from public.orgs order by created_at limit 1");
  if (!org) throw new Error("There is no org to add team members to.");

  const report = { created: [], updated: [] };
  for (const p of team) {
    if (!p?.email || !p?.name || !ROLES.includes(p.role)) {
      throw new Error(`team.json entry needs name, email and a role in ${ROLES.join(", ")}: ${JSON.stringify(p)}`);
    }
    // The unique index on lower(email) is the race guard; this insert only
    // happens for someone who does not have an account.
    const made = await q(
      `insert into public.users (email, full_name, password_hash)
       select $1, $2, null
        where not exists (select 1 from public.users where lower(email) = lower($1))
       returning id`,
      [p.email.trim(), p.name.trim()],
    );
    const [user] = made.length
      ? made
      : await q("select id from public.users where lower(email) = lower($1)", [p.email.trim()]);
    if (made.length) {
      await q(
        `insert into public.org_memberships (org_id, user_id, role) values ($1, $2, 'member')
         on conflict (org_id, user_id) do nothing`,
        [org.id, user.id],
      );
    }

    const fn = p.function_key
      ? (await q("select id from mc.functions where key = $1", [p.function_key]))[0]
      : null;
    if (p.function_key && !fn) throw new Error(`No function with key ${p.function_key} (for ${p.name}).`);

    const hit = await q(
      `update mc.people
          set title = $2, role = $3::mc.user_role, function_id = coalesce($4, function_id),
              department = coalesce($5::mc.department, department)
        where id = $1 returning id`,
      [user.id, p.title ?? null, p.role, fn?.id ?? null, p.department ?? null],
    );
    if (!hit.length) throw new Error(`${p.email} has no mc.people row; the users trigger did not provision it.`);
    (made.length ? report.created : report.updated).push(`${p.name} (${p.role})`);
  }

  const [owners] = await q("select count(*)::int as n from mc.people where role = 'owner' and state = 'active'");
  if (!owners.n) throw new Error("team.json would leave no active owner. Nothing was changed.");

  const [nopw] = await q(
    `select count(*)::int as n from public.users
      where lower(email) = any($1::text[]) and password_hash is null`,
    [team.map((p) => p.email.trim().toLowerCase())],
  );
  report.noPassword = nopw.n;
  return report;
}

/** Tables keyed by one uuid `id`: the ones the ledger can name a row in. */
async function ledgerTables() {
  const rows = await q(`
    select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_constraint k on k.conrelid = c.oid and k.contype = 'p'
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
     where n.nspname = 'mc' and c.relkind = 'r' and array_length(k.conkey, 1) = 1
       and a.attname = 'id' and a.atttypid = 'uuid'::regtype
       and c.relname <> 'people'
     order by 1`);
  return rows.map((r) => r.name);
}

async function seedDemo(owner) {
  const warnings = [];
  const team = await q(
    `select id, name from mc.people where state = 'active' and is_active
      order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at`,
  );
  const who = (i) => team[i % team.length].id;
  const [{ has_due_time: hasDueTime }] = await q(
    `select exists (select 1 from information_schema.columns
                     where table_schema = 'mc' and table_name = 'tasks' and column_name = 'due_time')
            as has_due_time`,
  );
  const fnId = async (key) => (await q("select id from mc.functions where key = $1", [key]))[0]?.id ?? null;

  // Projects.
  const projectIds = [];
  for (const p of PROJECTS) {
    const [row] = await q(
      `insert into mc.projects (name, description, owner_id, department, function_id, health, due_date)
       values ($1, $2, $3, $4::mc.department, $5, $6::mc.health, current_date + $7::int) returning id`,
      [p.name, p.description, who(p.who), p.department, await fnId(p.fn), p.health, p.due],
    );
    projectIds.push(row.id);
  }

  // Tasks, in one statement. Done tasks arrive archived, which is how the app
  // files finished work.
  const taskRows = TASKS.map(([project, title, status, priority, w, due, at, blocked], i) => ({
    project_id: project === null ? null : projectIds[project], title, status, priority,
    assignee_id: who(w), due, due_time: at ?? null, blocked_reason: blocked ?? null,
    created_by: owner, position: i,
  }));
  const tasks = await q(
    `insert into mc.tasks (project_id, title, status, priority, assignee_id, due_date,
                           blocked_reason, created_by, position${hasDueTime ? ", due_time" : ""})
     select r.project_id, r.title, r.status::mc.task_status, r.priority::mc.priority, r.assignee_id,
            current_date + r.due, r.blocked_reason, r.created_by, r.position${hasDueTime ? ", r.due_time::time" : ""}
       from jsonb_to_recordset($1::jsonb) as r(project_id uuid, title text, status text, priority text,
              assignee_id uuid, due int, due_time text, blocked_reason text, created_by uuid, position int)
     returning id, title`,
    [JSON.stringify(taskRows)],
  );
  const taskId = Object.fromEntries(tasks.map((t) => [t.title, t.id]));

  const checklist = Object.entries(CHECKLISTS).flatMap(([title, items]) =>
    items.map(([content, done], i) => ({ task_id: taskId[title], content, is_done: done, position: i })));
  await q(
    `insert into mc.checklist_items (task_id, content, is_done, position)
     select * from jsonb_to_recordset($1::jsonb) as r(task_id uuid, content text, is_done boolean, position int)`,
    [JSON.stringify(checklist)],
  );
  await q(
    `insert into mc.comments (task_id, author_id, body, created_at)
     select r.task_id, r.author_id, r.body, now() - make_interval(hours => r.ago)
       from jsonb_to_recordset($1::jsonb) as r(task_id uuid, author_id uuid, body text, ago int)`,
    [JSON.stringify(COMMENTS.map(([t, w, body], i) => ({ task_id: taskId[t], author_id: who(w), body, ago: 2 + i * 5 })))],
  );
  await q(
    `insert into mc.task_collaborators (task_id, person_id)
     select * from jsonb_to_recordset($1::jsonb) as r(task_id uuid, person_id uuid)
     on conflict do nothing`,
    [JSON.stringify(COLLABORATORS.map(([t, w]) => ({ task_id: taskId[t], person_id: who(w) })))],
  );

  // Content. Review and published pieces move there by update, so the review
  // task and the publication record come from the triggers, as in the app.
  for (const [title, kind, platform, status, w, publish, hook, extra = []] of CONTENT) {
    const insertStatus = status === "review" ? "in_progress" : status === "published" ? "ready" : status;
    const [row] = await q(
      `insert into mc.content (title, kind, platform, status, owner_id, publish_date, hook, created_by)
       values ($1, $2::mc.content_kind, $3::mc.platform, $4::mc.content_status, $5,
               current_date + $6::int, $7, $8) returning id`,
      [title, kind, platform, insertStatus, who(w), publish, hook, owner],
    );
    await q(
      `insert into mc.content_platforms (content_id, platform)
       select $1, p::mc.platform from unnest($2::text[]) p on conflict do nothing`,
      [row.id, [platform, ...extra]],
    );
    if (status === "review") {
      await q("update mc.content set status = 'review' where id = $1", [row.id]);
    }
    if (status === "published") {
      await q(
        "update mc.content set status = 'published', published_url = $2 where id = $1",
        [row.id, `https://example.com/posts/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`],
      );
    }
  }

  // GTM. Insert at target, then walk forward one stage at a time.
  const accountId = {};
  const contactIds = {};
  for (const a of GTM) {
    const [row] = await q(
      `insert into mc.gtm_accounts (company, website, industry, owner_id, researcher_id, priority,
                                    signal_type, signal_source, signal_note, signal_date, why_now,
                                    next_action, next_action_on, created_by)
       values ($1, $2, $3, $4, $5, $6::mc.priority, $7::mc.gtm_signal_type, 'news', $8,
               current_date - 6, $8, $9, current_date + $10::int, $11) returning id`,
      [a.company, a.website, a.industry, who(a.owner), who(a.researcher), a.priority, a.signal,
       a.why, a.next ?? null, a.nextOn ?? null, owner],
    );
    accountId[a.company] = row.id;

    if (a.contacts?.length) {
      const made = await q(
        `insert into mc.gtm_contacts (account_id, name, title, seniority, hiring_for, persona_order,
                                      linkedin_url, created_by)
         select $1, r.name, r.title, r.seniority, r.hiring_for, r.persona_order, r.linkedin_url, $2
           from jsonb_to_recordset($3::jsonb) as r(name text, title text, seniority int, hiring_for text,
                  persona_order int, linkedin_url text)
         returning id, persona_order`,
        [row.id, owner, JSON.stringify(a.contacts.map(([name, title, seniority, hiringFor], i) => ({
          name, title, seniority, hiring_for: hiringFor, persona_order: i,
          linkedin_url: `https://example.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        })))],
      );
      contactIds[a.company] = made.sort((x, y) => x.persona_order - y.persona_order).map((c) => c.id);
    }

    const target = STAGES.indexOf(a.stage);
    for (let s = 1; s <= target; s++) {
      const stage = STAGES[s];
      const [cap] = await q("select available from mc.gtm_capacity where stage = $1", [stage]);
      if (cap && cap.available < 1) {
        warnings.push(`${a.company} stopped at ${STAGES[s - 1]}: ${stage} is at capacity.`);
        break;
      }
      if (stage === "pending_outreach") {
        // The load gate: confirmed by the researcher, as the account page does.
        await q(
          "update mc.gtm_accounts set sw_loaded_by = researcher_id, sw_load_note = $2 where id = $1",
          [row.id, "Every hiring manager and above is in the sequence."],
        );
      }
      if (stage === "outreach_active" && contactIds[a.company]) {
        await q("update mc.gtm_contacts set contacted_at = now() - interval '3 days' where id = $1",
          [contactIds[a.company][0]]);
      }
      if (stage === "engaged" && contactIds[a.company]) {
        await q("update mc.gtm_contacts set responded_at = now() - interval '1 day' where id = $1",
          [contactIds[a.company][0]]);
      }
      await q(
        `update mc.gtm_accounts set stage = $2::mc.gtm_stage,
                outcome = coalesce($3::mc.gtm_outcome, outcome), outcome_note = coalesce($4, outcome_note)
          where id = $1`,
        [row.id, stage, stage === "complete" ? a.outcome : null, stage === "complete" ? a.outcomeNote : null],
      );
    }
  }

  for (const d of DRAFTS) {
    const acct = accountId[d.company];
    const contact = contactIds[d.company]?.[0];
    if (!acct || !contact) continue;
    const [draft] = await q(
      `insert into mc.outreach_drafts (account_id, contact_id, status, signal, created_by)
       values ($1, $2, 'draft', $3, $4) returning id`,
      [acct, contact, GTM.find((g) => g.company === d.company).why, owner],
    );
    const variations = await q(
      `insert into mc.outreach_variations (draft_id, slot, subject, body, created_by)
       select $1, r.slot, r.subject, r.body, $2
         from jsonb_to_recordset($3::jsonb) as r(slot int, subject text, body text)
       returning id, subject, body`,
      [draft.id, owner, JSON.stringify([
        { slot: 1, subject: "Your new program team", body: "Saw the announcement. Teams that staff up this fast usually lose a quarter to hiring. Worth a short call?" },
        { slot: 2, subject: "Six senior roles in a week", body: "You posted six senior roles in a week. We filled four similar ones this year in under 40 days." },
        { slot: 3, subject: "A shortlist before you need it", body: "If the plan holds, you will need cleared engineers before Q1. We can have a shortlist ready first." },
      ])],
    );
    const pick = variations[1];
    await q(
      `update mc.outreach_drafts
          set final_subject = $2, final_body = $3, final_from_variation = $4,
              research_url = $5
        where id = $1`,
      [draft.id, d.final ? pick.subject : null, d.final ? pick.body : null, d.final ? pick.id : null,
       `https://example.com/research/${draft.id}`],
    );
    await q("update mc.outreach_drafts set status = $2::mc.draft_status where id = $1", [draft.id, d.status]);
  }

  // Requisitions. Scores, grades and close probability come from the trigger.
  for (const r of REQUISITIONS) {
    const closing = ["filled", "on_hold"].includes(r.status);
    const [row] = await q(
      `insert into mc.requisitions
         (company, role_title, openings, comp_min, comp_target, comp_max, fee_percent, agreement_signed,
          date_received, search_type, competition, approval, target_start, interviews_from, consequence,
          intake_with, hm_access, process_defined, work_arrangement, relocation, clearance, industry_need,
          must_haves, adjacent_ok, search_difficulty, viable_candidates, best_stage, client_likes,
          feedback_days, last_progress_at, status, owner_id, function_id, location, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, current_date - 18, $9::mc.search_type,
               $10::mc.competition_level, $11::mc.approval_state, current_date + $12::int,
               current_date + $13::int, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
               $24::mc.search_difficulty, $25, $26::mc.best_stage, $27, $28, now() - interval '2 days',
               $29::mc.req_status, $30, $31, $32, $33)
       returning id`,
      [r.company, r.role, r.openings, r.comp[0], r.comp[1], r.comp[2], r.fee, !r.unsigned, r.type,
       r.competition, r.approval, r.start, r.interviews, r.consequence, r.intake, r.hm, r.process, r.work,
       r.relocation, r.clearance, r.industry, r.musts, r.adjacent, r.difficulty, r.viable, r.best, r.likes,
       r.feedback, closing ? "active" : r.status, who(r.who), await fnId("delivery"), r.location, owner],
    );
    if (r.status === "filled") {
      await q(
        "update mc.requisitions set status = 'filled', outcome_kind = 'alac_placement', outcome_detail = $2 where id = $1",
        [row.id, "Offer accepted, starts in three weeks."],
      );
    }
    if (r.status === "on_hold") {
      await q(
        "update mc.requisitions set status = 'on_hold', pause_reason = $2, expected_reopen = current_date + 45 where id = $1",
        [row.id, r.pause],
      );
    }
  }

  // Ideas and votes.
  for (const i of IDEAS) {
    const [row] = await q(
      `insert into mc.ideas (title, problem, proposal, impact, submitted_by, is_priority)
       values ($1, $2, $3, $4::mc.idea_impact, $5, $6) returning id`,
      [i.title, i.problem, i.proposal, i.impact, who(i.who), i.priority ?? false],
    );
    await q(
      `insert into mc.idea_votes (idea_id, person_id)
       select $1, unnest($2::uuid[]) on conflict do nothing`,
      [row.id, [...new Set(i.votes.map(who))]],
    );
    if (i.status !== "new") {
      await q("update mc.ideas set status = $2::mc.idea_status, owner_id = $3 where id = $1",
        [row.id, i.status, owner]);
    }
  }

  // Recurring templates, each with the rule that schedules it.
  for (const r of RECURRING) {
    const [row] = await q(
      `insert into mc.recurring_tasks (title, project_id, assignee_id, frequency, checklist)
       values ($1, $2, $3, $4::mc.recurrence, $5) returning id`,
      [r.title, projectIds[r.project], who(r.who), r.frequency, r.checklist],
    );
    await q(
      `insert into mc.recurrence_rules (recurring_id, kind, day_of_week, day_of_month)
       values ($1, $2::mc.recurrence_kind, $3, $4)`,
      [row.id, r.rule.kind, r.rule.day_of_week ?? null, r.rule.day_of_month ?? null],
    );
  }

  await q(
    `insert into mc.sops (title, url, summary, function_id, is_essential, sort_order)
     select r.title, r.url, r.summary, f.key, r.essential, r.sort_order
       from jsonb_to_recordset($1::jsonb) as r(title text, url text, summary text, fn text,
              essential boolean, sort_order int)
       left join mc.functions f on f.key = r.fn`,
    [JSON.stringify(SOPS.map((s) => ({
      title: s.title, url: `https://example.com/sop/${s.slug}`, summary: s.summary, fn: s.fn,
      essential: s.essential, sort_order: s.order,
    })))],
  );

  return warnings;
}

/**
 * Delete the ledgered rows.
 *
 * First, rows made later from demo rows join the ledger: tasks a recurring
 * template generated, review tasks opened for a demo record (source_id), and
 * tasks someone added to a demo project. Then each table is emptied of its
 * ledgered rows, children before parents. Deleting fires triggers too (a
 * contact's removal refreshes its account, which logs activity), and the
 * reminder run keeps noticing demo work until it is gone, so the last step
 * removes activity, notifications and reminder log rows whose entity_id is a
 * ledgered id, and Slack outbox rows that point at one (task_id, or the id in
 * the link for other kinds). Those tables hold no foreign key to the entity,
 * which is why they are matched by id rather than cascading.
 */
async function removeDemo() {
  const [{ n }] = await q("select count(*)::int as n from mc.demo_rows");
  if (!n) return null;

  await q(
    `insert into mc.demo_rows (table_name, row_id)
     select 'mc.tasks', t.id from mc.tasks t
      where t.project_id in (select row_id from mc.demo_rows)
         or t.recurring_id in (select row_id from mc.demo_rows)
         or t.source_id in (select row_id from mc.demo_rows)
     on conflict do nothing`,
  );

  const tables = (await q("select distinct table_name from mc.demo_rows")).map((r) => r.table_name);
  const fks = await q(
    `select 'mc.' || c.relname as child, 'mc.' || p.relname as parent
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class p on p.oid = k.confrelid
       join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = 'mc' and k.conrelid <> k.confrelid
        and k.confdeltype <> 'n'`,
  );

  // Children first: take a table no remaining table references. Set null
  // links are left out of the graph, which breaks the cycles (an account's
  // current contact, a draft's chosen variation) without changing what is
  // deleted. Should a cycle remain, take any table: cascades still clean up.
  const order = [];
  const left = new Set(tables);
  while (left.size) {
    const next = [...left].find((t) => !fks.some((f) => f.parent === t && f.child !== t && left.has(f.child)))
      ?? [...left][0];
    order.push(next);
    left.delete(next);
  }

  const counts = {};
  for (const t of order) {
    const table = ident(t.replace(/^mc\./, ""));
    const rows = await q(
      `delete from ${table} x
        where x.id in (select row_id from mc.demo_rows where table_name = $1) returning 1`,
      [t],
    );
    counts[t] = rows.length;
  }

  for (const t of ["activity", "notifications", "reminder_log"]) {
    const rows = await q(
      `delete from mc.${t} where entity_id in (select row_id from mc.demo_rows) returning 1`,
    );
    if (rows.length) counts[`mc.${t} (by entity id)`] = rows.length;
  }

  const outbox = await q(
    `delete from mc.slack_outbox o
      where o.task_id in (select row_id from mc.demo_rows)
         or exists (select 1 from mc.demo_rows d where o.url like '%' || d.row_id::text || '%')
     returning 1`,
  );
  if (outbox.length) counts["mc.slack_outbox (by entity id)"] = outbox.length;

  await q("delete from mc.demo_rows");
  return counts;
}

function printCounts(counts) {
  for (const [t, c] of Object.entries(counts).sort()) console.log(`  ${t.padEnd(34)} ${c}`);
}

// --- Run --------------------------------------------------------------------------

let exitCode = 0;
try {
  await q("begin isolation level repeatable read");
  // Serializes runs of this script before anything reads, so two operators
  // cannot both see an empty ledger.
  await q("lock table mc.demo_rows in exclusive mode");

  const [owner] = await q(
    "select id, name from mc.people where role = 'owner' and state = 'active' order by created_at limit 1",
  );
  if (!owner) throw new Error("There is no active owner to attribute the demo to.");
  await q("select set_config('app.user_id', $1, true)", [owner.id]);

  if (REMOVE) {
    const counts = await removeDemo();
    if (!counts) {
      console.log("The ledger is empty. There is no demo data to remove.");
      await q("rollback");
    } else {
      await q("commit");
      console.log("Removed demo rows:");
      printCounts(counts);
      console.log("Team members were left in place.");
    }
  } else {
    if (!TEAM_ONLY) {
      const [{ n }] = await q("select count(*)::int as n from mc.demo_rows");
      if (n) {
        throw new Error(
          `Demo data is already loaded (${n} rows in mc.demo_rows). Run --remove first, then --apply again.`,
        );
      }
    }

    const team = await loadTeam();
    console.log(`Team: ${team.created.length} created, ${team.updated.length} updated.`);
    for (const p of team.created) console.log(`  + ${p}`);
    for (const p of team.updated) console.log(`  = ${p}`);
    if (team.noPassword) {
      console.log(`  ${team.noPassword} listed people have no password and cannot sign in until an admin creates their login.`);
    }

    if (!TEAM_ONLY) {
      const tables = await ledgerTables();
      await q("create temp table demo_before (table_name text, row_id uuid, primary key (table_name, row_id)) on commit drop");
      for (const t of tables) {
        await q(`insert into demo_before select $1, id from ${ident(t)}`, [`mc.${t}`]);
      }

      const warnings = await seedDemo(owner.id);

      // Demo work never reaches Slack.
      await q(
        `delete from mc.slack_outbox x
          where not exists (select 1 from demo_before b where b.table_name = 'mc.slack_outbox' and b.row_id = x.id)`,
      );
      for (const t of tables) {
        await q(
          `insert into mc.demo_rows (table_name, row_id)
           select $1, x.id from ${ident(t)} x
            where not exists (select 1 from demo_before b where b.table_name = $1 and b.row_id = x.id)`,
          [`mc.${t}`],
        );
      }

      const counts = Object.fromEntries(
        (await q("select table_name, count(*)::int as n from mc.demo_rows group by 1")).map((r) => [r.table_name, r.n]),
      );
      console.log(`Demo rows (attributed to ${owner.name}):`);
      printCounts(counts);
      for (const w of warnings) console.log(`  note: ${w}`);
    }

    if (APPLY) {
      await q("commit");
      console.log("Committed.");
    } else {
      await q("rollback");
      console.log("Plan only, rolled back. Run with --apply to write.");
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`\n${error.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
