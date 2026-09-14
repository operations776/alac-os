"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { asPerson, opsQuery } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/auth";
import { requirePerson } from "@/lib/server/ops/context";
import { type Result, wrote, fail, refresh, flushSlack, setClause } from "@/lib/server/ops/result";
import { atLeast } from "@/lib/ops/constants";
import type {
  Department, Health, NotifyKind, Priority, ProjectStatus, TaskStatus, UserRole,
} from "@/types/ops";

// Writes for the work side of operations: tasks, projects, recurring work, the
// team, notifications, lifecycle. Every write runs through asPerson so the
// triggers attribute it to the caller; requirePerson is the floor RLS used to be.

// --- Tasks -------------------------------------------------------------------

export interface TaskInput {
  title: string;
  notes?: string | null;
  project_id?: string | null;
  /** Required: a task must land on a functional board even with no project. */
  function_id?: string;
  status?: TaskStatus;
  priority?: Priority;
  assignee_id?: string | null;
  due_date?: string | null;
  blocked_reason?: string | null;
  estimate_hours?: number | null;
  department?: Department;
  /** People who should hear about this without owning it. */
  collaborator_ids?: string[];
}

const TASK_COLUMNS = [
  "title", "notes", "project_id", "function_id", "status", "priority",
  "assignee_id", "due_date", "blocked_reason", "estimate_hours", "department",
] as const;

