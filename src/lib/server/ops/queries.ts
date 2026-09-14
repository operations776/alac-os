/**
 * Reads. RLS is gone, so the few rows that are not everybody's (your own
 * notifications, admin-only Slack settings and invitations) are filtered here
 * against the signed-in person. Every other read is open to any signed-in
 * person, and the (app) layout is the gate that guarantees one.
 */
import "server-only";
import { opsQuery } from "@/lib/server/db";
import { currentPerson } from "@/lib/server/ops/context";
import { atLeast } from "@/lib/ops/constants";
import type {
  Invitation,
  ActivityEntry, Calendar, CalendarEvent, Client, ContentPillar, ContentRow,
  ContentAsset, ContentLink, ContentMetric, ContentPlatformRow,
  DriveFile, GtmAccountRow, GtmContact, Integration, Notification,
  ActionItem, ArchiveItem, GtmEvidence, RequisitionRow,
  NotificationPreference, OrgFunction, OutreachDraft, Person, ProjectRow,
  PublicationRow,
  RallyLine, RecurringTask, SlackSettings, Sop, Task, TaskRow, VoiceProfile,
} from "@/types/ops";
import { isOverdue } from "@/lib/ops/utils";

/**
 * Surface a failed read instead of rendering an empty page.
 *
 * The Supabase version destructured `{ data }` and dropped `{ error }`, so a
 * broken query looked exactly like "no rows yet". That is how the content
 * board sat empty in production while the table had rows: PostgREST rejected
 * an ambiguous embed and nothing said so.
 *
 * Reads stay non-fatal, a dashboard panel should not take down the page,
 * but the failure reaches the server log with the query that caused it.
 */
function readFailed(where: string, error: unknown): void {
  if (!error) return;
  const e = error as { message?: string; code?: string; detail?: string };
  console.error(`[query:${where}] ${e.code ?? ""} ${e.message ?? ""} ${e.detail ?? ""}`.trim());
}

/** Run one read; on failure log it and hand back the empty value. */
async function read<T>(where: string, empty: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    readFailed(where, error);
    return empty;
  }
}

/** The `{ id, name, avatar_url }` embed PostgREST gave for a person FK. */
const personJson = (col: string) =>
  `(select json_build_object('id', pp.id, 'name', pp.name, 'avatar_url', pp.avatar_url)
      from mc.people pp where pp.id = ${col})`;

export async function getMe(): Promise<Person | null> {
  return (await currentPerson())?.me ?? null;
}

export async function getPeople(): Promise<Person[]> {
  return read("getPeople", [], () =>
    opsQuery<Person>("select * from mc.people where is_active = true order by name"));
}

export async function getClients(): Promise<Client[]> {
  return read("getClients", [], () =>
    opsQuery<Client>("select * from mc.clients where is_active = true order by name"));
}

// The search is one-to-one (searches is keyed on project_id), so it arrives
// as an object or null, never an array.
const PROJECT_SELECT = `
  select p.*,
    ${personJson("p.owner_id")} as owner,
    (select json_build_object('id', c.id, 'name', c.name) from mc.clients c where c.id = p.client_id) as client,
    (select row_to_json(s) from mc.searches s where s.project_id = p.id) as search
  from mc.projects p`;