export async function createTask(input: TaskInput): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");

    const id = await asPerson(me.id, async (q) => {
      const [row] = await q<{ id: string }>(
        `insert into mc.tasks
           (title, notes, project_id, status, priority, assignee_id, due_date,
            function_id, department, estimate_hours, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          input.title.trim(),
          input.notes ?? null,
          input.project_id ?? null,
          input.status ?? "todo",
          input.priority ?? "normal",
          input.assignee_id ?? null,
          input.due_date ?? null,
          input.function_id ?? null,
          input.department ?? "operations",
          input.estimate_hours ?? null,
          me.id,
        ],
      );

      if (input.collaborator_ids?.length) {
        await q(
          `insert into mc.task_collaborators (task_id, person_id)
           select $1::uuid, unnest($2::uuid[])`,
          [row.id, input.collaborator_ids],
        );
      }
      return row.id;
    });

    refresh(input.project_id);
    await flushSlack();
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function updateTask(
  id: string, patch: Partial<TaskInput>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, TASK_COLUMNS);
    if (set.empty) return { ok: true };

    // Ask for the row back. An UPDATE that matches nothing is not a Postgres
    // error, so without this a write against a deleted row returned ok and the
    // UI flashed "Saved" having changed nothing. The self join hands back the
    // project the task was in before the write, for the page to refresh.
    const written = await asPerson(me.id, (q) =>
      q<{ id: string; before_project_id: string | null }>(
        `update mc.tasks t set ${set.sql}
           from mc.tasks b
          where b.id = t.id and t.id = $${set.values.length + 1}
          returning t.id, b.project_id as before_project_id`,
        [...set.values, id],
      ),
    );
    { const w = wrote(written, "task"); if (!w.ok) return w; }

    refresh(patch.project_id ?? written[0].before_project_id);
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Move several tasks to one status in a single action.
 *
 * Next dispatches Server Actions one at a time per client, so the board
 * cannot fire one call per card and expect them to run together: the later
 * ones queue behind the first and its revalidation. One action, one
 * statement, so a group drag either lands whole or reports why it did not.
 */
export async function moveTasks(
  ids: string[], status: TaskStatus,
): Promise<Result> {
  try {
    if (!ids.length) return { ok: true };
    const { me } = await requirePerson("member");

    const moved = await asPerson(me.id, (q) =>
      q<{ id: string; project_id: string | null }>(
        `update mc.tasks set status = $2::mc.task_status
          where id = any($1::uuid[])
          returning id, project_id`,
        [ids, status],
      ),
    );

    // Each affected project's page is stale now, not just one.
    const projects = new Set(moved.map((t) => t.project_id).filter(Boolean));
    refresh();
    for (const pid of projects) revalidatePath(`/projects/${pid}`);
    await flushSlack();

    if (moved.length < ids.length) {
      return {
        ok: false,
        error: `Moved ${moved.length} of ${ids.length} tasks. The other ${ids.length - moved.length} may have been deleted.`,
      };
    }
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Checklists --------------------------------------------------------------

export async function addChecklistItem(taskId: string, content: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    // Position is the current count, read in the same statement as the insert.
    await asPerson(me.id, (q) =>
      q(
        `insert into mc.checklist_items (task_id, content, position)
         select $1::uuid, $2::text, count(*)::int
           from mc.checklist_items where task_id = $1::uuid`,
        [taskId, content.trim()],
      ),
    );
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function toggleChecklistItem(id: string, done: boolean): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const rows = await asPerson(me.id, (q) =>
      q("update mc.checklist_items set is_done = $2 where id = $1 returning id", [id, done]),
    );
    { const w = wrote(rows, "checklist item"); if (!w.ok) return w; }
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteChecklistItem(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    await asPerson(me.id, (q) => q("delete from mc.checklist_items where id = $1", [id]));
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Comments ----------------------------------------------------------------

export async function addComment(taskId: string, body: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    await asPerson(me.id, (q) =>
      q("insert into mc.comments (task_id, author_id, body) values ($1, $2, $3)",
        [taskId, me.id, body.trim()]),
    );
    refresh();
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Projects ----------------------------------------------------------------

export interface ProjectInput {
  name: string;
  description?: string | null;
  department?: Department;
  owner_id: string;
  client_id?: string | null;
  status?: ProjectStatus;
  health?: Health;
  due_date?: string | null;
}

const PROJECT_COLUMNS = [
  "name", "description", "department", "owner_id", "client_id", "status", "health", "due_date",
] as const;

export async function createProject(
  input: ProjectInput & { searchRole?: string | null },
): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");
    const id = await asPerson(me.id, async (q) => {
      const [row] = await q<{ id: string }>(
        `insert into mc.projects
           (name, description, department, owner_id, client_id, status, health, due_date)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          input.name.trim(),
          input.description ?? null,
          input.department ?? "operations",
          input.owner_id,
          input.client_id ?? null,
          input.status ?? "active",
          input.health ?? "on_track",
          input.due_date ?? null,
        ],
      );

      // A recruiting project with a role gets delivery tracking.
      if (input.searchRole) {
        await q("insert into mc.searches (project_id, role_title) values ($1, $2)",
          [row.id, input.searchRole]);
      }
      return row.id;
    });

    revalidatePath("/projects");
    revalidatePath("/ops");
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function updateProject(
  id: string, patch: Partial<ProjectInput>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, PROJECT_COLUMNS);
    if (set.empty) return { ok: true };
    // Verify the write landed: an UPDATE matching no row is not an error,
    // so without this a deleted row reports success.
    const hit = await asPerson(me.id, (q) =>
      q(`update mc.projects set ${set.sql} where id = $${set.values.length + 1} returning id`,
        [...set.values, id]),
    );
    { const w = wrote(hit, "project"); if (!w.ok) return w; }
    refresh(id);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function archiveProject(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const rows = await asPerson(me.id, (q) =>
      q(`update mc.projects set status = 'archived', archived_at = now()
          where id = $1 returning id`, [id]),
    );
    { const w = wrote(rows, "project"); if (!w.ok) return w; }
    revalidatePath("/projects");
    revalidatePath("/ops");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const SEARCH_METRICS = ["target_count", "target_days", "submitted", "interviews", "placements"] as const;

export async function updateSearch(
  projectId: string, metrics: Record<string, number>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const set = setClause(metrics, SEARCH_METRICS);
    if (set.empty) return { ok: true };
    const rows = await asPerson(me.id, (q) =>
      q(`update mc.searches set ${set.sql} where project_id = $${set.values.length + 1} returning project_id`,
        [...set.values, projectId]),
    );
    { const w = wrote(rows, "search"); if (!w.ok) return w; }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Clients -----------------------------------------------------------------

export async function createClientRecord(
  name: string, externalUrl?: string,
): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("viewer");
    const [row] = await asPerson(me.id, (q) =>
      q<{ id: string }>(
        "insert into mc.clients (name, external_url) values ($1, $2) returning id",
        [name.trim(), externalUrl ?? null],
      ),
    );
    revalidatePath("/projects");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

// --- Recurring ---------------------------------------------------------------

/** One line of a schedule: "the 15th", "the second Tuesday", "Monday". */
export interface RecurrenceRuleInput {
  kind: "weekday" | "day_of_month" | "last_day" | "nth_weekday";
  day_of_week?: number | null;
  day_of_month?: number | null;
  week_of_month?: number | null;
}

export interface RecurringInput {
  title: string;
  project_id?: string | null;
  assignee_id?: string | null;
  priority?: Priority;
  frequency: string;
  interval_n?: number;
  starts_on?: string | null;
  ends_on?: string | null;
  ends_after?: number | null;
  sop_id?: string | null;
  notes?: string | null;
  checklist?: string[];
  /** The schedule. A task with no rules generates nothing. */
  rules: RecurrenceRuleInput[];
}

/** The rules as one insert, with the unused columns nulled. */
const INSERT_RULES = `
  insert into mc.recurrence_rules (recurring_id, kind, day_of_week, day_of_month, week_of_month)
  select $1::uuid, r.kind, r.day_of_week, r.day_of_month, r.week_of_month
    from jsonb_to_recordset($2::jsonb)
      as r(kind mc.recurrence_kind, day_of_week int, day_of_month int, week_of_month int)`;

const ruleJson = (rules: RecurrenceRuleInput[]) =>
  JSON.stringify(rules.map((r) => ({
    kind: r.kind,
    day_of_week: r.day_of_week ?? null,
    day_of_month: r.day_of_month ?? null,
    week_of_month: r.week_of_month ?? null,
  })));

// Rules are admin writes (scheduling work for other people is an admin act),
// so every action that writes them carries the admin floor.

export async function createRecurring(input: RecurringInput): Promise<Result> {
  try {
    if (!input.rules?.length) {
      return { ok: false, error: "Pick at least one day for this to repeat on." };
    }
    const { me } = await requirePerson("admin");
    // next_due is left to the database: inserting the rules syncs it, so a rule
    // created on the 3rd for "the 15th" starts on the 15th. One transaction, so
    // a task with no schedule (which looks like the feature is broken) is never
    // left behind.
    await asPerson(me.id, async (q) => {
      const [made] = await q<{ id: string }>(
        `insert into mc.recurring_tasks
           (title, project_id, assignee_id, priority, frequency, interval_n,
            starts_on, ends_on, ends_after, sop_id, notes, checklist)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning id`,
        [
          input.title.trim(),
          input.project_id ?? null,
          input.assignee_id ?? null,
          input.priority ?? "normal",
          input.frequency,
          input.interval_n ?? 1,
          input.starts_on || new Date().toISOString().slice(0, 10),
          input.ends_on || null,
          input.ends_after ?? null,
          input.sop_id ?? null,
          input.notes ?? null,
          input.checklist ?? [],
        ],
      );
      await q(INSERT_RULES, [made.id, ruleJson(input.rules)]);
    });

    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Change a recurring task, schedule included.
 *
 * Rules are replaced wholesale rather than diffed: the form hands over the
 * complete set, and matching them up by hand would be more code and more
 * ways to be wrong. Already-generated tasks are never touched (spec section 12).
 */
export async function updateRecurring(
  id: string, input: RecurringInput,
): Promise<Result> {
  try {
    if (!input.rules?.length) {
      return { ok: false, error: "Pick at least one day for this to repeat on." };
    }
    const { me } = await requirePerson("admin");

    const hit = await asPerson(me.id, async (q) => {
      const rows = await q(
        `update mc.recurring_tasks set
           title = $1, project_id = $2, assignee_id = $3, priority = $4,
           frequency = $5, interval_n = $6,
           starts_on = coalesce($7::date, starts_on),
           ends_on = $8, ends_after = $9, sop_id = $10, notes = $11, checklist = $12
         where id = $13
         returning id`,
        [
          input.title.trim(),
          input.project_id ?? null,
          input.assignee_id ?? null,
          input.priority ?? "normal",
          input.frequency,
          input.interval_n ?? 1,
          input.starts_on || null,
          input.ends_on || null,
          input.ends_after ?? null,
          input.sop_id ?? null,
          input.notes ?? null,
          input.checklist ?? [],
          id,
        ],
      );
      if (!rows.length) return rows;
      await q("delete from mc.recurrence_rules where recurring_id = $1", [id]);
      await q(INSERT_RULES, [id, ruleJson(input.rules)]);
      return rows;
    });
    { const w = wrote(hit, "recurring task"); if (!w.ok) return w; }

    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Copy a rule and its schedule, so a near-identical one is a click away. */
export async function duplicateRecurring(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("admin");

    const made = await asPerson(me.id, async (q) => {
      // Everything except the row's own identity and its progress (id,
      // timestamps, next_due, occurrences_made): the copy is a fresh template,
      // not a continuation of the original's schedule. Paused, so a duplicate
      // never starts generating work unnoticed.
      const rows = await q<{ id: string }>(
        `insert into mc.recurring_tasks
           (title, notes, project_id, assignee_id, priority, frequency, day_of_week,
            day_of_month, checklist, is_active, week_of_month, sop_id, interval_n,
            starts_on, ends_on, ends_after)
         select title || ' (copy)', notes, project_id, assignee_id, priority, frequency,
                day_of_week, day_of_month, checklist, false, week_of_month, sop_id,
                interval_n, starts_on, ends_on, ends_after
           from mc.recurring_tasks where id = $1
         returning id`,
        [id],
      );
      if (!rows.length) return rows;
      await q(
        `insert into mc.recurrence_rules (recurring_id, kind, day_of_week, day_of_month, week_of_month)
         select $1::uuid, kind, day_of_week, day_of_month, week_of_month
           from mc.recurrence_rules where recurring_id = $2`,
        [rows[0].id, id],
      );
      return rows;
    });
    { const w = wrote(made, "recurring task"); if (!w.ok) return w; }

    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function toggleRecurring(id: string, active: boolean): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const rows = await asPerson(me.id, (q) =>
      q("update mc.recurring_tasks set is_active = $2 where id = $1 returning id", [id, active]),
    );
    { const w = wrote(rows, "recurring task"); if (!w.ok) return w; }
    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteRecurring(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    await asPerson(me.id, (q) => q("delete from mc.recurring_tasks where id = $1", [id]));
    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Profile -----------------------------------------------------------------

export async function updateProfile(
  patch: { name?: string; title?: string | null },
): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const set = setClause(patch, ["name", "title"]);
    if (set.empty) return { ok: true };
    // Only ever the caller's own row: the id comes from the session.
    const rows = await asPerson(me.id, (q) =>
      q(`update mc.people set ${set.sql} where id = $${set.values.length + 1} returning id`,
        [...set.values, me.id]),
    );
    { const w = wrote(rows, "profile"); if (!w.ok) return w; }
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Drive ----------------------------------------------------------------------

/** Link a Drive file to a project, or clear the link. */
export async function attachDriveFile(
  fileId: string, projectId: string | null,
): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const rows = await asPerson(me.id, (q) =>
      q("update mc.drive_files set project_id = $2 where id = $1 returning id", [fileId, projectId]),
    );
    { const w = wrote(rows, "file"); if (!w.ok) return w; }
    revalidatePath("/files");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Remove a file from the index.
 *
 * This deletes ALAC's record of the file, not the file itself: Drive still
 * owns it. Use this for things that no longer belong on the board; a re-sync
 * will bring the file back if it still exists in Drive and matches the folders
 * we index.
 */
export async function removeDriveFile(fileId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const [row] = await asPerson(me.id, (q) =>
      q<{ project_id: string | null }>(
        "delete from mc.drive_files where id = $1 returning project_id", [fileId]),
    );
    revalidatePath("/files");
    if (row?.project_id) revalidatePath(`/projects/${row.project_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Collaborators -----------------------------------------------------------------

export async function setCollaborators(
  taskId: string, personIds: string[],
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, async (q) => {
      await q("delete from mc.task_collaborators where task_id = $1", [taskId]);
      if (personIds.length) {
        await q(
          `insert into mc.task_collaborators (task_id, person_id)
           select $1::uuid, unnest($2::uuid[])`,
          [taskId, personIds],
        );
      }
    });
    refresh(null);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Notifications -------------------------------------------------------------------

export async function markNotificationsRead(ids?: string[]): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const params: unknown[] = [me.id];
    let text = `update mc.notifications set read_at = now()
                 where person_id = $1 and read_at is null`;
    if (ids?.length) {
      params.push(ids);
      text += " and id = any($2::uuid[])";
    }
    await asPerson(me.id, (q) => q(text, params));
    revalidatePath("/ops");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setNotificationPreference(
  kind: NotifyKind, channel: "in_app" | "slack", on: boolean,
): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    // The column name is chosen here, never taken from the request.
    const col = channel === "slack" ? "slack" : "in_app";
    await asPerson(me.id, (q) =>
      q(
        `insert into mc.notification_preferences (person_id, kind, ${col})
         values ($1, $2, $3)
         on conflict (person_id, kind) do update set ${col} = excluded.${col}`,
        [me.id, kind, on],
      ),
    );
    revalidatePath("/settings/notifications");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Team ----------------------------------------------------------------------------

/**
 * Invite a teammate.
 *
 * The invitation is a record of intent, kept exactly as before. There is no
 * signup flow here, so the same transaction also creates the login: a desk
 * user with a generated temporary password and an org membership. The users
 * trigger then provisions the person from the invitation (role, function, job
 * title) and marks it accepted. The temporary password is returned once, for
 * the inviter to hand over; it is never stored in the clear or emailed.
 */
export async function invitePerson(input: {
  email: string;
  name: string;
  role: UserRole;
  function_id?: string | null;
  job_title?: string | null;
}): Promise<Result<{ id: string; tempPassword?: string }>> {
  try {
    const { session, me } = await requirePerson("admin");

    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return { ok: false, error: "That does not look like an email address." };
    }

    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);
    const name = input.name.trim();

    const out = await asPerson<{ id: string } | { error: string }>(me.id, async (q) => {
      // Already on the team? Say so plainly rather than failing on a constraint.
      const [existing] = await q<{ name: string }>(
        `select coalesce(p.name, u.full_name) as name
           from public.users u left join mc.people p on p.id = u.id
          where lower(u.email) = $1 limit 1`,
        [email],
      );
      if (existing) return { error: `${existing.name} is already on the team.` };

      const row = [
        email, name, input.role, input.function_id ?? null, input.job_title ?? null, me.id,
      ];

      // The pending-invite index is partial and case-folded, which ON CONFLICT
      // cannot target. Re-inviting therefore refreshes the open invitation
      // explicitly rather than relying on an upsert.
      const [pending] = await q<{ id: string }>(
        `select id from mc.invitations
          where lower(email) = $1 and accepted_at is null and revoked_at is null
          limit 1`,
        [email],
      );

      const [inv] = pending
        ? await q<{ id: string }>(
            `update mc.invitations
                set email = $1, name = $2, role = $3, function_id = $4, job_title = $5,
                    invited_by = $6, invited_at = now(), expires_at = now() + interval '14 days'
              where id = $7
              returning id`,
            [...row, pending.id],
          )
        : await q<{ id: string }>(
            `insert into mc.invitations
               (email, name, role, function_id, job_title, invited_by, invited_at, expires_at)
             values ($1, $2, $3, $4, $5, $6, now(), now() + interval '14 days')
             returning id`,
            row,
          );

      const [user] = await q<{ id: string }>(
        `insert into public.users (email, full_name, password_hash)
         values ($1, $2, $3) returning id`,
        [email, name, passwordHash],
      );
      await q(
        `insert into public.org_memberships (org_id, user_id, role)
         values ($1, $2, $3::org_role)`,
        [session.orgId, user.id, input.role === "owner" || input.role === "admin" ? "admin" : "member"],
      );
      return { id: inv.id };
    });
    if ("error" in out) return { ok: false, error: out.error };

    revalidatePath("/settings/team");
    return { ok: true, data: { id: out.id, tempPassword } };
  } catch (e) { return fail(e); }
}

export async function revokeInvitation(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("admin");
    const rows = await asPerson(me.id, (q) =>
      q("update mc.invitations set revoked_at = now() where id = $1 returning id", [id]),
    );
    { const w = wrote(rows, "invitation"); if (!w.ok) return w; }
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updatePerson(
  id: string,
  patch: { role?: UserRole; state?: string; function_id?: string | null; job_title?: string | null },
): Promise<Result> {
  try {
    const { me } = await requirePerson("admin");
    const set = setClause(patch, ["role", "state", "function_id", "job_title"]);
    if (set.empty) return { ok: true };
    // Verify the write landed: an UPDATE matching no row is not an error,
    // so without this a deleted row reports success.
    const hit = await asPerson(me.id, (q) =>
      q(`update mc.people set ${set.sql} where id = $${set.values.length + 1} returning id`,
        [...set.values, id]),
    );
    { const w = wrote(hit, "person"); if (!w.ok) return w; }
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Functions --------------------------------------------------------------------------

export async function upsertFunction(input: {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  color?: string;
  slack_channel?: string | null;
  lead_id?: string | null;
}): Promise<Result> {
  try {
    const { me } = await requirePerson("admin");
    const row = [
      input.key.trim().toLowerCase(),
      input.name.trim(),
      input.description ?? null,
      input.color ?? "#64748B",
      input.slack_channel ?? null,
      input.lead_id ?? null,
    ];
    const rows = await asPerson(me.id, (q) =>
      input.id
        ? q(
            `update mc.functions
                set key = $1, name = $2, description = $3, color = $4, slack_channel = $5, lead_id = $6
              where id = $7 returning id`,
            [...row, input.id],
          )
        : q(
            `insert into mc.functions (key, name, description, color, slack_channel, lead_id)
             values ($1, $2, $3, $4, $5, $6) returning id`,
            row,
          ),
    );
    { const w = wrote(rows, "function"); if (!w.ok) return w; }
    revalidatePath("/settings/functions");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Duplicate detection (spec section 5) -------------------------------------------

export interface DuplicateHit {
  id: string;
  title: string;
  confidence: "exact" | "strong" | "possible";
  reason: string;
  context: string;
}

/**
 * Ask whether something like this already exists.
 *
 * Matching lives in the database so every screen asks the same question the
 * same way. This only reports; the decision belongs to the person, and
 * creating anyway is always available.
 */
export async function checkDuplicates(
  entity: "company" | "gtm_account" | "task" | "content" | "gtm_contact",
  name: string,
  url?: string | null,
  scope?: string | null,
): Promise<DuplicateHit[]> {
  if (!name.trim()) return [];
  try {
    await requirePerson("viewer");
    return await opsQuery<DuplicateHit>(
      `select id, title, confidence::text as confidence, reason, context
         from mc.find_duplicates(p_entity => $1, p_name => $2, p_url => $3, p_scope => $4::uuid)`,
      [entity, name, url ?? null, scope ?? null],
    );
  } catch {
    // A failed duplicate check must never block someone's work.
    return [];
  }
}

// --- Lifecycle: delete and reopen (spec sections 9, 10) -----------------------------

/**
 * Remove a task without counting it as completed work.
 *
 * Section 9 is explicit that this must never become Complete: an accidental
 * card, a test record or a bad import should leave no trace in the
 * productivity numbers.
 */
export async function deleteTask(taskId: string, reason?: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const rows = await asPerson(me.id, (q) =>
      q<{ project_id: string | null }>(
        `select t.project_id, mc.soft_delete_task(p_task => t.id, p_reason => $2)
           from mc.tasks t where t.id = $1 and t.deleted_at is null`,
        [taskId, reason ?? null],
      ),
    );
    { const w = wrote(rows, "task"); if (!w.ok) return w; }

    refresh(rows[0].project_id);
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteContentItem(id: string, reason?: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const rows = await asPerson(me.id, (q) =>
      q(
        `select mc.soft_delete_content(p_content => c.id, p_reason => $2)
           from mc.content c where c.id = $1 and c.deleted_at is null`,
        [id, reason ?? null],
      ),
    );
    { const w = wrote(rows, "content item"); if (!w.ok) return w; }
    revalidatePath("/content");
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Return archived work to the board. The completion history is preserved. */
export async function reopenTask(
  taskId: string, status: TaskStatus = "todo",
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const rows = await asPerson(me.id, (q) =>
      q(
        `select mc.reopen_task(p_task => t.id, p_status => $2::mc.task_status)
           from mc.tasks t where t.id = $1 and t.archived_at is not null`,
        [taskId, status],
      ),
    );
    { const w = wrote(rows, "task"); if (!w.ok) return w; }
    revalidatePath("/board");
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Global kanban lifecycle (spec sections 1-5, 25-27) -----------------------------

type BoardKind = "task" | "content" | "gtm_account";

/**
 * Per board: the table, the write floor, and the lifecycle function calls.
 * Each call reads the row as `r` and the second parameter as reason or stage.
 * Everything here is a constant; `kind` only ever selects an entry.
 */
const BOARD: Record<BoardKind, {
  table: string; floor: UserRole; archive: string; remove: string; reopen: string;
}> = {
  task: {
    table: "mc.tasks",
    floor: "member",
    archive: "mc.archive_task(p_id => r.id, p_reason => $2::text)",
    remove: "mc.soft_delete_task(p_task => r.id, p_reason => $2::text)",
    reopen: "mc.reopen_task(p_task => r.id, p_status => coalesce($2::mc.task_status, 'todo'))",
  },
  content: {
    table: "mc.content",
    floor: "viewer",
    archive: "mc.archive_content(p_id => r.id, p_reason => $2::text)",
    remove: "mc.soft_delete_content(p_content => r.id, p_reason => $2::text)",
    reopen: "mc.reopen_content(p_id => r.id, p_status => $2::mc.content_status)",
  },
  gtm_account: {
    table: "mc.gtm_accounts",
    floor: "member",
    archive: "mc.archive_gtm_account(p_id => r.id, p_reason => $2::text)",
    remove: "mc.soft_delete_gtm_account(p_id => r.id, p_reason => $2::text)",
    reopen: "mc.reopen_gtm_account(p_id => r.id, p_stage => $2::mc.gtm_stage)",
  },
};

/** Which rows each lifecycle move applies to, so a count is what actually changed. */
const ELIGIBLE = {
  archive: "r.archived_at is null and r.deleted_at is null",
  remove: "r.deleted_at is null",
  reopen: "r.archived_at is not null and r.deleted_at is null",
} as const;

function board(kind: BoardKind) {
  const b = BOARD[kind];
  if (!b) throw new Error("Unknown board.");
  return b;
}

/**
 * Apply one lifecycle function to every eligible row in one transaction and
 * one statement, returning how many it touched. Rows already in the target
 * state, or gone, are skipped rather than logged as if they changed.
 */
async function lifecycle(
  personId: string, kind: BoardKind, move: keyof typeof ELIGIBLE, ids: string[], arg: string | null,
): Promise<number> {
  const b = board(kind);
  const rows = await asPerson(personId, (q) =>
    q(`select ${b[move]} from ${b.table} r where r.id = any($1::uuid[]) and ${ELIGIBLE[move]}`,
      [ids, arg]),
  );
  return rows.length;
}

/** Honest counts: a batch that changed 3 of 5 says so instead of reporting 5. */
function counted(done: number, total: number, verb: string, rest: string): Result<{ count: number }> {
  if (done === total) return { ok: true, data: { count: done } };
  return {
    ok: false,
    error: `${verb} ${done} of ${total}. The other ${total - done} ${rest}.`,
    data: { count: done },
  };
}

/**
 * Archive records without completing them (sections 16, 25).
 *
 * Archive preserves; delete removes. Keeping them separate is the whole point:
 * finished work should never have to be deleted to get it off the board.
 */
export async function archiveRecords(
  kind: BoardKind, ids: string[], reason?: string,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    const { me } = await requirePerson(board(kind).floor);
    const done = await lifecycle(me.id, kind, "archive", ids, reason ?? null);
    revalidatePath("/board"); revalidatePath("/content");
    revalidatePath("/gtm"); revalidatePath("/archive");
    return counted(done, ids.length, "Archived", "were already archived or no longer exist");
  } catch (e) { return fail(e); }
}

/**
 * Set priority across a selection.
 *
 * Re-prioritising was a per-card trip through the board, which is why 11 of
 * 14 accounts ended up marked high: correcting them one at a time is work
 * nobody does. The table differs per board but the column does not.
 */
export async function setPriorityForRecords(
  kind: BoardKind, ids: string[], priority: Priority,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    // mc.content has no priority column; the original surfaced the raw column error.
    if (kind === "content") return { ok: false, error: "Content does not have a priority." };
    const b = board(kind);
    const { me } = await requirePerson(b.floor);
    const rows = await asPerson(me.id, (q) =>
      q(`update ${b.table} set priority = $2::mc.priority where id = any($1::uuid[]) returning id`,
        [ids, priority]),
    );
    revalidatePath("/board"); revalidatePath("/content"); revalidatePath("/gtm");
    return counted(rows.length, ids.length, "Updated", "no longer exist");
  } catch (e) { return fail(e); }
}

/**
 * Delete records permanently (sections 26, 27).
 *
 * Gated on admin: section 27 asks that archiving stay an ordinary operational
 * permission while deleting requires elevation, so a bulk selection cannot
 * become a bulk mistake.
 */
export async function deleteRecords(
  kind: BoardKind, ids: string[], reason?: string,
): Promise<Result<{ count: number }>> {
  try {
    const { me } = await requirePerson("viewer");
    if (!atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can delete records." };
    }
    if (!ids.length) return { ok: true, data: { count: 0 } };

    const done = await lifecycle(me.id, kind, "remove", ids, reason ?? null);
    revalidatePath("/board"); revalidatePath("/content");
    revalidatePath("/gtm"); revalidatePath("/archive");
    return counted(done, ids.length, "Deleted", "no longer exist");
  } catch (e) { return fail(e); }
}

/** Section 14: return an archived record to an intentional stage, not an arbitrary one. */
export async function reopenRecord(
  kind: BoardKind, id: string, stage?: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson(board(kind).floor);
    const done = await lifecycle(me.id, kind, "reopen", [id], stage ?? null);
    revalidatePath("/archive"); revalidatePath("/board");
    revalidatePath("/content"); revalidatePath("/gtm");
    if (!done) return { ok: false, error: "That record is not in the archive. It may have been reopened or deleted." };
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Put several archived accounts back on the board.
 *
 * A campaign that ended does not stay ended: a company re-opens a req, or a
 * contact resurfaces months later. Restoring them one at a time, from a table
 * with no way to select more than one, is why they stay archived.
 *
 * The stage is chosen rather than assumed, since where a revived account
 * belongs depends on how much of the old research still holds.
 */
export async function reopenRecords(
  kind: BoardKind, ids: string[], stage?: string,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    const { me } = await requirePerson(board(kind).floor);
    const done = await lifecycle(me.id, kind, "reopen", ids, stage ?? null);
    revalidatePath("/archive"); revalidatePath("/board");
    revalidatePath("/content"); revalidatePath("/gtm");
    return counted(done, ids.length, "Reopened", "were not in the archive");
  } catch (e) { return fail(e); }
}

// --- Ideas ---------------------------------------------------------------

/**
 * Capture a suggestion.
 *
 * Only the title is required. An idea half-written beats one nobody bothered
 * to submit, and the detail can be filled in by whoever picks it up.
 */
export async function createIdea(input: {
  title: string;
  problem?: string | null;
  proposal?: string | null;
  category?: string | null;
  impact?: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("viewer");
    if (!input.title.trim()) return { ok: false, error: "Give the idea a title." };

    const [row] = await asPerson(me.id, (q) =>
      q<{ id: string }>(
        `insert into mc.ideas (title, problem, proposal, category, impact, submitted_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [
          input.title.trim(),
          input.problem?.trim() || null,
          input.proposal?.trim() || null,
          input.category || null,
          input.impact ?? "medium",
          me.id,
        ],
      ),
    );
    revalidatePath("/ideas");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

const IDEA_COLUMNS = [
  "title", "problem", "proposal", "category", "impact",
  "status", "owner_id", "is_priority", "outcome_note",
] as const;

/** Leadership moves an idea along; the submitter is told when it matters. */
export async function updateIdea(
  id: string, patch: Record<string, unknown>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    // Anyone can edit their own wording; only leadership sets status,
    // ownership or priority.
    const leadershipOnly = ["status", "owner_id", "is_priority", "outcome_note"];
    if (leadershipOnly.some((k) => k in patch) && !atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can change that." };
    }
    const set = setClause(patch, IDEA_COLUMNS);
    if (set.empty) return { ok: true };
    const rows = await asPerson(me.id, (q) =>
      q(`update mc.ideas set ${set.sql} where id = $${set.values.length + 1} returning id`,
        [...set.values, id]),
    );
    { const w = wrote(rows, "idea"); if (!w.ok) return w; }
    revalidatePath("/ideas");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Vote, or take it back. One per person, enforced by the primary key. */
export async function toggleIdeaVote(ideaId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    // One statement: remove the vote if there is one, otherwise cast it.
    await asPerson(me.id, (q) =>
      q(
        `with removed as (
           delete from mc.idea_votes where idea_id = $1 and person_id = $2 returning 1
         )
         insert into mc.idea_votes (idea_id, person_id)
         select $1::uuid, $2::uuid where not exists (select 1 from removed)
         on conflict do nothing`,
        [ideaId, me.id],
      ),
    );
    revalidatePath("/ideas");
    return { ok: true };
  } catch (e) { return fail(e); }
}