export async function getProjects(
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectRow[]> {
  return read("getProjects", [], async () => {
    const projects = await opsQuery<ProjectRow>(
      `${PROJECT_SELECT} ${opts.includeArchived ? "" : "where p.status <> 'archived'"}
       order by p.due_date asc nulls last`);

    // One extra query for overdue counts rather than one per project.
    if (!projects.length) return projects;
    const tasks = await opsQuery<Pick<Task, "project_id" | "due_date">>(
      `select project_id, due_date from mc.tasks
        where archived_at is null and deleted_at is null and status <> 'done'
          and project_id = any($1::uuid[])`,
      [projects.map((p) => p.id)]);

    const overdue = new Map<string, number>();
    for (const t of tasks) {
      if (t.project_id && isOverdue(t.due_date)) {
        overdue.set(t.project_id, (overdue.get(t.project_id) ?? 0) + 1);
      }
    }

    return projects.map((p) => ({ ...p, overdue_count: overdue.get(p.id) ?? 0 }));
  });
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  return read("getProject", null, async () =>
    (await opsQuery<ProjectRow>(`${PROJECT_SELECT} where p.id = $1`, [id]))[0] ?? null);
}

export async function getTasks(
  opts: {
    projectId?: string; assigneeId?: string
    openOnly?: boolean; archived?: boolean
  } = {},
): Promise<TaskRow[]> {
  return read("getTasks", [], () => {
    // Active boards show active work only. Completing a task archives it (§7),
    // and a deleted task is gone from every normal view (§9). `archived` opts
    // in when the caller genuinely wants finished work.
    const params: unknown[] = [];
    let where = "t.deleted_at is null";
    if (!opts.archived) where += " and t.archived_at is null";
    if (opts.projectId) where += ` and t.project_id = $${params.push(opts.projectId)}`;
    if (opts.assigneeId) where += ` and t.assignee_id = $${params.push(opts.assigneeId)}`;
    if (opts.openOnly) where += " and t.status <> 'done'";

    // Checklist and comment counts ride along, rather than a query per card.
    return opsQuery<TaskRow>(
      `select t.*,
         (select json_build_object('id', pr.id, 'name', pr.name, 'department', pr.department)
            from mc.projects pr where pr.id = t.project_id) as project,
         ${personJson("t.assignee_id")} as assignee,
         ${personJson("t.created_by")} as creator,
         (select json_build_object('id', f.id, 'key', f.key, 'name', f.name, 'color', f.color)
            from mc.functions f where f.id = t.function_id) as fn,
         (select json_build_object('id', s.id, 'title', s.title, 'url', s.url)
            from mc.sops s where s.id = t.sop_id) as sop,
         (select count(*)::int from mc.checklist_items c where c.task_id = t.id) as checklist_total,
         (select count(*)::int from mc.checklist_items c where c.task_id = t.id and c.is_done) as checklist_done,
         (select count(*)::int from mc.comments c where c.task_id = t.id) as comment_count
       from mc.tasks t
       where ${where}
       order by t.due_date asc nulls last, t.position`,
      params);
  });
}

/**
 * Recurring templates with their schedules.
 *
 * The rules come along because a row is unreadable without them, "Monthly"
 * alone does not tell anybody when the work lands. Assignee and project are
 * joined for the same reason.
 */
export async function getRecurring(): Promise<RecurringTask[]> {
  return read("getRecurring", [], () =>
    opsQuery<RecurringTask>(
      `select rt.*,
         coalesce((select json_agg(json_build_object('id', r.id, 'kind', r.kind,
                     'day_of_week', r.day_of_week, 'day_of_month', r.day_of_month,
                     'week_of_month', r.week_of_month))
                   from mc.recurrence_rules r where r.recurring_id = rt.id), '[]'::json) as rules,
         ${personJson("rt.assignee_id")} as assignee,
         (select json_build_object('id', pr.id, 'name', pr.name)
            from mc.projects pr where pr.id = rt.project_id) as project
       from mc.recurring_tasks rt
       order by rt.next_due`));
}

/**
 * Today's line, the same one for everybody.
 *
 * The date is resolved in the database so the whole team sees one line for
 * the whole day, rather than each browser picking from its own clock.
 */
export async function getRallyLine(): Promise<RallyLine | null> {
  // A missing line is not worth failing a page load over: the panel just
  // does not render.
  return read("getRallyLine", null, async () =>
    (await opsQuery<RallyLine>("select * from mc.rally_line_for(on_day => $1::date)",
      [new Date().toISOString().slice(0, 10)]))[0] ?? null);
}

/** The SOP library, ordered so the read-me-first material comes first. */
export async function getSops(): Promise<Sop[]> {
  return read("getSops", [], () =>
    opsQuery<Sop>(
      "select * from mc.sops where is_active = true order by is_essential desc, sort_order"));
}

// --- Content -----------------------------------------------------------------

/**
 * The active content board: work that still needs attention.
 *
 * Published pieces leave the board, they are output, not work, and live on
 * in Content Analytics. Recently published items linger briefly so the drag
 * that published them does not make the card vanish mid-animation.
 */
export async function getContent(): Promise<ContentRow[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return read("getContent", [], () =>
    opsQuery<ContentRow>(
      // Two FKs point at people (owner_id, created_by); the owner is owner_id.
      `select c.*, ${personJson("c.owner_id")} as owner
         from mc.content c
        where c.deleted_at is null
          and (c.status <> 'published' or c.published_at >= $1)
        order by c.publish_date asc nulls last, c.position`,
      [cutoff]));
}

/**
 * Every publication, for analytics. One row per (content, platform), so a
 * piece that shipped to four channels counts as four publications.
 */
export async function getPublications(from?: string, to?: string) {
  return read("getPublications", [] as PublicationRow[], () => {
    const params: unknown[] = [];
    let where = "cp.published_at is not null";
    if (from) where += ` and cp.published_at >= $${params.push(from)}`;
    if (to) where += ` and cp.published_at <= $${params.push(to)}`;

    // Performance comes from a view rather than the publication row: the
    // numbers are entered separately and update long after publishing.
    return opsQuery<PublicationRow>(
      `select cp.platform, cp.published_at, cp.published_url,
         json_build_object('id', c.id, 'title', c.title, 'kind', c.kind, 'pillar', c.pillar,
           'created_at', c.created_at, 'owner', ${personJson("c.owner_id")}) as content,
         (select row_to_json(m) from mc.content_performance m
           where m.content_id = cp.content_id and m.platform = cp.platform limit 1) as metrics
       from mc.content_platforms cp
       join mc.content c on c.id = cp.content_id
       where ${where}
       order by cp.published_at desc`,
      params);
  });
}

export async function getContentItem(id: string): Promise<ContentRow | null> {
  return read("getContentItem", null, async () =>
    (await opsQuery<ContentRow>(
      `select c.*, ${personJson("c.owner_id")} as owner from mc.content c where c.id = $1`,
      [id]))[0] ?? null);
}

export async function getVoice(): Promise<VoiceProfile | null> {
  return read("getVoice", null, async () =>
    (await opsQuery<VoiceProfile>("select * from mc.voice_profile where id = 1"))[0] ?? null);
}

// --- Slack -----------------------------------------------------------------------
// Admin only; returns null for everyone else, which the UI treats as
// "you cannot configure this".

export async function getSlackSettings(): Promise<SlackSettings | null> {
  const me = await getMe();
  if (!atLeast(me?.role, "admin")) return null;
  return read("getSlackSettings", null, async () =>
    (await opsQuery<SlackSettings>("select * from mc.slack_settings where id = 1"))[0] ?? null);
}

// --- Calendar -----------------------------------------------------------------

export async function getCalendars(): Promise<Calendar[]> {
  return read("getCalendars", [], () =>
    opsQuery<Calendar>("select * from mc.calendars where is_active = true order by label"));
}

/** Events in a window, so a month view never pulls the whole history. */
export async function getEvents(from: string, to: string): Promise<CalendarEvent[]> {
  return read("getEvents", [], () =>
    opsQuery<CalendarEvent>(
      `select * from mc.calendar_events
        where starts_at >= $1 and starts_at <= $2 and is_cancelled = false
        order by starts_at`,
      [from, to]));
}

// --- Drive --------------------------------------------------------------------

export async function getDriveFiles(projectId?: string): Promise<DriveFile[]> {
  return read("getDriveFiles", [], () =>
    projectId
      ? opsQuery<DriveFile>(
          "select * from mc.drive_files where project_id = $1 order by modified_at desc nulls last",
          [projectId])
      : opsQuery<DriveFile>("select * from mc.drive_files order by modified_at desc nulls last"));
}

// --- Integrations ---------------------------------------------------------------

export async function getIntegrations(): Promise<Integration[]> {
  return read("getIntegrations", [], () =>
    opsQuery<Integration>("select * from mc.integrations order by label"));
}

// --- Functions -------------------------------------------------------------------

export async function getFunctions(): Promise<OrgFunction[]> {
  return read("getFunctions", [], () =>
    opsQuery<OrgFunction>("select * from mc.functions where is_active = true order by sort_order"));
}

// --- Activity ----------------------------------------------------------------------

export async function getActivity(
  entityType: string, entityId: string,
): Promise<ActivityEntry[]> {
  return read("getActivity", [], () =>
    opsQuery<ActivityEntry>(
      `select a.*, ${personJson("a.actor_id")} as actor from mc.activity a
        where a.entity_type = $1 and a.entity_id = $2
        order by a.created_at desc`,
      [entityType, entityId]));
}

/** The company-wide feed. */
export async function getRecentActivity(limit = 50): Promise<ActivityEntry[]> {
  return read("getRecentActivity", [], () =>
    opsQuery<ActivityEntry>(
      `select a.*, ${personJson("a.actor_id")} as actor from mc.activity a
        order by a.created_at desc limit $1`,
      [limit]));
}

// --- Notifications --------------------------------------------------------------------
// Your own rows only, the rule RLS used to enforce.

export async function getNotifications(limit = 40): Promise<Notification[]> {
  const me = await getMe();
  if (!me) return [];
  return read("getNotifications", [], () =>
    opsQuery<Notification>(
      "select * from mc.notifications where person_id = $1 order by created_at desc limit $2",
      [me.id, limit]));
}

/** The bell's badge. Counted in full, the list it sits on is capped. */
export async function getUnreadNotificationCount(): Promise<number> {
  const me = await getMe();
  if (!me) return 0;
  return read("getUnreadNotificationCount", 0, async () => {
    const [row] = await opsQuery<{ n: number }>(
      "select count(*)::int as n from mc.notifications where person_id = $1 and read_at is null",
      [me.id]);
    return row?.n ?? 0;
  });
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const me = await getMe();
  if (!me) return [];
  return read("getNotificationPreferences", [], () =>
    opsQuery<NotificationPreference>(
      "select * from mc.notification_preferences where person_id = $1", [me.id]));
}

// --- GTM ------------------------------------------------------------------------------

const GTM_PEOPLE = `
  ${personJson("a.owner_id")} as owner,
  ${personJson("a.researcher_id")} as researcher`;

/**
 * The active GTM board: accounts we are currently working.
 *
 * Completed campaigns leave the board, they are history, not work, and live
 * on in GTM Analytics. Recently completed accounts linger briefly so the drag
 * that closed them does not make the card vanish mid-animation.
 */
export async function getGtmAccounts(history = false): Promise<GtmAccountRow[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return read("getGtmAccounts", [], () =>
    opsQuery<GtmAccountRow>(
      // "Attempts" is contacts actually approached, not contacts identified,
      // the number leadership reads off the card.
      `select a.*, ${GTM_PEOPLE},
         (select json_build_object('id', gc.id, 'name', gc.name, 'title', gc.title)
            from mc.gtm_contacts gc where gc.id = a.current_contact_id) as current_contact,
         (select count(*)::int from mc.gtm_contacts gc where gc.account_id = a.id) as contact_count,
         (select count(*)::int from mc.outreach_drafts od where od.account_id = a.id) as draft_count,
         (select count(*)::int from mc.gtm_contacts gc
           where gc.account_id = a.id and gc.contacted_on is not null) as attempt_count
       from mc.gtm_accounts a
       ${history ? "" : "where (a.stage <> 'complete' or a.completed_at >= $1)"}
       order by a.priority, a.assigned_on desc`,
      history ? [] : [cutoff]));
}

export async function getGtmAccount(id: string): Promise<GtmAccountRow | null> {
  return read("getGtmAccount", null, async () =>
    (await opsQuery<GtmAccountRow>(
      `select a.*, ${GTM_PEOPLE} from mc.gtm_accounts a where a.id = $1`, [id]))[0] ?? null);
}

export async function getGtmContacts(accountId: string): Promise<GtmContact[]> {
  return read("getGtmContacts", [], () =>
    opsQuery<GtmContact>(
      "select * from mc.gtm_contacts where account_id = $1 order by seniority, name",
      [accountId]));
}

export async function getOutreachDrafts(accountId: string): Promise<OutreachDraft[]> {
  // The three drafted options come with the draft: they are always rendered
  // together, and fetching them per row would be one request per prospect.
  // Join on draft_id (the options), not final_from_variation (which option
  // became the final): the Supabase version once picked neither, and saved
  // emails came back blank while the writes were landing.
  return read("getOutreachDrafts", [], () =>
    opsQuery<OutreachDraft>(
      `select d.*,
         coalesce((select json_agg(json_build_object('id', v.id, 'slot', v.slot,
                     'subject', v.subject, 'body', v.body) order by v.slot)
                   from mc.outreach_variations v where v.draft_id = d.id), '[]'::json) as variations
       from mc.outreach_drafts d
       where d.account_id = $1
       order by d.created_at desc`,
      [accountId]));
}

// --- Content extras ----------------------------------------------------------------------

export async function getPillars(): Promise<ContentPillar[]> {
  return read("getPillars", [], () =>
    opsQuery<ContentPillar>(
      "select * from mc.content_pillars where is_active = true order by sort_order"));
}

// --- Invitations -----------------------------------------------------------------
// Admin only, like Slack settings.

export async function getInvitations(): Promise<Invitation[]> {
  const me = await getMe();
  if (!atLeast(me?.role, "admin")) return [];
  return read("getInvitations", [], () =>
    opsQuery<Invitation>(
      `select * from mc.invitations
        where accepted_at is null and revoked_at is null
        order by invited_at desc`));
}

export async function getContentDetail(id: string) {
  const [platforms, links, assets, metrics] = await Promise.all([
    read("getContentDetail:platforms", [], () =>
      opsQuery<ContentPlatformRow>("select * from mc.content_platforms where content_id = $1", [id])),
    read("getContentDetail:links", [], () =>
      opsQuery<ContentLink>("select * from mc.content_links where content_id = $1 order by sort_order", [id])),
    read("getContentDetail:assets", [], () =>
      opsQuery<ContentAsset>("select * from mc.content_assets where content_id = $1", [id])),
    read("getContentDetail:metrics", [], () =>
      opsQuery<ContentMetric>("select * from mc.content_metrics_latest where content_id = $1", [id])),
  ]);
  return { platforms, links, assets, metrics };
}

/**
 * Everything finished, for the Archive (§8).
 *
 * Reads the archive_items view so tasks and content arrive as one list with a
 * common shape. Deleted records are excluded by the view itself.
 */
export async function getArchive(opts: {
  kind?: "task" | "content"
  functionId?: string
  ownerId?: string
  from?: string
  to?: string
  q?: string
} = {}) {
  const params: unknown[] = [];
  let where = "true";
  if (opts.kind) where += ` and kind = $${params.push(opts.kind)}`;
  if (opts.functionId) where += ` and function_id = $${params.push(opts.functionId)}`;
  if (opts.ownerId) where += ` and owner_id = $${params.push(opts.ownerId)}`;
  if (opts.from) where += ` and archived_at >= $${params.push(opts.from)}`;
  if (opts.to) where += ` and archived_at <= $${params.push(opts.to)}`;
  if (opts.q) where += ` and title ilike $${params.push(`%${opts.q}%`)}`;

  return read("getArchive", [] as ArchiveItem[], () =>
    opsQuery<ArchiveItem>(
      `select * from mc.archive_items where ${where} order by archived_at desc limit 500`,
      params));
}

/** Requisitions for the Delivery board (§32). Archived and deleted excluded. */
export async function getRequisitions(): Promise<RequisitionRow[]> {
  // Read the view, which carries the sprint target, active count, next
  // action and sourcing state. A view cannot declare a foreign key, so the
  // owner is joined by id here.
  return read("getRequisitions", [], () =>
    opsQuery<RequisitionRow>(
      // Grade first, then oldest within each grade: an old A that nobody has
      // touched should sit above a fresh one, so long-running searches rise
      // instead of sinking under whatever was added today.
      `select r.*, ${personJson("r.owner_id")} as owner
         from mc.requisition_board r
        where r.deleted_at is null and r.archived_at is null
        order by r.live_grade asc nulls last, r.date_received asc`));
}

/**
 * §33 portfolio roll-up.
 *
 * Weighted pipeline is the number that matters: theoretical fee assumes every
 * search closes, which none of them do.
 */
export async function getReqPortfolio() {
  const reqs = await getRequisitions();
  const active = reqs.filter((r) => r.status === "active");

  const feeOf = (r: RequisitionRow) =>
    (Number(r.comp_target ?? 0) * Number(r.fee_percent ?? 0) / 100) * r.openings;

  const theoretical = active.reduce((s, r) => s + feeOf(r), 0);
  const weighted = active.reduce(
    (s, r) => s + feeOf(r) * (Number(r.live_close_pct ?? 0) / 100), 0);
  const highConfidence = active
    .filter((r) => Number(r.live_close_pct ?? 0) >= 60)
    .reduce((s, r) => s + feeOf(r), 0);

  // §34 concentration: how much of the weighted pipeline sits with one client.
  const byCompany = new Map<string, number>();
  for (const r of active) {
    const w = feeOf(r) * (Number(r.live_close_pct ?? 0) / 100);
    byCompany.set(r.company, (byCompany.get(r.company) ?? 0) + w);
  }
  const largest = Math.max(0, ...byCompany.values());
  const concentration = weighted > 0 ? (largest / weighted) * 100 : 0;

  return {
    activeCount: active.length,
    theoretical, weighted, highConfidence, concentration,
    needsAttention: active.filter(
      (r) => r.delivery_need === "critical" || r.delivery_need === "high").length,
    calibrating: reqs.filter(
      (r) => ["calibrating", "on_hold", "paused"].includes(r.status)).length,
  };
}

/** Accounts waiting on a founder decision (§57), with their research attached. */
export async function getPendingReview() {
  return read(
    "getPendingReview",
    [] as (GtmAccountRow & { contacts: GtmContact[]; evidence: GtmEvidence[] })[],
    () =>
      opsQuery<GtmAccountRow & { contacts: GtmContact[]; evidence: GtmEvidence[] }>(
        `select a.*, ${GTM_PEOPLE},
           coalesce((select json_agg(gc order by gc.persona_order)
                     from mc.gtm_contacts gc where gc.account_id = a.id), '[]'::json) as contacts,
           coalesce((select json_agg(ev)
                     from mc.gtm_evidence ev where ev.account_id = a.id), '[]'::json) as evidence
         from mc.gtm_accounts a
         where a.stage = 'pending_review'
         order by a.priority`));
}

/**
 * The action queue (§8, §13, §22).
 *
 * Every active account's next action, ordered so it can be worked top to
 * bottom. `mine` filters to one person's queue.
 */
export async function getActionQueue(mine?: string): Promise<ActionItem[]> {
  return read("getActionQueue", [], () =>
    mine
      ? opsQuery<ActionItem>(
          "select * from mc.action_queue where owner_id = $1 order by sort_key, due_on", [mine])
      : opsQuery<ActionItem>("select * from mc.action_queue order by sort_key, due_on"));
}

/** §33 the board summary: the whole BD workload in one line. */
export async function getActionSummary() {
  const all = await getActionQueue();
  const by = (u: string) => all.filter((a) => a.urgency === u).length;
  const type = (t: string) => all.filter((a) => a.action_type === t).length;
  return {
    total: all.length,
    overdue: by("overdue"),
    today: by("today"),
    upcoming: by("upcoming"),
    drafts: type("write_first_touch") + type("follow_up"),
    approvals: type("approve_copy") + type("account_review"),
    responses: type("review_response"),
    launches: type("launch_outreach"),
  };
}

// --- Task drawer ---------------------------------------------------------------------

/**
 * Drawer payload for one task: checklist, comments, recent activity and the
 * collaborators, flattened to people. Loaded on demand so a board of 100 cards
 * does not ship 100 comment threads.
 */
export async function getTaskDrawer(id: string) {
  const [checklist, comments, activity, collaborators] = await Promise.all([
    read("getTaskDrawer:checklist", [], () =>
      opsQuery("select * from mc.checklist_items where task_id = $1 order by position", [id])),
    read("getTaskDrawer:comments", [], () =>
      opsQuery(
        `select c.*, ${personJson("c.author_id")} as author from mc.comments c
          where c.task_id = $1 order by c.created_at`,
        [id])),
    read("getTaskDrawer:activity", [], () =>
      opsQuery(
        `select a.*, ${personJson("a.actor_id")} as actor from mc.activity a
          where a.entity_type = 'task' and a.entity_id = $1
          order by a.created_at desc limit 50`,
        [id])),
    read("getTaskDrawer:collaborators", [], () =>
      opsQuery(
        `select p.id, p.name, p.avatar_url from mc.task_collaborators tc
           join mc.people p on p.id = tc.person_id
          where tc.task_id = $1`,
        [id])),
  ]);
  return { checklist, comments, activity, collaborators };
}

// --- Ideas ---------------------------------------------------------------------------

/** One row of the ideas_board view: the idea, its vote count and the names. */
export interface IdeaBoardRow {
  id: string
  title: string
  problem: string | null
  proposal: string | null
  category: string | null
  impact: string
  status: string
  is_priority: boolean
  owner_id: string | null
  submitted_by: string | null
  outcome_note: string | null
  implemented_at: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  deleted_at: string | null
  votes: number
  submitted_by_name: string | null
  owner_name: string | null
}

/** Open ideas, newest first. Deleted ones are excluded by the view. */
export async function getIdeasBoard(): Promise<IdeaBoardRow[]> {
  return read("getIdeasBoard", [], () =>
    opsQuery<IdeaBoardRow>(
      "select * from mc.ideas_board where archived_at is null order by created_at desc"));
}

/** The idea ids this person has voted for. */
export async function getMyIdeaVotes(personId: string): Promise<string[]> {
  return read("getMyIdeaVotes", [], async () =>
    (await opsQuery<{ idea_id: string }>(
      "select idea_id from mc.idea_votes where person_id = $1", [personId])).map((v) => v.idea_id));
}
