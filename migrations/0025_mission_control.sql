-- Mission Control, folded into ALAC OS.
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

-- 00000000000001_schema.sql
create type task_status as enum (
  'todo',
  'doing',
  'waiting',    
  'done'
);

-- 00000000000001_schema.sql
create type priority as enum (
  'high',       
  'normal',
  'low'
);

-- 00000000000001_schema.sql
create type project_status as enum ('active', 'on_hold', 'done', 'archived');

-- 00000000000001_schema.sql
create type health as enum ('on_track', 'watch', 'at_risk');

-- 00000000000001_schema.sql
create type recurrence as enum ('daily', 'weekly', 'biweekly', 'monthly');

-- 00000000000001_schema.sql
create table people (
  id            uuid primary key references public.users(id) on delete cascade,
  email         text not null unique,
  name          text not null,
  title         text,
  avatar_url    text,
  
  is_admin      boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000001_schema.sql
create table clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  notes         text,
  
  external_url  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000001_schema.sql
create index clients_name_trgm on clients using gin (name gin_trgm_ops);

-- 00000000000001_schema.sql
create table projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  status        project_status not null default 'active',
  health        health not null default 'on_track',
  owner_id      uuid not null references people(id) on delete restrict,
  client_id     uuid references clients(id) on delete set null,
  
  
  category      text,
  due_date      date,
  
  task_count    int not null default 0,
  done_count    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

-- 00000000000001_schema.sql
create index projects_status_idx on projects (status);

-- 00000000000001_schema.sql
create index projects_owner_idx on projects (owner_id);

-- 00000000000001_schema.sql
create index projects_client_idx on projects (client_id);

-- 00000000000001_schema.sql
create index projects_due_idx on projects (due_date) where status = 'active';

-- 00000000000001_schema.sql
create index projects_name_trgm on projects using gin (name gin_trgm_ops);

-- 00000000000001_schema.sql
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  title         text not null,
  notes         text,
  status        task_status not null default 'todo',
  priority      priority not null default 'normal',
  assignee_id   uuid references people(id) on delete set null,
  due_date      date,
  
  position      numeric not null default 0,
  
  recurring_id  uuid,
  done_at       timestamptz,
  created_by    uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000001_schema.sql
create index tasks_due_idx on tasks (due_date) where status <> 'done';

-- 00000000000001_schema.sql
create index tasks_assignee_idx on tasks (assignee_id) where status <> 'done';

-- 00000000000001_schema.sql
create index tasks_project_idx on tasks (project_id);

-- 00000000000001_schema.sql
create index tasks_status_idx on tasks (status);

-- 00000000000001_schema.sql
create index tasks_title_trgm on tasks using gin (title gin_trgm_ops);

-- 00000000000001_schema.sql
create table checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  content     text not null,
  is_done     boolean not null default false,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- 00000000000001_schema.sql
create index checklist_task_idx on checklist_items (task_id, position);

-- 00000000000001_schema.sql
create table comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid not null references people(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- 00000000000001_schema.sql
create index comments_task_idx on comments (task_id, created_at);

-- 00000000000001_schema.sql
create table recurring_tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  project_id    uuid references projects(id) on delete cascade,
  assignee_id   uuid references people(id) on delete set null,
  priority      priority not null default 'normal',
  frequency     recurrence not null,
  
  day_of_week   int check (day_of_week between 0 and 6),
  
  day_of_month  int check (day_of_month between 1 and 31),
  
  checklist     text[] not null default '{}',
  next_due      date not null default current_date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000001_schema.sql
create index recurring_due_idx on recurring_tasks (next_due) where is_active;

-- 00000000000001_schema.sql
alter table tasks
  add constraint tasks_recurring_fk
  foreign key (recurring_id) references recurring_tasks(id) on delete set null;

-- 00000000000001_schema.sql
create table searches (
  project_id        uuid primary key references projects(id) on delete cascade,
  role_title        text not null,
  opened_on         date not null default current_date,
  
  target_count      int not null default 5,
  target_days       int not null default 30,
  
  submitted         int not null default 0,
  interviews        int not null default 0,
  placements        int not null default 0,
  updated_at        timestamptz not null default now()
);

-- 00000000000001_schema.sql
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 00000000000001_schema.sql
do $$
declare t text;
begin
  foreach t in array array['people','clients','projects','tasks','recurring_tasks','searches']
  loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()', t, t);
  end loop;
end;
$$;

-- 00000000000001_schema.sql
create or replace function stamp_done()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at := coalesce(new.done_at, now());
  elsif new.status <> 'done' then
    new.done_at := null;
  end if;
  return new;
end;
$$;

-- 00000000000001_schema.sql
create trigger tasks_stamp_done
  before insert or update on tasks
  for each row execute function stamp_done();

-- 00000000000001_schema.sql
create or replace function recount_project(p_id uuid)
returns void language plpgsql as $$
begin
  if p_id is null then return; end if;
  update projects p
     set task_count = (select count(*) from tasks t where t.project_id = p_id),
         done_count = (select count(*) from tasks t
                        where t.project_id = p_id and t.status = 'done')
   where p.id = p_id;
end;
$$;

-- 00000000000001_schema.sql
create or replace function on_task_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform recount_project(old.project_id);
    return old;
  end if;
  perform recount_project(new.project_id);
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    perform recount_project(old.project_id);
  end if;
  return new;
end;
$$;

-- 00000000000001_schema.sql
create trigger tasks_recount
  after insert or delete or update of status, project_id on tasks
  for each row execute function on_task_change();

-- 00000000000001_schema.sql
create or replace function next_recurrence(r recurring_tasks, from_date date)
returns date language plpgsql immutable as $$
declare
  d date;
begin
  case r.frequency
    when 'daily' then
      d := from_date + 1;
    when 'weekly' then
      d := from_date + 7;
    when 'biweekly' then
      d := from_date + 14;
    when 'monthly' then
      d := (from_date + interval '1 month')::date;
      if r.day_of_month is not null then
        -- Clamp to the month's length so the 31st does not skip February.
        d := date_trunc('month', d)::date
             + (least(r.day_of_month,
                      extract(day from (date_trunc('month', d)
                        + interval '1 month - 1 day'))::int) - 1);
      end if;
    else
      d := from_date + 7;
  end case;
  return d;
end;
$$;

-- 00000000000001_schema.sql
create or replace function generate_recurring(r_id uuid, due date)
returns uuid language plpgsql as $$
declare
  r        recurring_tasks%rowtype;
  new_id   uuid;
  item     text;
  i        int := 0;
begin
  select * into r from recurring_tasks where id = r_id;
  if not found or not r.is_active then return null; end if;

  select id into new_id from tasks
   where recurring_id = r_id and due_date = due limit 1;
  if new_id is not null then return new_id; end if;

  insert into tasks (project_id, title, notes, status, priority,
                     assignee_id, due_date, recurring_id)
  values (r.project_id, r.title, r.notes, 'todo', r.priority,
          r.assignee_id, due, r.id)
  returning id into new_id;

  foreach item in array r.checklist loop
    insert into checklist_items (task_id, content, position)
    values (new_id, item, i);
    i := i + 1;
  end loop;

  update recurring_tasks
     set next_due = next_recurrence(r, due)
   where id = r_id;

  return new_id;
end;
$$;

-- 00000000000001_schema.sql
create or replace function on_recurring_done()
returns trigger language plpgsql as $$
declare r recurring_tasks%rowtype;
begin
  if new.recurring_id is not null
     and new.status = 'done'
     and old.status is distinct from 'done' then
    select * into r from recurring_tasks where id = new.recurring_id;
    if found and r.is_active then
      perform generate_recurring(
        r.id, next_recurrence(r, coalesce(new.due_date, current_date)));
    end if;
  end if;
  return new;
end;
$$;

-- 00000000000001_schema.sql
create trigger tasks_recur
  after update of status on tasks
  for each row execute function on_recurring_done();

-- 00000000000001_schema.sql
create or replace function run_due_recurring()
returns int language plpgsql as $$
declare
  r recurring_tasks%rowtype;
  n int := 0;
begin
  for r in select * from recurring_tasks
            where is_active and next_due <= current_date
  loop
    if generate_recurring(r.id, r.next_due) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- 00000000000001_schema.sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = mc, public as $$
begin
  insert into mc.people (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.full_name, ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 00000000000001_schema.sql
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = mc, public as $$
  select coalesce((select is_admin from people where id = mc.uid()), false);
$$;

-- 00000000000002_team_content_signals.sql
create type department as enum (
  'growth',      
  'brand',       
  'marketing',   
  'operations',  
  'delivery',    
  'admin'
);

-- 00000000000002_team_content_signals.sql
alter table people add column department department;

-- 00000000000002_team_content_signals.sql
alter table people add column slack_user_id text;

-- 00000000000002_team_content_signals.sql
alter table projects add column department department;

-- 00000000000002_team_content_signals.sql
update projects set department = case lower(coalesce(category, ''))
  when 'recruiting'           then 'delivery'::department
  when 'business development' then 'growth'::department
  when 'marketing'            then 'marketing'::department
  when 'brand'                then 'brand'::department
  when 'operations'           then 'operations'::department
  when 'admin'                then 'admin'::department
  when 'internal'             then 'operations'::department
  else 'operations'::department
end;

-- 00000000000002_team_content_signals.sql
alter table projects alter column department set default 'operations';

-- 00000000000002_team_content_signals.sql
alter table projects alter column department set not null;

-- 00000000000002_team_content_signals.sql
create index projects_dept_idx on projects (department) where status = 'active';

-- 00000000000002_team_content_signals.sql
alter table tasks add column department department;

-- 00000000000002_team_content_signals.sql
update tasks t set department = p.department
  from projects p where p.id = t.project_id;

-- 00000000000002_team_content_signals.sql
update tasks set department = 'operations' where department is null;

-- 00000000000002_team_content_signals.sql
alter table tasks alter column department set default 'operations';

-- 00000000000002_team_content_signals.sql
alter table tasks alter column department set not null;

-- 00000000000002_team_content_signals.sql
create index tasks_dept_idx on tasks (department) where status <> 'done';

-- 00000000000002_team_content_signals.sql
create or replace function sync_task_department()
returns trigger language plpgsql as $$
begin
  if new.project_id is not null
     and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
    select department into new.department from projects where id = new.project_id;
  end if;
  return new;
end;
$$;

-- 00000000000002_team_content_signals.sql
create trigger tasks_sync_dept
  before insert or update of project_id on tasks
  for each row execute function sync_task_department();

-- 00000000000002_team_content_signals.sql
create or replace function cascade_project_department()
returns trigger language plpgsql as $$
begin
  if new.department is distinct from old.department then
    update tasks set department = new.department where project_id = new.id;
  end if;
  return new;
end;
$$;

-- 00000000000002_team_content_signals.sql
create trigger projects_cascade_dept
  after update of department on projects
  for each row execute function cascade_project_department();

-- 00000000000002_team_content_signals.sql
create table slack_settings (
  id                  int primary key default 1 check (id = 1),
  
  
  webhook_url         text,
  
  default_channel     text default '#alac_main',
  notify_assigned     boolean not null default true,
  notify_completed    boolean not null default true,
  notify_waiting      boolean not null default true,
  notify_overdue      boolean not null default true,
  notify_comment      boolean not null default true,
  
  daily_digest        boolean not null default true,
  is_connected        boolean not null default false,
  last_sent_at        timestamptz,
  last_error          text,
  updated_at          timestamptz not null default now()
);

-- 00000000000002_team_content_signals.sql
insert into slack_settings (id) values (1) on conflict do nothing;

-- 00000000000002_team_content_signals.sql
create table slack_outbox (
  id            uuid primary key default gen_random_uuid(),
  
  kind          text not null,
  
  target_slack_id text,
  channel       text,
  text          text not null,
  
  blocks        jsonb,
  task_id       uuid references tasks(id) on delete cascade,
  sent_at       timestamptz,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now()
);

-- 00000000000002_team_content_signals.sql
create index slack_outbox_pending on slack_outbox (created_at)
  where sent_at is null and attempts < 5;

-- 00000000000002_team_content_signals.sql
create type platform as enum (
  'linkedin', 'x', 'instagram', 'youtube', 'facebook', 'tiktok', 'newsletter'
);

-- 00000000000002_team_content_signals.sql
create type content_status as enum (
  'idea',       
  'drafting',   
  'review',     
  'approved',   
  'scheduled',  
  'published'
);

-- 00000000000002_team_content_signals.sql
create type content_kind as enum (
  'post',       
  'short',      
  'long',       
  'carousel',
  'newsletter',
  'article'
);

-- 00000000000002_team_content_signals.sql
create table voice_profile (
  id              int primary key default 1 check (id = 1),
  person_id       uuid references people(id) on delete set null,
  
  tone            text,
  beliefs         text,
  avoid           text,
  
  samples         text,
  audience        text,
  updated_at      timestamptz not null default now()
);

-- 00000000000002_team_content_signals.sql
insert into voice_profile (id) values (1) on conflict do nothing;

-- 00000000000002_team_content_signals.sql
create table content (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          content_kind not null default 'post',
  platform      platform not null default 'linkedin',
  status        content_status not null default 'idea',

  
  hook          text,
  
  body          text,
  
  script        text,
  
  notes         text,

  owner_id      uuid references people(id) on delete set null,
  publish_date  date,
  published_url text,

  
  
  source        text not null default 'manual',
  source_ref    uuid,

  
  generated_at  timestamptz,
  generated_by  text,

  position      numeric not null default 0,
  created_by    uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000002_team_content_signals.sql
create index content_status_idx on content (status);

-- 00000000000002_team_content_signals.sql
create index content_platform_idx on content (platform);

-- 00000000000002_team_content_signals.sql
create index content_publish_idx on content (publish_date) where status <> 'published';

-- 00000000000002_team_content_signals.sql
create index content_owner_idx on content (owner_id);

-- 00000000000002_team_content_signals.sql
create table bd_signals (
  id                uuid primary key default gen_random_uuid(),
  
  external_id       text not null unique,
  contact_name      text,
  company           text,
  stage             text not null,
  days_in_stage     int not null default 0,
  
  urgency           text not null default 'in_sequence',
  value_usd         numeric(12,2),
  signal_note       text,
  next_action       text,
  owner_id          uuid references people(id) on delete set null,
  external_url      text,
  
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- 00000000000002_team_content_signals.sql
create index bd_urgency_idx on bd_signals (urgency, days_in_stage desc);

-- 00000000000002_team_content_signals.sql
create index bd_synced_idx on bd_signals (synced_at desc);

-- 00000000000002_team_content_signals.sql
create or replace function slack_enabled(event text)
returns boolean language sql stable as $$
  select coalesce((
    select is_connected and webhook_url is not null and case event
      when 'assigned'  then notify_assigned
      when 'completed' then notify_completed
      when 'waiting'   then notify_waiting
      when 'comment'   then notify_comment
      else true
    end from slack_settings where id = 1), false);
$$;

-- 00000000000002_team_content_signals.sql
create or replace function queue_task_slack()
returns trigger language plpgsql as $$
declare
  actor_name  text;
  who_slack   text;
  who_name    text;
  proj        text;
begin
  select name into actor_name from people where id = mc.uid();
  select p.name into proj from projects p where p.id = new.project_id;

  -- Assigned to someone new.
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and slack_enabled('assigned') then
    select slack_user_id, name into who_slack, who_name
      from people where id = new.assignee_id;

    insert into slack_outbox (kind, target_slack_id, text, task_id)
    values ('task_assigned', who_slack,
            format('%s assigned you *%s*%s',
                   coalesce(actor_name, 'Someone'), new.title,
                   case when proj is not null then format(' · _%s_', proj) else '' end),
            new.id);
  end if;

  if tg_op = 'UPDATE' then
    -- Finished.
    if new.status = 'done' and old.status is distinct from 'done'
       and slack_enabled('completed') then
      insert into slack_outbox (kind, target_slack_id, text, task_id)
      values ('task_completed', null,
              format(':white_check_mark: *%s* completed *%s*%s',
                     coalesce(actor_name, 'Someone'), new.title,
                     case when proj is not null then format(' · _%s_', proj) else '' end),
              new.id);
    end if;

    -- Stuck on someone. This is the one that unblocks work.
    if new.status = 'waiting' and old.status is distinct from 'waiting'
       and slack_enabled('waiting') then
      select slack_user_id into who_slack from people where id = new.assignee_id;

      insert into slack_outbox (kind, target_slack_id, text, task_id)
      values ('task_waiting', who_slack,
              format(':hourglass: *%s* is waiting%s, %s',
                     new.title,
                     case when proj is not null then format(' · _%s_', proj) else '' end,
                     coalesce(new.notes, 'blocked on someone')),
              new.id);
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000002_team_content_signals.sql
create trigger tasks_slack
  after insert or update of assignee_id, status on tasks
  for each row execute function queue_task_slack();

-- 00000000000002_team_content_signals.sql
create or replace function queue_comment_slack()
returns trigger language plpgsql as $$
declare
  author  text;
  t       tasks%rowtype;
  who     text;
begin
  if not slack_enabled('comment') then return new; end if;

  select name into author from people where id = new.author_id;
  select * into t from tasks where id = new.task_id;
  -- Ping the task's owner, unless they wrote the comment.
  select slack_user_id into who from people
   where id = t.assignee_id and id <> new.author_id;

  insert into slack_outbox (kind, target_slack_id, text, task_id)
  values ('comment', who,
          format(':speech_balloon: *%s* on *%s*: %s',
                 coalesce(author, 'Someone'), t.title, left(new.body, 240)),
          t.id);

  return new;
end;
$$;

-- 00000000000002_team_content_signals.sql
create trigger comments_slack
  after insert on comments
  for each row execute function queue_comment_slack();

-- 00000000000002_team_content_signals.sql
create trigger content_touch before update on content
  for each row execute function touch_updated_at();

-- 00000000000002_team_content_signals.sql
create trigger voice_touch before update on voice_profile
  for each row execute function touch_updated_at();

-- 00000000000002_team_content_signals.sql
create trigger slack_settings_touch before update on slack_settings
  for each row execute function touch_updated_at();

-- 00000000000003_calendar_drive_simplify.sql
alter table projects alter column department drop default;

-- 00000000000003_calendar_drive_simplify.sql
alter table tasks    alter column department drop default;

-- 00000000000003_calendar_drive_simplify.sql
drop trigger tasks_sync_dept on tasks;

-- 00000000000003_calendar_drive_simplify.sql
drop trigger projects_cascade_dept on projects;

-- 00000000000003_calendar_drive_simplify.sql
update projects set department = 'operations' where department = 'growth';

-- 00000000000003_calendar_drive_simplify.sql
update tasks    set department = 'operations' where department = 'growth';

-- 00000000000003_calendar_drive_simplify.sql
update people   set department = 'operations' where department = 'growth';

-- 00000000000003_calendar_drive_simplify.sql
alter type department rename to department_old;

-- 00000000000003_calendar_drive_simplify.sql
create type department as enum (
  'brand',
  'marketing',
  'operations',
  'delivery',
  'admin'
);

-- 00000000000003_calendar_drive_simplify.sql
alter table projects
  alter column department type department using department::text::department;

-- 00000000000003_calendar_drive_simplify.sql
alter table tasks
  alter column department type department using department::text::department;

-- 00000000000003_calendar_drive_simplify.sql
alter table people
  alter column department type department using department::text::department;

-- 00000000000003_calendar_drive_simplify.sql
drop type department_old;

-- 00000000000003_calendar_drive_simplify.sql
alter table projects alter column department set default 'operations';

-- 00000000000003_calendar_drive_simplify.sql
alter table tasks    alter column department set default 'operations';

-- 00000000000003_calendar_drive_simplify.sql
create trigger tasks_sync_dept
  before insert or update of project_id on tasks
  for each row execute function sync_task_department();

-- 00000000000003_calendar_drive_simplify.sql
create trigger projects_cascade_dept
  after update of department on projects
  for each row execute function cascade_project_department();

-- 00000000000003_calendar_drive_simplify.sql
create table calendars (
  id            uuid primary key default gen_random_uuid(),
  
  person_id     uuid references people(id) on delete cascade,
  
  email         text not null unique,
  label         text not null,
  
  provider      text not null default 'outlook',
  color         text not null default '#2a78d6',
  is_active     boolean not null default true,
  last_synced_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000003_calendar_drive_simplify.sql
create table calendar_events (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references calendars(id) on delete cascade,
  
  external_id   text not null,
  subject       text not null,
  
  
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  time_zone     text,
  is_all_day    boolean not null default false,
  location      text,
  organizer     text,
  attendees     text[] not null default '{}',
  
  show_as       text,
  is_cancelled  boolean not null default false,
  web_link      text,
  categories    text[] not null default '{}',
  synced_at     timestamptz not null default now(),
  unique (calendar_id, external_id)
);

-- 00000000000003_calendar_drive_simplify.sql
create index calendar_events_time_idx on calendar_events (starts_at)
  where not is_cancelled;

-- 00000000000003_calendar_drive_simplify.sql
create index calendar_events_cal_idx on calendar_events (calendar_id, starts_at);

-- 00000000000003_calendar_drive_simplify.sql
create table drive_files (
  id            uuid primary key default gen_random_uuid(),
  
  external_id   text not null unique,
  title         text not null,
  mime_type     text,
  
  folder        text,
  view_url      text not null,
  icon_kind     text,          
  size_bytes    bigint,
  modified_at   timestamptz,
  
  project_id    uuid references projects(id) on delete cascade,
  content_id    uuid references content(id) on delete cascade,
  added_by      uuid references people(id) on delete set null,
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 00000000000003_calendar_drive_simplify.sql
create index drive_project_idx on drive_files (project_id);

-- 00000000000003_calendar_drive_simplify.sql
create index drive_content_idx on drive_files (content_id);

-- 00000000000003_calendar_drive_simplify.sql
create index drive_title_trgm on drive_files using gin (title gin_trgm_ops);

-- 00000000000003_calendar_drive_simplify.sql
create table integrations (
  key             text primary key,   
  label           text not null,
  is_connected    boolean not null default false,
  last_synced_at  timestamptz,
  last_error      text,
  detail          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- 00000000000003_calendar_drive_simplify.sql
insert into integrations (key, label) values
  ('outlook',       'Outlook Calendar'),
  ('drive',         'Google Drive'),
  ('slack',         'Slack'),
  ('recruiterflow', 'RecruiterFlow')
on conflict (key) do nothing;

-- 00000000000003_calendar_drive_simplify.sql
create trigger calendars_touch before update on calendars
  for each row execute function touch_updated_at();

-- 00000000000003_calendar_drive_simplify.sql
create trigger integrations_touch before update on integrations
  for each row execute function touch_updated_at();

-- 00000000000004_board_and_priority.sql
alter table tasks alter column status drop default;

-- 00000000000004_board_and_priority.sql
drop trigger tasks_stamp_done on tasks;

-- 00000000000004_board_and_priority.sql
drop trigger tasks_recount on tasks;

-- 00000000000004_board_and_priority.sql
drop trigger tasks_recur on tasks;

-- 00000000000004_board_and_priority.sql
drop trigger tasks_slack on tasks;

-- 00000000000004_board_and_priority.sql
alter type task_status rename to task_status_old;

-- 00000000000004_board_and_priority.sql
create type task_status as enum (
  'todo',      
  'doing',     
  'review',    
  'blocked',   
  'done'
);

-- 00000000000004_board_and_priority.sql
alter table tasks add column status_text text;

-- 00000000000004_board_and_priority.sql
update tasks set status_text = case status::text
  when 'waiting' then
    case when title ~* '(approve|approval|review|sign.?off|qc)'
         then 'review' else 'blocked' end
  else status::text
end;

-- 00000000000004_board_and_priority.sql
alter table tasks drop column status;

-- 00000000000004_board_and_priority.sql
alter table tasks add column status task_status not null default 'todo';

-- 00000000000004_board_and_priority.sql
update tasks set status = status_text::task_status;

-- 00000000000004_board_and_priority.sql
alter table tasks drop column status_text;

-- 00000000000004_board_and_priority.sql
alter table tasks alter column status set default 'todo';

-- 00000000000004_board_and_priority.sql
drop type task_status_old;

-- 00000000000004_board_and_priority.sql
create trigger tasks_stamp_done
  before insert or update on tasks
  for each row execute function stamp_done();

-- 00000000000004_board_and_priority.sql
create trigger tasks_recount
  after insert or delete or update of status, project_id on tasks
  for each row execute function on_task_change();

-- 00000000000004_board_and_priority.sql
create trigger tasks_recur
  after update of status on tasks
  for each row execute function on_recurring_done();

-- 00000000000004_board_and_priority.sql
create trigger tasks_slack
  after insert or update of assignee_id, status on tasks
  for each row execute function queue_task_slack();

-- 00000000000004_board_and_priority.sql
create or replace function queue_task_slack()
returns trigger language plpgsql as $$
declare
  actor_name  text;
  who_slack   text;
  who_name    text;
  proj        text;
begin
  select name into actor_name from people where id = mc.uid();
  select p.name into proj from projects p where p.id = new.project_id;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and slack_enabled('assigned') then
    select slack_user_id, name into who_slack, who_name
      from people where id = new.assignee_id;

    insert into slack_outbox (kind, target_slack_id, text, task_id)
    values ('task_assigned', who_slack,
            format('%s assigned you *%s*%s',
                   coalesce(actor_name, 'Someone'), new.title,
                   case when proj is not null then format(' · _%s_', proj) else '' end),
            new.id);
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'done' and old.status is distinct from 'done'
       and slack_enabled('completed') then
      insert into slack_outbox (kind, target_slack_id, text, task_id)
      values ('task_completed', null,
              format(':white_check_mark: *%s* completed *%s*%s',
                     coalesce(actor_name, 'Someone'), new.title,
                     case when proj is not null then format(' · _%s_', proj) else '' end),
              new.id);
    end if;

    -- Review needs a person to look; blocked needs someone to unstick it.
    -- Both are worth a ping, with wording that says which.
    if new.status in ('review', 'blocked')
       and old.status is distinct from new.status
       and slack_enabled('waiting') then
      select slack_user_id into who_slack from people where id = new.assignee_id;

      insert into slack_outbox (kind, target_slack_id, text, task_id)
      values ('task_waiting', who_slack,
              case new.status
                when 'review' then
                  format(':eyes: *%s* needs review%s', new.title,
                         case when proj is not null then format(' · _%s_', proj) else '' end)
                else
                  format(':no_entry: *%s* is blocked%s, %s', new.title,
                         case when proj is not null then format(' · _%s_', proj) else '' end,
                         coalesce(new.notes, 'waiting on something outside the team'))
              end,
              new.id);
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000004_board_and_priority.sql
create table priority_targets (
  priority      priority primary key,
  label         text not null,
  
  hours         int not null,
  description   text not null
);

-- 00000000000004_board_and_priority.sql
insert into priority_targets (priority, label, hours, description) values
  ('high',   'High',   24,  'Within 24 hours'),
  ('normal', 'Normal', 120, 'Three to five days'),
  ('low',    'Low',    240, 'Ten days or whenever it fits')
on conflict (priority) do nothing;

-- 00000000000004_board_and_priority.sql
create or replace function apply_priority_target()
returns trigger language plpgsql as $$
declare
  target_hours int;
begin
  if new.due_date is null then
    select hours into target_hours
      from priority_targets where priority = new.priority;
    if target_hours is not null then
      new.due_date := (now() + (target_hours || ' hours')::interval)::date;
    end if;
  end if;
  return new;
end;
$$;

-- 00000000000004_board_and_priority.sql
create trigger tasks_priority_target
  before insert on tasks
  for each row execute function apply_priority_target();

-- 00000000000005_command_center_core.sql
create table functions (
  id            uuid primary key default gen_random_uuid(),
  
  key           text not null unique,
  name          text not null,
  description   text,
  
  color         text not null default '#64748B',
  lead_id       uuid references people(id) on delete set null,
  
  slack_channel text,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000005_command_center_core.sql
create index functions_active_idx on functions (sort_order) where is_active;

-- 00000000000005_command_center_core.sql
insert into functions (key, name, description, color, sort_order) values
  ('marketing', 'Marketing',      'Brand, content, and demand generation.',        '#eb6834', 0),
  ('s1',        'S1, Admin',     'Personnel, HR, compliance, company administration.', '#64748B', 1),
  ('s2',        'S2, Intel',     'Account research, market and competitive intelligence.', '#7C3AED', 2),
  ('s3',        'S3, Operations','Business and recruiting operations, training, SOPs.',    '#0F766E', 3),
  ('s4',        'S4, Logistics', 'Equipment, subscriptions, vendors, procurement.',        '#B45309', 4),
  ('s6',        'S6, Systems',   'Technology, integrations, automation, IT.',              '#2a78d6', 5)
on conflict (key) do nothing;

-- 00000000000005_command_center_core.sql
alter table projects add column function_id uuid references functions(id) on delete set null;

-- 00000000000005_command_center_core.sql
alter table tasks    add column function_id uuid references functions(id) on delete set null;

-- 00000000000005_command_center_core.sql
alter table people   add column function_id uuid references functions(id) on delete set null;

-- 00000000000005_command_center_core.sql
update projects p set function_id = f.id from functions f
 where f.key = case p.department::text
   when 'marketing'  then 'marketing'
   when 'brand'      then 'marketing'
   when 'operations' then 's3'
   when 'delivery'   then 's3'
   when 'admin'      then 's1'
   else 's3' end;

-- 00000000000005_command_center_core.sql
update tasks t set function_id = f.id from functions f
 where f.key = case t.department::text
   when 'marketing'  then 'marketing'
   when 'brand'      then 'marketing'
   when 'operations' then 's3'
   when 'delivery'   then 's3'
   when 'admin'      then 's1'
   else 's3' end;

-- 00000000000005_command_center_core.sql
update people pe set function_id = f.id from functions f
 where pe.department is not null and f.key = case pe.department::text
   when 'marketing'  then 'marketing'
   when 'brand'      then 'marketing'
   when 'operations' then 's3'
   when 'delivery'   then 's3'
   when 'admin'      then 's1'
   else 's3' end;

-- 00000000000005_command_center_core.sql
alter table tasks alter column function_id set not null;

-- 00000000000005_command_center_core.sql
create index tasks_function_idx on tasks (function_id) where status <> 'done';

-- 00000000000005_command_center_core.sql
create index projects_function_idx on projects (function_id);

-- 00000000000005_command_center_core.sql
create or replace function sync_task_function()
returns trigger language plpgsql as $$
begin
  if new.function_id is null and new.project_id is not null then
    select function_id into new.function_id from projects where id = new.project_id;
  end if;

  -- Last resort so a NOT NULL insert can never fail on this column.
  if new.function_id is null then
    select id into new.function_id from functions
     where is_active order by sort_order limit 1;
  end if;

  return new;
end;
$$;

-- 00000000000005_command_center_core.sql
create trigger tasks_sync_function
  before insert or update of project_id, function_id on tasks
  for each row execute function sync_task_function();

-- 00000000000005_command_center_core.sql
create type user_role as enum ('owner', 'admin', 'manager', 'member', 'viewer');

-- 00000000000005_command_center_core.sql
create type user_state as enum ('invited', 'active', 'suspended', 'deactivated');

-- 00000000000005_command_center_core.sql
alter table people add column role user_role not null default 'member';

-- 00000000000005_command_center_core.sql
alter table people add column state user_state not null default 'active';

-- 00000000000005_command_center_core.sql
alter table people add column timezone text not null default 'America/New_York';

-- 00000000000005_command_center_core.sql
alter table people add column job_title text;

-- 00000000000005_command_center_core.sql
alter table people add column invited_at timestamptz;

-- 00000000000005_command_center_core.sql
alter table people add column invited_by uuid references people(id) on delete set null;

-- 00000000000005_command_center_core.sql
alter table people add column last_seen_at timestamptz;

-- 00000000000005_command_center_core.sql
update people set role = 'owner' where is_admin;

-- 00000000000005_command_center_core.sql
update people set state = (case when is_active then 'active' else 'deactivated' end)::user_state;

-- 00000000000005_command_center_core.sql
create or replace function role_rank(r user_role)
returns int language sql immutable as $$
  select case r
    when 'owner'   then 4
    when 'admin'   then 3
    when 'manager' then 2
    when 'member'  then 1
    when 'viewer'  then 0
  end;
$$;

-- 00000000000005_command_center_core.sql
create or replace function my_role()
returns user_role language sql stable security definer set search_path = mc, public as $$
  select coalesce((select role from people where id = mc.uid()), 'viewer'::user_role);
$$;

-- 00000000000005_command_center_core.sql
create or replace function at_least(r user_role)
returns boolean language sql stable security definer set search_path = mc, public as $$
  select role_rank(my_role()) >= role_rank(r);
$$;

-- 00000000000005_command_center_core.sql
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = mc, public as $$
  select role_rank(coalesce(
    (select role from people where id = mc.uid()), 'viewer'::user_role)) >= 3;
$$;

-- 00000000000005_command_center_core.sql
alter type task_status add value if not exists 'backlog' before 'todo';

-- 00000000000005_command_center_core.sql
alter table tasks add column blocked_reason text;

-- 00000000000005_command_center_core.sql
alter table tasks add column started_at timestamptz;

-- 00000000000005_command_center_core.sql
alter table tasks add column review_requested_at timestamptz;

-- 00000000000005_command_center_core.sql
alter table tasks add column estimate_hours numeric(5,1);

-- 00000000000005_command_center_core.sql
create table task_collaborators (
  task_id     uuid not null references tasks(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  
  kind        text not null default 'collaborator',
  added_at    timestamptz not null default now(),
  primary key (task_id, person_id)
);

-- 00000000000005_command_center_core.sql
create index task_collab_person_idx on task_collaborators (person_id);

-- 00000000000005_command_center_core.sql
create table attachments (
  id            uuid primary key default gen_random_uuid(),
  
  entity_type   text not null,
  entity_id     uuid not null,
  file_name     text not null,
  
  storage_path  text,
  external_url  text,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  
  constraint attachments_has_target check (
    storage_path is not null or external_url is not null)
);

-- 00000000000005_command_center_core.sql
create index attachments_entity_idx on attachments (entity_type, entity_id);

-- 00000000000005_command_center_core.sql
create table activity (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,          
  entity_id     uuid not null,
  actor_id      uuid references people(id) on delete set null,
  
  verb          text not null,
  
  field         text,
  from_value    text,
  to_value      text,
  
  summary       text,
  created_at    timestamptz not null default now()
);

-- 00000000000005_command_center_core.sql
create index activity_entity_idx on activity (entity_type, entity_id, created_at desc);

-- 00000000000005_command_center_core.sql
create index activity_actor_idx on activity (actor_id, created_at desc);

-- 00000000000005_command_center_core.sql
create index activity_recent_idx on activity (created_at desc);

-- 00000000000005_command_center_core.sql
create type notify_kind as enum (
  'task_assigned',
  'task_started',
  'task_review_requested',
  'task_blocked',
  'task_completed',
  'task_due_soon',
  'task_overdue',
  'comment_mention',
  'comment_reply',
  'content_review',
  'content_published',
  'gtm_review',
  'recurring_created'
);

-- 00000000000005_command_center_core.sql
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  kind          notify_kind not null,
  title         text not null,
  body          text,
  
  url           text,
  entity_type   text,
  entity_id     uuid,
  actor_id      uuid references people(id) on delete set null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- 00000000000005_command_center_core.sql
create index notifications_person_idx on notifications (person_id, created_at desc);

-- 00000000000005_command_center_core.sql
create index notifications_unread_idx on notifications (person_id)
  where read_at is null;

-- 00000000000005_command_center_core.sql
create table notification_preferences (
  person_id     uuid not null references people(id) on delete cascade,
  kind          notify_kind not null,
  in_app        boolean not null default true,
  slack         boolean not null default true,
  primary key (person_id, kind)
);

-- 00000000000005_command_center_core.sql
create or replace function wants_notification(
  p_person uuid, p_kind notify_kind, p_channel text
) returns boolean language sql stable as $$
  select coalesce(
    (select case p_channel when 'slack' then slack else in_app end
       from notification_preferences
      where person_id = p_person and kind = p_kind),
    true);
$$;

-- 00000000000005_command_center_core.sql
create table slack_channels (
  id            uuid primary key default gen_random_uuid(),
  
  function_id   uuid references functions(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  channel_id    text not null,
  channel_name  text not null,
  created_at    timestamptz not null default now(),
  constraint slack_channels_one_scope check (
    (function_id is not null)::int + (project_id is not null)::int = 1)
);

-- 00000000000005_command_center_core.sql
create unique index slack_channels_fn_idx on slack_channels (function_id)
  where function_id is not null;

-- 00000000000005_command_center_core.sql
create unique index slack_channels_proj_idx on slack_channels (project_id)
  where project_id is not null;

-- 00000000000005_command_center_core.sql
create trigger functions_touch before update on functions
  for each row execute function touch_updated_at();

-- 00000000000006_activity_notifications.sql
create or replace function task_audience(p_task uuid, p_exclude uuid)
returns setof uuid language sql stable as $$
  select distinct id from (
    select assignee_id  as id from tasks where id = p_task
    union
    select created_by   as id from tasks where id = p_task
    union
    select person_id    as id from task_collaborators where task_id = p_task
  ) a
  where id is not null and id is distinct from p_exclude;
$$;

-- 00000000000006_activity_notifications.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql as $$
declare
  slack_id text;
begin
  if p_person is null or p_person = p_actor then
    return;
  end if;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false) then
    select slack_user_id into slack_id from people where id = p_person;
    insert into slack_outbox (kind, target_slack_id, text, task_id)
    values (p_kind::text, slack_id,
            format('%s%s', p_title, case when p_body is not null
                                         then format(', %s', p_body) else '' end),
            case when p_entity = 'task' then p_entity_id else null end);
  end if;
end;
$$;

-- 00000000000006_activity_notifications.sql
create or replace function on_task_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  proj       text;
  link       text;
  who        uuid;
  target     text;
begin
  -- Same fallback: a seed or job has no session, but the row knows its author.
  actor := coalesce(actor, new.created_by, new.assignee_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');
  select p.name into proj from projects p where p.id = new.project_id;
  link := '/tasks/' || new.id;

  -- Created -----------------------------------------------------------------
  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('task', new.id, coalesce(actor, new.created_by), 'created',
            format('%s created this task', actor_name));

    if new.assignee_id is not null then
      insert into activity (entity_type, entity_id, actor_id, verb, field,
                            to_value, summary)
      select 'task', new.id, coalesce(actor, new.created_by), 'assigned',
             'assignee_id', new.assignee_id::text,
             format('%s assigned this to %s', actor_name, p.name)
        from people p where p.id = new.assignee_id;

      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, coalesce(actor, new.created_by));
    end if;
    return new;
  end if;

  -- Reassigned ----------------------------------------------------------------
  if new.assignee_id is distinct from old.assignee_id then
    select name into target from people where id = new.assignee_id;

    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text,
            case when new.assignee_id is null
                 then format('%s unassigned this task', actor_name)
                 else format('%s assigned this to %s', actor_name, target) end);

    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;

  -- Status moved ---------------------------------------------------------------
  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved this to %s', actor_name,
                   replace(initcap(new.status::text), '_', ' ')));

    -- Started: tell the person who asked for it.
    if new.status = 'doing' and old.status <> 'doing' then
      new.started_at := coalesce(new.started_at, now());
      perform notify(new.created_by, 'task_started',
        format('%s started: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;

    -- Review: tell everyone who cares, because this is the gate.
    if new.status = 'review' then
      new.review_requested_at := now();
      for who in select * from task_audience(new.id, actor) loop
        perform notify(who, 'task_review_requested',
          format('Ready for review: %s', new.title), proj, link,
          'task', new.id, actor);
      end loop;
    end if;

    -- Blocked: the reason is the whole point of the notification.
    if new.status = 'blocked' then
      for who in select * from task_audience(new.id, actor) loop
        perform notify(who, 'task_blocked',
          format('Blocked: %s', new.title),
          coalesce(new.blocked_reason, 'No reason given'), link,
          'task', new.id, actor);
      end loop;
    end if;

    if new.status = 'done' and old.status <> 'done' then
      perform notify(new.created_by, 'task_completed',
        format('%s completed: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;

  -- Rescheduled / reprioritized -------------------------------------------------
  if new.due_date is distinct from old.due_date then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'rescheduled', 'due_date',
            old.due_date::text, new.due_date::text,
            format('%s changed the due date', actor_name));
  end if;

  if new.priority is distinct from old.priority then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'reprioritized', 'priority',
            old.priority::text, new.priority::text,
            format('%s set priority to %s', actor_name, new.priority));
  end if;

  if new.function_id is distinct from old.function_id then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    select 'task', new.id, actor, 'moved', 'function_id',
           old.function_id::text, new.function_id::text,
           format('%s moved this to %s', actor_name, f.name)
      from functions f where f.id = new.function_id;
  end if;

  return new;
end;
$$;

-- 00000000000006_activity_notifications.sql
create trigger tasks_event
  before insert or update on tasks
  for each row execute function on_task_event();

-- 00000000000006_activity_notifications.sql
drop trigger if exists tasks_slack on tasks;

-- 00000000000006_activity_notifications.sql
create or replace function on_comment_event()
returns trigger language plpgsql as $$
declare
  author text;
  t      tasks%rowtype;
  who    uuid;
begin
  select name into author from people where id = new.author_id;
  select * into t from tasks where id = new.task_id;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('task', new.task_id, new.author_id, 'commented',
          format('%s commented', coalesce(author, 'Someone')));

  for who in select * from task_audience(new.task_id, new.author_id) loop
    perform notify(who, 'comment_reply',
      format('%s commented on %s', coalesce(author, 'Someone'), t.title),
      left(new.body, 160), '/tasks/' || t.id, 'task', t.id, new.author_id);
  end loop;

  return new;
end;
$$;

-- 00000000000006_activity_notifications.sql
drop trigger if exists comments_slack on comments;

-- 00000000000006_activity_notifications.sql
create trigger comments_event
  after insert on comments
  for each row execute function on_comment_event();

-- 00000000000006_activity_notifications.sql
create or replace function on_project_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
begin
  -- A seed has no session; the project knows its owner.
  actor := coalesce(actor, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('project', new.id, actor, 'created',
            format('%s created this project', actor_name));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('project', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s set status to %s', actor_name, new.status));
  end if;

  if new.health is distinct from old.health then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('project', new.id, actor, 'health_changed', 'health',
            old.health::text, new.health::text,
            format('%s set health to %s', actor_name,
                   replace(new.health::text, '_', ' ')));
  end if;

  return new;
end;
$$;

-- 00000000000006_activity_notifications.sql
create trigger projects_event
  after insert or update on projects
  for each row execute function on_project_event();

-- 00000000000007_content_gtm.sql
alter table content add column pillar text;

-- 00000000000007_content_gtm.sql
alter table content add column caption text;

-- 00000000000007_content_gtm.sql
alter table content add column cta text;

-- 00000000000007_content_gtm.sql
alter table content add column publish_time time;

-- 00000000000007_content_gtm.sql
alter table content add column approved_by uuid references people(id) on delete set null;

-- 00000000000007_content_gtm.sql
alter table content add column approved_at timestamptz;

-- 00000000000007_content_gtm.sql
alter table content add column rejected_reason text;

-- 00000000000007_content_gtm.sql
alter table content add column publish_method text not null default 'manual';

-- 00000000000007_content_gtm.sql
alter table content add column external_post_id text;

-- 00000000000007_content_gtm.sql
alter table content add column external_scheduler_url text;

-- 00000000000007_content_gtm.sql
alter table content add column scheduled_at timestamptz;

-- 00000000000007_content_gtm.sql
alter table content add column published_at timestamptz;

-- 00000000000007_content_gtm.sql
alter type content_status add value if not exists 'recording' after 'drafting';

-- 00000000000007_content_gtm.sql
alter type content_status add value if not exists 'editing' after 'recording';

-- 00000000000007_content_gtm.sql
alter type content_status add value if not exists 'repurpose' after 'published';

-- 00000000000007_content_gtm.sql
alter type content_status add value if not exists 'archived' after 'repurpose';

-- 00000000000007_content_gtm.sql
create table content_pillars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  color       text not null default '#64748B',
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

-- 00000000000007_content_gtm.sql
insert into content_pillars (name, description, sort_order) values
  ('Leadership',           'Operating philosophy, decisions, hard calls.', 0),
  ('Candidate Transition', 'Military-to-industry, career moves.',          1),
  ('Innovation',           'What defense tech is actually building.',      2),
  ('Recruiting',           'How searches really run.',                     3),
  ('Defense',              'The industry and its direction.',              4),
  ('Emerging Threats',     'What the market is reacting to.',              5),
  ('Company',              'ALAC itself, wins, team, behind the scenes.', 6),
  ('Mission Brief',        'The podcast.',                                 7)
on conflict (name) do nothing;

-- 00000000000007_content_gtm.sql
create table content_platforms (
  content_id  uuid not null references content(id) on delete cascade,
  platform    platform not null,
  
  caption     text,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_url text,
  external_post_id text,
  primary key (content_id, platform)
);

-- 00000000000007_content_gtm.sql
create index content_platforms_pub_idx on content_platforms (published_at desc)
  where published_at is not null;

-- 00000000000007_content_gtm.sql
create table content_links (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references content(id) on delete cascade,
  url         text not null,
  label       text,
  
  kind        text not null default 'reference',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 00000000000007_content_gtm.sql
create index content_links_idx on content_links (content_id, sort_order);

-- 00000000000007_content_gtm.sql
create table content_assets (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references content(id) on delete cascade,
  
  kind          text not null default 'file',
  file_name     text not null,
  storage_path  text,
  external_url  text,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint content_assets_has_target check (
    storage_path is not null or external_url is not null)
);

-- 00000000000007_content_gtm.sql
create index content_assets_idx on content_assets (content_id);

-- 00000000000007_content_gtm.sql
create table content_metrics (
  id            uuid primary key default gen_random_uuid(),
  
  
  seq           bigserial not null,
  content_id    uuid not null references content(id) on delete cascade,
  platform      platform not null,
  
  
  metric        text not null,
  value         numeric(14,2) not null,
  
  
  observed_at   timestamptz not null default clock_timestamp(),
  
  source        text not null default 'manual'
);

-- 00000000000007_content_gtm.sql
create index content_metrics_idx on content_metrics (content_id, platform, metric, observed_at desc);

-- 00000000000007_content_gtm.sql
create index content_metrics_recent on content_metrics (observed_at desc);

-- 00000000000007_content_gtm.sql
create or replace view content_metrics_latest as
select distinct on (content_id, platform, metric)
  content_id, platform, metric, value, observed_at, source
from content_metrics


order by content_id, platform, metric, observed_at desc, seq desc;

-- 00000000000007_content_gtm.sql
create type gtm_stage as enum (
  'assigned',
  'researching',
  'contacts_identified',
  'outreach_drafted',
  'founder_review',
  'ready_for_outbound',
  'completed'
);

-- 00000000000007_content_gtm.sql
create table gtm_accounts (
  id              uuid primary key default gen_random_uuid(),
  company         text not null,
  website         text,
  industry        text,
  
  owner_id        uuid references people(id) on delete set null,
  researcher_id   uuid references people(id) on delete set null,
  stage           gtm_stage not null default 'assigned',
  priority        priority not null default 'normal',
  
  signal_source   text,
  signal_note     text,
  notes           text,
  assigned_on     date not null default current_date,
  completed_at    timestamptz,
  
  external_id     text,
  external_url    text,
  created_by      uuid references people(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 00000000000007_content_gtm.sql
create index gtm_stage_idx on gtm_accounts (stage);

-- 00000000000007_content_gtm.sql
create index gtm_researcher_idx on gtm_accounts (researcher_id);

-- 00000000000007_content_gtm.sql
create index gtm_company_trgm on gtm_accounts using gin (company gin_trgm_ops);

-- 00000000000007_content_gtm.sql
create table gtm_contacts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references gtm_accounts(id) on delete cascade,
  name          text not null,
  title         text,
  linkedin_url  text,
  email         text,
  phone         text,
  
  seniority     int not null default 3,
  
  rationale     text,
  notes         text,
  created_by    uuid references people(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- 00000000000007_content_gtm.sql
create index gtm_contacts_idx on gtm_contacts (account_id, seniority);

-- 00000000000007_content_gtm.sql
create type draft_status as enum (
  'draft', 'ready_for_review', 'approved', 'needs_revision', 'ready_for_outbound'
);

-- 00000000000007_content_gtm.sql
create table outreach_drafts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references gtm_accounts(id) on delete cascade,
  contact_id    uuid references gtm_contacts(id) on delete set null,
  subject       text,
  body          text,
  
  personalization text,
  
  signal        text,
  status        draft_status not null default 'draft',
  reviewed_by   uuid references people(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_by    uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 00000000000007_content_gtm.sql
create index outreach_account_idx on outreach_drafts (account_id);

-- 00000000000007_content_gtm.sql
create index outreach_status_idx on outreach_drafts (status);

-- 00000000000007_content_gtm.sql
create or replace function on_gtm_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
begin
  -- mc.uid() is null for a seed or a background job. Fall back to whoever
  -- the row says did it, so the trail names a person rather than "Someone".
  actor := coalesce(actor, new.created_by, new.researcher_id, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('gtm_account', new.id, actor, 'created',
            format('%s added %s', actor_name, new.company));

    if new.researcher_id is not null then
      perform notify(new.researcher_id, 'task_assigned',
        format('Account assigned: %s', new.company),
        new.signal_note, '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'stage_changed', 'stage',
            old.stage::text, new.stage::text,
            format('%s moved %s to %s', actor_name, new.company,
                   replace(new.stage::text, '_', ' ')));

    -- Founder review is the gate: tell the owner it needs them.
    if new.stage = 'founder_review' then
      perform notify(new.owner_id, 'gtm_review',
        format('%s is ready for your review', new.company),
        'Outreach drafted', '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'ready_for_outbound' then
      perform notify(new.researcher_id, 'gtm_review',
        format('%s approved for outbound', new.company),
        null, '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000007_content_gtm.sql
create trigger gtm_event
  before insert or update on gtm_accounts
  for each row execute function on_gtm_event();

-- 00000000000007_content_gtm.sql
create trigger gtm_touch before update on gtm_accounts
  for each row execute function touch_updated_at();

-- 00000000000007_content_gtm.sql
create trigger outreach_touch before update on outreach_drafts
  for each row execute function touch_updated_at();

-- 00000000000008_retire_recruiterflow.sql
insert into gtm_accounts (company, stage, priority, signal_source, signal_note,
                          notes, researcher_id, owner_id, external_id, external_url,
                          assigned_on)
select
  coalesce(s.company, 'Unknown'),
  case s.urgency
    when 'action_today'  then 'researching'
    when 'due_this_week' then 'assigned'
    else 'assigned'
  end::gtm_stage,
  case s.urgency
    when 'action_today'  then 'high'
    when 'due_this_week' then 'normal'
    else 'low'
  end::priority,
  'bd_signals',
  s.signal_note,
  
  
  nullif(concat_ws(E'\n',
    nullif('Contact: ' || s.contact_name, 'Contact: '),
    nullif('Stage was: ' || s.stage, 'Stage was: '),
    nullif('Next: ' || s.next_action, 'Next: ')), ''),
  s.owner_id,
  s.owner_id,
  s.external_id,
  s.external_url,
  current_date
from bd_signals s
where not exists (
  select 1 from gtm_accounts g where g.external_id = s.external_id
);

-- 00000000000008_retire_recruiterflow.sql
drop table if exists bd_signals;

-- 00000000000008_retire_recruiterflow.sql
delete from integrations where key = 'recruiterflow';

-- 00000000000008_retire_recruiterflow.sql
insert into integrations (key, label) values
  ('sourcewhale',  'SourceWhale'),
  ('metricool',    'Metricool'),
  ('intelligence', 'Intelligence Hub')
on conflict (key) do nothing;

-- 00000000000008_retire_recruiterflow.sql
comment on column searches.project_id is
  'Delivery tracking for a recruiting project. External records live in the ATS.';

-- 00000000000008_retire_recruiterflow.sql
create unique index gtm_accounts_external_idx on gtm_accounts (external_id)
  where external_id is not null;

-- 00000000000009_invitations.sql
create table invitations (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  role          user_role not null default 'member',
  function_id   uuid references functions(id) on delete set null,
  job_title     text,
  invited_by    uuid references people(id) on delete set null,
  invited_at    timestamptz not null default now(),
  
  accepted_at   timestamptz,
  accepted_by   uuid references people(id) on delete set null,
  
  expires_at    timestamptz not null default (now() + interval '14 days'),
  revoked_at    timestamptz
);

-- 00000000000009_invitations.sql
create unique index invitations_pending_idx on invitations (lower(email))
  where accepted_at is null and revoked_at is null;

-- 00000000000009_invitations.sql
create index invitations_email_idx on invitations (lower(email));

-- 00000000000009_invitations.sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = mc, public as $$
declare
  inv invitations%rowtype;
begin
  select * into inv
    from invitations
   where lower(email) = lower(new.email)
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   order by invited_at desc
   limit 1;

  insert into mc.people (id, email, name, role, state, function_id, job_title)
  values (
    new.id,
    new.email,
    coalesce(
      inv.name,
      nullif(new.full_name, ''),
      split_part(new.email, '@', 1)),
    -- No invitation means no elevated role, whatever the signup metadata says.
    coalesce(inv.role, 'member'::user_role),
    'active',
    inv.function_id,
    inv.job_title
  )
  on conflict (id) do nothing;

  if inv.id is not null then
    update invitations
       set accepted_at = now(), accepted_by = new.id
     where id = inv.id;
  end if;

  return new;
end;
$$;

-- 00000000000010_review_audience.sql
create or replace function task_audience(
  p_task uuid, p_exclude uuid, p_assignee uuid default null
) returns setof uuid language sql stable as $$
  select distinct id from (
    select p_assignee   as id
    union
    select assignee_id  as id from tasks where id = p_task
    union
    select created_by   as id from tasks where id = p_task
    union
    select person_id    as id from task_collaborators where task_id = p_task
  ) a
  where id is not null and id is distinct from p_exclude;
$$;

-- 00000000000010_review_audience.sql
create or replace function on_task_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  proj       text;
  link       text;
  who        uuid;
  target     text;
begin
  -- Same fallback: a seed or job has no session, but the row knows its author.
  actor := coalesce(actor, new.created_by, new.assignee_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');
  select p.name into proj from projects p where p.id = new.project_id;
  link := '/tasks/' || new.id;

  -- Created -----------------------------------------------------------------
  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('task', new.id, coalesce(actor, new.created_by), 'created',
            format('%s created this task', actor_name));

    if new.assignee_id is not null then
      insert into activity (entity_type, entity_id, actor_id, verb, field,
                            to_value, summary)
      select 'task', new.id, coalesce(actor, new.created_by), 'assigned',
             'assignee_id', new.assignee_id::text,
             format('%s assigned this to %s', actor_name, p.name)
        from people p where p.id = new.assignee_id;

      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, coalesce(actor, new.created_by));
    end if;
    return new;
  end if;

  -- Status moved ---------------------------------------------------------------
  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved this to %s', actor_name,
                   replace(initcap(new.status::text), '_', ' ')));

    -- Started: tell the person who asked for it.
    if new.status = 'doing' and old.status <> 'doing' then
      new.started_at := coalesce(new.started_at, now());
      perform notify(new.created_by, 'task_started',
        format('%s started: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;

    -- Review: tell everyone who cares, because this is the gate.
    if new.status = 'review' then
      new.review_requested_at := now();
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_review_requested',
          format('Ready for review: %s', new.title), proj, link,
          'task', new.id, actor);
      end loop;
    end if;

    -- Blocked: the reason is the whole point of the notification.
    if new.status = 'blocked' then
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_blocked',
          format('Blocked: %s', new.title),
          coalesce(new.blocked_reason, 'No reason given'), link,
          'task', new.id, actor);
      end loop;
    end if;

    if new.status = 'done' and old.status <> 'done' then
      perform notify(new.created_by, 'task_completed',
        format('%s completed: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;
  -- Reassigned ----------------------------------------------------------------
  if new.assignee_id is distinct from old.assignee_id then
    select name into target from people where id = new.assignee_id;

    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text,
            case when new.assignee_id is null
                 then format('%s unassigned this task', actor_name)
                 else format('%s assigned this to %s', actor_name, target) end);

    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;


  -- Rescheduled / reprioritized -------------------------------------------------
  if new.due_date is distinct from old.due_date then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'rescheduled', 'due_date',
            old.due_date::text, new.due_date::text,
            format('%s changed the due date', actor_name));
  end if;

  if new.priority is distinct from old.priority then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'reprioritized', 'priority',
            old.priority::text, new.priority::text,
            format('%s set priority to %s', actor_name, new.priority));
  end if;

  if new.function_id is distinct from old.function_id then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    select 'task', new.id, actor, 'moved', 'function_id',
           old.function_id::text, new.function_id::text,
           format('%s moved this to %s', actor_name, f.name)
      from functions f where f.id = new.function_id;
  end if;

  return new;
end;
$$;

-- 00000000000010_review_audience.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Already told this person about this task in this statement.
  if exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false) then
    select slack_user_id into slack_id from people where id = p_person;
    if slack_id is not null then
      insert into slack_outbox (kind, target_slack_id, text, task_id)
      values (p_kind::text, slack_id, p_title,
              case when p_entity = 'task' then p_entity_id else null end);
    end if;
  end if;
end;
$$;

-- 00000000000011_three_functions.sql
update functions
   set key = 'gtm', name = 'GTM', color = '#0F766E', sort_order = 1,
       description = 'Target accounts, research, and outbound execution.'
 where key = 's2';

-- 00000000000011_three_functions.sql
update functions
   set name = 'Marketing / Brand', sort_order = 0,
       description = 'Brand, content, and demand generation.'
 where key = 'marketing';

-- 00000000000011_three_functions.sql
update functions
   set key = 'operations', name = 'Operations', sort_order = 2,
       description = 'Delivery, systems, admin, and everything that keeps the company running.'
 where key = 's3';

-- 00000000000011_three_functions.sql
update tasks
   set function_id = (select id from functions where key = 'operations')
 where function_id in (select id from functions where key in ('s1', 's4', 's6'));

-- 00000000000011_three_functions.sql
update people
   set function_id = (select id from functions where key = 'operations')
 where function_id in (select id from functions where key in ('s1', 's4', 's6'));

-- 00000000000011_three_functions.sql
update functions set is_active = false
 where key in ('s1', 's4', 's6');

-- 00000000000011_three_functions.sql
update tasks
   set function_id = (select id from functions where key = 'operations')
 where function_id is null;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts add column stage_txt text;

-- 00000000000012_gtm_workflow.sql
update gtm_accounts set stage_txt = stage::text;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts alter column stage drop default;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts alter column stage type text using stage::text;

-- 00000000000012_gtm_workflow.sql
drop type gtm_stage;

-- 00000000000012_gtm_workflow.sql
create type gtm_stage as enum (
  'target',           
  'researching',      
  'contacts_found',   
  'draft_written',    
  'review',           
  'complete'          
);

-- 00000000000012_gtm_workflow.sql
update gtm_accounts set stage_txt = case stage_txt
  when 'assigned'            then 'target'
  when 'contacts_identified' then 'contacts_found'
  when 'outreach_drafted'    then 'draft_written'
  when 'founder_review'      then 'review'
  when 'ready_for_outbound'  then 'complete'
  when 'completed'           then 'complete'
  else stage_txt end;

-- 00000000000012_gtm_workflow.sql
update gtm_accounts set stage = stage_txt;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts alter column stage type gtm_stage using stage::gtm_stage;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts alter column stage set default 'target';

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts alter column stage set not null;

-- 00000000000012_gtm_workflow.sql
alter table gtm_accounts drop column stage_txt;

-- 00000000000012_gtm_workflow.sql
alter type notify_kind add value if not exists 'gtm_target_added';

-- 00000000000012_gtm_workflow.sql
alter type notify_kind add value if not exists 'gtm_started';

-- 00000000000012_gtm_workflow.sql
create or replace function on_gtm_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
begin
  actor := coalesce(actor, new.created_by, new.researcher_id, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('gtm_account', new.id, actor, 'created',
            format('%s added %s as a target', actor_name, new.company));

    -- A new target is work waiting for whoever researches it.
    if new.researcher_id is not null then
      perform notify(new.researcher_id, 'gtm_target_added',
        format('New target: %s', new.company),
        coalesce(new.signal_note, 'Added to the GTM board'),
        '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'stage_changed', 'stage',
            old.stage::text, new.stage::text,
            format('%s moved %s to %s', actor_name, new.company,
                   replace(new.stage::text, '_', ' ')));

    -- Picked up: the owner wants to know work has started.
    if new.stage = 'researching' then
      perform notify(new.owner_id, 'gtm_started',
        format('%s started researching %s', actor_name, new.company),
        coalesce(new.signal_note, null),
        '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    -- Review is the gate: the owner is being asked to act.
    if new.stage = 'review' then
      perform notify(new.owner_id, 'gtm_review',
        format('%s GTM research is ready for review', new.company),
        'Contacts identified and outreach drafted.',
        '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'complete' then
      new.completed_at := coalesce(new.completed_at, now());
      -- Approval closes the loop for whoever did the work.
      perform notify(new.researcher_id, 'gtm_review',
        format('%s approved for outbound', new.company),
        null, '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000013_content_workflow.sql
alter table content disable trigger user;

-- 00000000000013_content_workflow.sql
drop index if exists content_publish_idx;

-- 00000000000013_content_workflow.sql
drop index if exists content_status_idx;

-- 00000000000013_content_workflow.sql
alter table content add column status_txt text;

-- 00000000000013_content_workflow.sql
update content set status_txt = status::text;

-- 00000000000013_content_workflow.sql
alter table content alter column status drop default;

-- 00000000000013_content_workflow.sql
alter table content alter column status type text using status::text;

-- 00000000000013_content_workflow.sql
drop type content_status;

-- 00000000000013_content_workflow.sql
create type content_status as enum (
  'idea',
  'in_progress',
  'review',
  'ready',
  'published',
  'blocked'
);

-- 00000000000013_content_workflow.sql
update content set status_txt = case status_txt
  when 'drafting'  then 'in_progress'
  when 'recording' then 'in_progress'
  when 'editing'   then 'in_progress'
  when 'approved'  then 'ready'
  when 'scheduled' then 'ready'
  when 'repurpose' then 'published'
  when 'archived'  then 'published'
  else status_txt end;

-- 00000000000013_content_workflow.sql
update content set status = status_txt;

-- 00000000000013_content_workflow.sql
alter table content alter column status type content_status using status::content_status;

-- 00000000000013_content_workflow.sql
alter table content alter column status set default 'idea';

-- 00000000000013_content_workflow.sql
alter table content alter column status set not null;

-- 00000000000013_content_workflow.sql
alter table content drop column status_txt;

-- 00000000000013_content_workflow.sql
create index content_status_idx on content (status);

-- 00000000000013_content_workflow.sql
create index content_publish_idx on content (publish_date) where status <> 'published';

-- 00000000000013_content_workflow.sql
alter table content enable trigger user;

-- 00000000000013_content_workflow.sql
alter type notify_kind add value if not exists 'content_assigned';

-- 00000000000013_content_workflow.sql
alter type notify_kind add value if not exists 'content_blocked';

-- 00000000000014_content_notifications.sql
create or replace function on_content_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  lead_id    uuid;
begin
  actor := coalesce(actor, new.created_by, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  -- Whoever leads Marketing/Brand is the person who runs this board.
  select f.lead_id into lead_id from functions f
   where f.key = 'marketing' and f.is_active;

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('content', new.id, actor, 'created',
            format('%s added %s', actor_name, new.title));

    -- New content is work waiting for whoever owns it.
    if new.owner_id is not null then
      perform notify(new.owner_id, 'content_assigned',
        format('New content: %s', new.title),
        coalesce(new.hook, null), '/content', 'content', new.id, actor);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('content', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved %s to %s', actor_name, new.title,
                   replace(new.status::text, '_', ' ')));

    -- Review is the approval gate: it goes to the founder, not the owner.
    if new.status = 'review' then
      perform notify(
        content_reviewer(),
        'content_review',
        format('%s is ready for your review', new.title),
        coalesce(new.hook, 'Ready for approval'),
        '/content', 'content', new.id, actor);
    end if;

    -- Approved and sent back: the marketing lead needs to know it can ship.
    if new.status = 'ready' then
      perform notify(coalesce(new.owner_id, lead_id), 'content_assigned',
        format('%s is approved and ready to publish', new.title),
        null, '/content', 'content', new.id, actor);
    end if;

    -- Blocked: the reason is the whole point of the message.
    if new.status = 'blocked' then
      perform notify(coalesce(new.owner_id, lead_id), 'content_blocked',
        format('Blocked: %s', new.title),
        coalesce(new.notes, 'No reason given'),
        '/content', 'content', new.id, actor);
    end if;

    -- Published: stamp the moment, then record one publication per platform.
    -- Both are idempotent, so dragging in and out of Published cannot create
    -- duplicate history or move the original timestamp.
    if new.status = 'published' then
      perform notify(new.created_by, 'content_published',
        format('%s published: %s', actor_name, new.title),
        null, '/content', 'content', new.id, actor);
    end if;
  end if;

  -- Handed to someone new.
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    perform notify(new.owner_id, 'content_assigned',
      format('%s assigned you: %s', actor_name, new.title),
      null, '/content', 'content', new.id, actor);
  end if;

  return new;
end;
$$;

-- 00000000000014_content_notifications.sql
drop trigger if exists content_event on content;

-- 00000000000014_content_notifications.sql
create trigger content_event
  after insert or update on content
  for each row execute function on_content_event();

-- 00000000000015_publications.sql
alter table content add column if not exists published_at timestamptz;

-- 00000000000015_publications.sql
alter table content_platforms
  add column if not exists published_by uuid references people(id) on delete set null;

-- 00000000000015_publications.sql
create index if not exists content_published_idx on content (published_at desc)
  where published_at is not null;

-- 00000000000015_publications.sql
create or replace function record_publication(
  p_content uuid, p_when timestamptz, p_actor uuid
) returns void language plpgsql as $$
begin
  -- A piece with no explicit platform rows still has its primary platform.
  insert into content_platforms (content_id, platform)
  select p_content, c.platform from content c
   where c.id = p_content
     and not exists (select 1 from content_platforms cp where cp.content_id = p_content)
  on conflict do nothing;

  update content_platforms
     set published_at = coalesce(published_at, p_when),
         published_by = coalesce(published_by, p_actor)
   where content_id = p_content;
end;
$$;

-- 00000000000015_publications.sql
create or replace function stamp_publication()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    -- Only on the first publish. A correction made by hand survives a later
    -- drag back and forth.
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

-- 00000000000015_publications.sql
drop trigger if exists content_stamp_publication on content;

-- 00000000000015_publications.sql
create trigger content_stamp_publication
  before update on content
  for each row execute function stamp_publication();

-- 00000000000015_publications.sql
create or replace function write_publication()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform record_publication(new.id, coalesce(new.published_at, now()),
                               coalesce(mc.uid(), new.owner_id, new.created_by));
  end if;
  return null;
end;
$$;

-- 00000000000015_publications.sql
drop trigger if exists content_write_publication on content;

-- 00000000000015_publications.sql
create trigger content_write_publication
  after update on content
  for each row execute function write_publication();

-- 00000000000015_publications.sql
create or replace function stamp_publication_insert()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, new.publish_date::timestamptz, now());
  end if;
  return new;
end;
$$;

-- 00000000000015_publications.sql
drop trigger if exists content_stamp_insert on content;

-- 00000000000015_publications.sql
create trigger content_stamp_insert
  before insert on content
  for each row execute function stamp_publication_insert();

-- 00000000000015_publications.sql
create or replace function write_publication_insert()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    perform record_publication(new.id, coalesce(new.published_at, now()),
                               coalesce(new.owner_id, new.created_by));
  end if;
  return null;
end;
$$;

-- 00000000000015_publications.sql
drop trigger if exists content_write_insert on content;

-- 00000000000015_publications.sql
create trigger content_write_insert
  after insert on content
  for each row execute function write_publication_insert();

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts add column stage_txt text;

-- 00000000000016_gtm_account_centric.sql
update gtm_accounts set stage_txt = stage::text;

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts alter column stage drop default;

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts alter column stage type text using stage::text;

-- 00000000000016_gtm_account_centric.sql
drop type gtm_stage;

-- 00000000000016_gtm_account_centric.sql
create type gtm_stage as enum (
  'target',           
  'researching',      
  'contacts_found',   
  'outreach_active',  
  'engaged',          
  'complete'          
);

-- 00000000000016_gtm_account_centric.sql
update gtm_accounts set stage_txt = case stage_txt
  when 'draft_written' then 'outreach_active'
  when 'review'        then 'outreach_active'
  else stage_txt end;

-- 00000000000016_gtm_account_centric.sql
update gtm_accounts set stage = stage_txt;

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts alter column stage type gtm_stage using stage::gtm_stage;

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts alter column stage set default 'target';

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts alter column stage set not null;

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts drop column stage_txt;

-- 00000000000016_gtm_account_centric.sql
create type gtm_outcome as enum (
  'meeting',        
  'nurture',        
  'not_interested', 
  'no_response',    
  'not_a_fit'       
);

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts
  add column outcome        gtm_outcome,
  add column outcome_note   text,
  
  add column next_action    text,
  add column next_action_on date,
  
  add column current_contact_id uuid references gtm_contacts(id) on delete set null,
  
  add column nurture_until date;

-- 00000000000016_gtm_account_centric.sql
create type contact_status as enum (
  'planned', 'drafting', 'ready', 'contacted',
  'responded', 'no_response', 'not_interested'
);

-- 00000000000016_gtm_account_centric.sql
alter table gtm_contacts
  add column status        contact_status not null default 'planned',
  
  add column attempt_order int not null default 0,
  add column contacted_on  date,
  add column responded_on  date,
  add column outcome_note  text;

-- 00000000000016_gtm_account_centric.sql
create index gtm_contacts_order_idx on gtm_contacts (account_id, attempt_order);

-- 00000000000016_gtm_account_centric.sql
alter table gtm_accounts
  add constraint gtm_complete_needs_outcome
  check (stage <> 'complete' or outcome is not null);

-- 00000000000016_gtm_account_centric.sql
create or replace function on_gtm_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  outcome_label text;
begin
  actor := coalesce(actor, new.created_by, new.researcher_id, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('gtm_account', new.id, actor, 'created',
            format('%s added %s as a target', actor_name, new.company));

    if new.researcher_id is not null then
      perform notify(new.researcher_id, 'gtm_target_added',
        format('New GTM target: %s', new.company),
        coalesce(new.signal_note, 'Added to the GTM board'),
        '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'stage_changed', 'stage',
            old.stage::text, new.stage::text,
            format('%s moved %s to %s', actor_name, new.company,
                   replace(new.stage::text, '_', ' ')));

    if new.stage = 'researching' then
      perform notify(new.owner_id, 'gtm_started',
        format('%s started researching %s', actor_name, new.company),
        new.signal_note, '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    -- Somebody responded. This is the event the whole board exists to produce.
    if new.stage = 'engaged' then
      perform notify(new.owner_id, 'gtm_review',
        format('%s responded', new.company),
        'Someone at the account engaged, worth a look.',
        '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'complete' then
      new.completed_at := coalesce(new.completed_at, now());
      outcome_label := replace(coalesce(new.outcome::text, 'closed'), '_', ' ');
      perform notify(new.owner_id, 'gtm_review',
        format('%s GTM campaign complete, %s', new.company, outcome_label),
        new.outcome_note, '/gtm/' || new.id, 'gtm_account', new.id, actor);
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000016_gtm_account_centric.sql
create or replace function stamp_gtm_complete()
returns trigger language plpgsql as $$
begin
  if new.stage = 'complete' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

-- 00000000000016_gtm_account_centric.sql
drop trigger if exists gtm_stamp_complete on gtm_accounts;

-- 00000000000016_gtm_account_centric.sql
create trigger gtm_stamp_complete
  before insert on gtm_accounts
  for each row execute function stamp_gtm_complete();

-- 00000000000017_slack_links.sql
alter table slack_outbox add column if not exists url text;

-- 00000000000017_slack_links.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Already told this person about this task in this statement.
  if exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false) then
    select slack_user_id into slack_id from people where id = p_person;
    if slack_id is not null then
      insert into slack_outbox (kind, target_slack_id, text, url, task_id)
      values (p_kind::text, slack_id, p_title, p_url,
              case when p_entity = 'task' then p_entity_id else null end);
    end if;
  end if;
end;
$$;

-- 00000000000019_task_notify_after.sql
create or replace function on_task_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'doing' and old.status <> 'doing' then
      new.started_at := coalesce(new.started_at, now());
    end if;
    if new.status = 'review' then
      new.review_requested_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- 00000000000019_task_notify_after.sql
create or replace function on_task_notify()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  proj       text;
  link       text;
  who        uuid;
  target     text;
begin
  -- Same fallback: a seed or job has no session, but the row knows its author.
  actor := coalesce(actor, new.created_by, new.assignee_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');
  select p.name into proj from projects p where p.id = new.project_id;
  link := '/tasks/' || new.id;

  -- Created -----------------------------------------------------------------
  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('task', new.id, coalesce(actor, new.created_by), 'created',
            format('%s created this task', actor_name));

    if new.assignee_id is not null then
      insert into activity (entity_type, entity_id, actor_id, verb, field,
                            to_value, summary)
      select 'task', new.id, coalesce(actor, new.created_by), 'assigned',
             'assignee_id', new.assignee_id::text,
             format('%s assigned this to %s', actor_name, p.name)
        from people p where p.id = new.assignee_id;

      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, coalesce(actor, new.created_by));
    end if;
    return new;
  end if;

  -- Status moved ---------------------------------------------------------------
  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved this to %s', actor_name,
                   replace(initcap(new.status::text), '_', ' ')));

    -- Started: tell the person who asked for it.
    if new.status = 'doing' and old.status <> 'doing' then
      perform notify(new.created_by, 'task_started',
        format('%s started: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;

    -- Review: tell everyone who cares, because this is the gate.
    if new.status = 'review' then
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_review_requested',
          format('Ready for review: %s', new.title), proj, link,
          'task', new.id, actor);
      end loop;
    end if;

    -- Blocked: the reason is the whole point of the notification.
    if new.status = 'blocked' then
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_blocked',
          format('Blocked: %s', new.title),
          coalesce(new.blocked_reason, 'No reason given'), link,
          'task', new.id, actor);
      end loop;
    end if;

    if new.status = 'done' and old.status <> 'done' then
      perform notify(new.created_by, 'task_completed',
        format('%s completed: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;
  -- Reassigned ----------------------------------------------------------------
  if new.assignee_id is distinct from old.assignee_id then
    select name into target from people where id = new.assignee_id;

    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text,
            case when new.assignee_id is null
                 then format('%s unassigned this task', actor_name)
                 else format('%s assigned this to %s', actor_name, target) end);

    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;


  -- Rescheduled / reprioritized -------------------------------------------------
  if new.due_date is distinct from old.due_date then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'rescheduled', 'due_date',
            old.due_date::text, new.due_date::text,
            format('%s changed the due date', actor_name));
  end if;

  if new.priority is distinct from old.priority then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'reprioritized', 'priority',
            old.priority::text, new.priority::text,
            format('%s set priority to %s', actor_name, new.priority));
  end if;

  if new.function_id is distinct from old.function_id then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    select 'task', new.id, actor, 'moved', 'function_id',
           old.function_id::text, new.function_id::text,
           format('%s moved this to %s', actor_name, f.name)
      from functions f where f.id = new.function_id;
  end if;

  return null;
end;
$$;

-- 00000000000019_task_notify_after.sql
drop trigger if exists tasks_event on tasks;

-- 00000000000019_task_notify_after.sql
create trigger tasks_stamp
  before update on tasks
  for each row execute function on_task_stamp();

-- 00000000000019_task_notify_after.sql
create trigger tasks_notify
  after insert or update on tasks
  for each row execute function on_task_notify();

-- 00000000000020_real_integrations.sql
delete from integrations where key in ('sourcewhale', 'metricool', 'intelligence');

-- 00000000000020_real_integrations.sql
update integrations set is_connected = true where key = 'slack';

-- 00000000000020_real_integrations.sql
update integrations set detail = jsonb_build_object('how', d.how)
  from (values
    ('slack',   'Direct messages, sent automatically every two minutes.'),
    ('drive',   'Files indexed from the ALAC Drive; run npm run sync to refresh.'),
    ('outlook', 'Meetings alongside task due dates; run npm run sync to refresh.')
  ) as d(key, how)
 where integrations.key = d.key;

-- 00000000000021_slack_receipts.sql
alter table slack_outbox
  add column if not exists slack_channel_id text,
  add column if not exists slack_ts         text;

-- 00000000000021_slack_receipts.sql
comment on column slack_outbox.slack_channel_id is
  'Channel Slack actually delivered to, from chat.postMessage. For a DM this is the bot-to-person conversation, not the person''s id.';

-- 00000000000022_notification_links.sql
create or replace function on_task_notify()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  proj       text;
  link       text;
  who        uuid;
  target     text;
begin
  actor := coalesce(actor, new.created_by, new.assignee_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');
  select p.name into proj from projects p where p.id = new.project_id;
  -- The board, with this task's drawer open.
  link := '/board?task=' || new.id;

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('task', new.id, coalesce(actor, new.created_by), 'created',
            format('%s created this task', actor_name));

    if new.assignee_id is not null then
      insert into activity (entity_type, entity_id, actor_id, verb, field,
                            to_value, summary)
      select 'task', new.id, coalesce(actor, new.created_by), 'assigned',
             'assignee_id', new.assignee_id::text,
             format('%s assigned this to %s', actor_name, p.name)
        from people p where p.id = new.assignee_id;

      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, coalesce(actor, new.created_by));
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved this to %s', actor_name,
                   replace(initcap(new.status::text), '_', ' ')));

    if new.status = 'review' then
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_review_requested',
          format('Ready for review: %s', new.title), proj, link,
          'task', new.id, actor);
      end loop;
    end if;

    if new.status = 'blocked' then
      for who in select * from task_audience(new.id, actor, new.assignee_id) loop
        perform notify(who, 'task_blocked',
          format('Blocked: %s', new.title),
          coalesce(new.blocked_reason, 'No reason given'), link,
          'task', new.id, actor);
      end loop;
    end if;

    if new.status = 'doing' and old.status <> 'doing' then
      perform notify(new.created_by, 'task_started',
        format('%s started: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;

    if new.status = 'done' and old.status <> 'done' then
      perform notify(new.created_by, 'task_completed',
        format('%s completed: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select name into target from people where id = new.assignee_id;
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text,
            case when new.assignee_id is null
                 then format('%s unassigned this task', actor_name)
                 else format('%s assigned this to %s', actor_name, target) end);

    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned',
        format('%s assigned you: %s', actor_name, new.title),
        proj, link, 'task', new.id, actor);
    end if;
  end if;

  if new.priority is distinct from old.priority then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('task', new.id, actor, 'reprioritized', 'priority',
            old.priority::text, new.priority::text,
            format('%s set priority to %s', actor_name, new.priority));
  end if;

  return null;
end;
$$;

-- 00000000000022_notification_links.sql
update notifications set url = '/board?task=' || entity_id
 where entity_type = 'task' and url like '/tasks/%';

-- 00000000000022_notification_links.sql
create or replace function on_comment_event()
returns trigger language plpgsql as $$
declare
  author text;
  t      tasks%rowtype;
  who    uuid;
begin
  select name into author from people where id = new.author_id;
  select * into t from tasks where id = new.task_id;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('task', new.task_id, new.author_id, 'commented',
          format('%s commented', coalesce(author, 'Someone')));

  for who in select * from task_audience(new.task_id, new.author_id) loop
    perform notify(who, 'comment_reply',
      format('%s commented on %s', coalesce(author, 'Someone'), t.title),
      left(new.body, 160), '/board?task=' || t.id, 'task', t.id, new.author_id);
  end loop;

  return new;
end;
$$;

-- 00000000000023_dedup_slack.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Already told this person about this entity in this statement, on either
  -- channel. statement_timestamp() is fixed for the statement, so two
  -- branches of the same trigger see the same window.
  if exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  select slack_user_id into slack_id from people where id = p_person;

  if slack_id is not null and exists (
    select 1 from slack_outbox
     where target_slack_id = slack_id
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false)
     and slack_id is not null then
    insert into slack_outbox (kind, target_slack_id, text, url, task_id)
    values (p_kind::text, slack_id, p_title, p_url,
            case when p_entity = 'task' then p_entity_id else null end);
  end if;
end;
$$;

-- 00000000000024_function_colors.sql
update functions set color = '#6B8AFF' where key = 'gtm';

-- 00000000000024_function_colors.sql
update functions set color = '#F59E0B' where key = 'marketing';

-- 00000000000024_function_colors.sql
update functions set color = '#2DD4BF' where key = 'operations';

-- 00000000000025_lifecycle.sql
alter table tasks
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_by   uuid references people(id) on delete set null,
  add column if not exists completed_by  uuid references people(id) on delete set null,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references people(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists reopened_at   timestamptz,
  add column if not exists reopened_by   uuid references people(id) on delete set null,
  add column if not exists reopen_count  int not null default 0;

-- 00000000000025_lifecycle.sql
alter table content
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_by   uuid references people(id) on delete set null,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references people(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists reopened_at   timestamptz,
  add column if not exists reopened_by   uuid references people(id) on delete set null,
  add column if not exists reopen_count  int not null default 0;

-- 00000000000025_lifecycle.sql
alter table projects
  add column if not exists archived_by   uuid references people(id) on delete set null,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references people(id) on delete set null,
  add column if not exists delete_reason text;

-- 00000000000025_lifecycle.sql
create index if not exists tasks_active_idx on tasks (status)
  where archived_at is null and deleted_at is null;

-- 00000000000025_lifecycle.sql
create index if not exists tasks_archive_idx on tasks (archived_at desc)
  where archived_at is not null;

-- 00000000000025_lifecycle.sql
create index if not exists content_active_idx on content (status)
  where archived_at is null and deleted_at is null;

-- 00000000000025_lifecycle.sql
create or replace function stamp_task_lifecycle()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.done_at      := coalesce(new.done_at, now());
    new.completed_by := coalesce(new.completed_by, mc.uid(), new.assignee_id);
    new.archived_at  := coalesce(new.archived_at, now());
    new.archived_by  := coalesce(new.archived_by, mc.uid(), new.assignee_id);
  end if;

  -- Moving off 'done' is a reopen: back to the board, counted as not complete.
  if old.status = 'done' and new.status is distinct from 'done' then
    new.archived_at  := null;
    new.archived_by  := null;
    new.done_at      := null;
    new.reopened_at  := now();
    new.reopened_by  := coalesce(mc.uid(), new.assignee_id);
    new.reopen_count := old.reopen_count + 1;
  end if;

  return new;
end;
$$;

-- 00000000000025_lifecycle.sql
drop trigger if exists tasks_lifecycle on tasks;

-- 00000000000025_lifecycle.sql
create trigger tasks_lifecycle
  before update on tasks
  for each row execute function stamp_task_lifecycle();

-- 00000000000025_lifecycle.sql
create or replace function stamp_content_lifecycle()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := coalesce(new.archived_by, mc.uid(), new.owner_id);
  end if;

  if old.status = 'published' and new.status is distinct from 'published' then
    new.archived_at  := null;
    new.archived_by  := null;
    new.reopened_at  := now();
    new.reopened_by  := coalesce(mc.uid(), new.owner_id);
    new.reopen_count := old.reopen_count + 1;
  end if;

  return new;
end;
$$;

-- 00000000000025_lifecycle.sql
drop trigger if exists content_lifecycle on content;

-- 00000000000025_lifecycle.sql
create trigger content_lifecycle
  before update on content
  for each row execute function stamp_content_lifecycle();

-- 00000000000026_lifecycle_events.sql
create or replace function soft_delete_task(p_task uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  actor uuid := mc.uid();
  t     record;
begin
  select * into t from tasks where id = p_task;
  if t.id is null then return; end if;

  update tasks
     set deleted_at    = now(),
         deleted_by    = actor,
         delete_reason = p_reason,
         -- A deleted record is not archived: archive means finished work.
         archived_at   = null
   where id = p_task;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('task', p_task, actor, 'deleted',
          coalesce(p_reason, 'Removed. Not counted as completed work.'));
end;
$$;

-- 00000000000026_lifecycle_events.sql
create or replace function soft_delete_content(p_content uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  actor uuid := mc.uid();
begin
  update content
     set deleted_at = now(), deleted_by = actor,
         delete_reason = p_reason, archived_at = null
   where id = p_content;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('content', p_content, actor, 'deleted',
          coalesce(p_reason, 'Removed. Not counted as published work.'));
end;
$$;

-- 00000000000026_lifecycle_events.sql
create or replace function reopen_task(p_task uuid, p_status task_status default 'todo')
returns void language plpgsql security definer as $$
declare
  actor uuid := mc.uid();
begin
  update tasks set status = p_status where id = p_task and archived_at is not null;

  insert into activity (entity_type, entity_id, actor_id, verb, to_value, summary)
  values ('task', p_task, actor, 'reopened', p_status::text,
          'Reopened from the archive.');
end;
$$;

-- 00000000000026_lifecycle_events.sql
create or replace view completed_work as
  select 'task'::text as kind, t.id, t.title, t.done_at as completed_at,
         t.completed_by, t.function_id, t.project_id, t.reopen_count
    from tasks t
   where t.status = 'done'
     and t.archived_at is not null
     and t.deleted_at is null
  union all
  select 'content', c.id, c.title, c.published_at, c.owner_id, null, null, c.reopen_count
    from content c
   where c.status = 'published'
     and c.archived_at is not null
     and c.deleted_at is null;

-- 00000000000026_lifecycle_events.sql
create or replace view archive_items as
  select 'task'::text as kind, t.id, t.title,
         t.archived_at, t.archived_by, t.status::text as final_status,
         t.function_id, t.project_id, t.assignee_id as owner_id,
         t.created_at, t.reopen_count, t.deleted_at
    from tasks t where t.archived_at is not null and t.deleted_at is null
  union all
  select 'content', c.id, c.title,
         c.archived_at, c.archived_by, c.status::text,
         null, null, c.owner_id, c.created_at, c.reopen_count, c.deleted_at
    from content c where c.archived_at is not null and c.deleted_at is null;

-- 00000000000027_duplicates.sql
create or replace function norm_name(p text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p, '')), '[^a-z0-9 ]+', ' ', 'g'),
      '\s+(inc|llc|ltd|corp|corporation|co|company|holdings|group|technologies|technology|labs|systems)\s*$', '', 'g'),
    '\s+', ' ', 'g')), '');
$$;

-- 00000000000027_duplicates.sql
create or replace function norm_url(p text)
returns text language sql immutable as $$
  select nullif(trim(both '/' from
    regexp_replace(
      regexp_replace(lower(coalesce(p, '')), '^https?://(www\.)?', ''),
      '[?#].*$', '')), '');
$$;

-- 00000000000027_duplicates.sql
create type dup_confidence as enum ('exact', 'strong', 'possible');

-- 00000000000027_duplicates.sql
create or replace function find_duplicates(
  p_entity text,
  p_name   text,
  p_url    text default null,
  p_scope  uuid default null
) returns table (
  id uuid, title text, confidence dup_confidence, reason text, context text
) language plpgsql stable as $$
declare
  n text := norm_name(p_name);
  u text := norm_url(p_url);
begin
  if n is null and u is null then return; end if;

  if p_entity = 'company' then
    return query
      select c.id, c.name,
             case when norm_name(c.name) = n then 'exact'::dup_confidence
                  when u is not null and norm_url(c.external_url) = u then 'exact'
                  when similarity(norm_name(c.name), n) > 0.75 then 'strong'
                  else 'possible' end,
             case when norm_name(c.name) = n then 'Same name'
                  when u is not null and norm_url(c.external_url) = u then 'Same website'
                  else 'Similar name' end,
             case when c.is_active then 'Active client' else 'Inactive client' end
        from clients c
       where norm_name(c.name) = n
          or (u is not null and norm_url(c.external_url) = u)
          or similarity(norm_name(c.name), n) > 0.55
       order by 3, 1 limit 5;

  elsif p_entity = 'gtm_account' then
    return query
      select g.id, g.company,
             case when norm_name(g.company) = n then 'exact'::dup_confidence
                  when u is not null and norm_url(g.website) = u then 'exact'
                  when similarity(norm_name(g.company), n) > 0.75 then 'strong'
                  else 'possible' end,
             case when norm_name(g.company) = n then 'Same company name'
                  when u is not null and norm_url(g.website) = u then 'Same website'
                  else 'Similar company name' end,
             'GTM · ' || replace(g.stage::text, '_', ' ')
        from gtm_accounts g
       where norm_name(g.company) = n
          or (u is not null and norm_url(g.website) = u)
          or similarity(norm_name(g.company), n) > 0.55
       order by 3, 1 limit 5;

  elsif p_entity = 'task' then
    -- Scoped to the project: the same task title under two projects is
    -- legitimate, the same title twice in one project usually is not.
    return query
      select t.id, t.title,
             case when norm_name(t.title) = n then 'exact'::dup_confidence
                  when similarity(norm_name(t.title), n) > 0.8 then 'strong'
                  else 'possible' end,
             case when norm_name(t.title) = n then 'Same title'
                  else 'Similar title' end,
             coalesce(p.name, 'No project') || ' · ' || replace(t.status::text, '_', ' ')
        from tasks t
        left join projects p on p.id = t.project_id
       where t.deleted_at is null
         and t.archived_at is null
         and (p_scope is null or t.project_id is not distinct from p_scope)
         and (norm_name(t.title) = n or similarity(norm_name(t.title), n) > 0.7)
       order by 3, 1 limit 5;

  elsif p_entity = 'content' then
    return query
      select c.id, c.title,
             case when norm_name(c.title) = n then 'exact'::dup_confidence
                  when similarity(norm_name(c.title), n) > 0.8 then 'strong'
                  else 'possible' end,
             case when norm_name(c.title) = n then 'Same title' else 'Similar title' end,
             'Content · ' || replace(c.status::text, '_', ' ')
        from content c
       where c.deleted_at is null
         and (norm_name(c.title) = n or similarity(norm_name(c.title), n) > 0.7)
       order by 3, 1 limit 5;

  elsif p_entity = 'gtm_contact' then
    return query
      select k.id, k.name,
             case when u is not null and norm_url(k.linkedin_url) = u then 'exact'::dup_confidence
                  when norm_name(k.name) = n then 'strong'
                  else 'possible' end,
             case when u is not null and norm_url(k.linkedin_url) = u then 'Same LinkedIn profile'
                  else 'Same name at this account' end,
             coalesce(k.title, 'No title')
        from gtm_contacts k
       where (p_scope is null or k.account_id = p_scope)
         and ((u is not null and norm_url(k.linkedin_url) = u)
              or norm_name(k.name) = n
              or similarity(norm_name(k.name), n) > 0.8)
       order by 3, 1 limit 5;
  end if;
end;
$$;

-- 00000000000027_duplicates.sql
create index if not exists clients_name_trgm on clients using gin (name gin_trgm_ops);

-- 00000000000027_duplicates.sql
create index if not exists tasks_title_trgm on tasks using gin (title gin_trgm_ops);

-- 00000000000027_duplicates.sql
create index if not exists content_title_trgm on content using gin (title gin_trgm_ops);

-- 00000000000027_duplicates.sql
create unique index if not exists gtm_contacts_linkedin_idx
  on gtm_contacts (account_id, norm_url(linkedin_url))
  where linkedin_url is not null;

-- 00000000000028_requisitions.sql
create type search_type as enum (
  'retained', 'engaged', 'exclusive_contingent', 'non_exclusive_contingent'
);

-- 00000000000028_requisitions.sql
create type competition_level as enum (
  'alac_only', 'internal_plus_alac', 'one_two_agencies', 'three_plus_agencies', 'unknown'
);

-- 00000000000028_requisitions.sql
create type approval_state as enum ('approved', 'pending', 'exploratory');

-- 00000000000028_requisitions.sql
create type req_status as enum (
  'not_activated',  
  'active',
  'calibrating',
  'on_hold',
  'paused',
  'filled',
  'closed_lost',
  'withdrawn'
);

-- 00000000000028_requisitions.sql
create type req_action as enum (
  'deploy', 'source', 'advance', 'calibrate', 'hold', 'pause', 'close'
);

-- 00000000000028_requisitions.sql
create type delivery_need as enum ('none', 'low', 'moderate', 'high', 'critical');

-- 00000000000028_requisitions.sql
create type best_stage as enum (
  'none', 'submitted', 'interview', 'round_two_plus', 'final', 'offer'
);

-- 00000000000028_requisitions.sql
create table requisitions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references clients(id) on delete set null,
  
  company        text not null,
  role_title     text not null,
  openings       int  not null default 1 check (openings > 0),

  
  comp_min       numeric(12,2),
  comp_target    numeric(12,2),
  comp_max       numeric(12,2),
  fee_percent    numeric(5,2) check (fee_percent between 0 and 100),
  agreement_signed boolean not null default false,
  date_received  date not null default current_date,

  
  search_type    search_type,
  competition    competition_level,

  
  approval       approval_state,
  target_start   date,
  consequence    text,   

  
  intake_with    text,   
  hm_access      text,   
  process_defined text,  
  interviews_from date,

  
  work_arrangement text, 
  relocation       text, 
  clearance        text, 
  industry_need    text, 
  must_haves       text, 
  adjacent_ok      text, 

  
  initial_score      numeric(5,2),
  initial_grade      char(1),
  initial_close_pct  numeric(5,2),
  live_score         numeric(5,2),
  live_grade         char(1),
  live_close_pct     numeric(5,2),
  recommended_action req_action,
  delivery_need      delivery_need,
  guardrail_note     text,

  
  viable_candidates  int not null default 0,
  best_stage         best_stage not null default 'none',
  client_likes       int not null default 0,
  feedback_days      int,
  requirement_changes int not null default 0,
  last_progress_at   timestamptz,

  status         req_status not null default 'not_activated',
  owner_id       uuid references people(id) on delete set null,
  function_id    uuid references functions(id) on delete set null,
  notes          text,
  created_by     uuid references people(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  
  closed_at      timestamptz,
  archived_at    timestamptz,
  deleted_at     timestamptz,
  deleted_by     uuid references people(id) on delete set null
);

-- 00000000000028_requisitions.sql
create index requisitions_active_idx on requisitions (status)
  where archived_at is null and deleted_at is null;

-- 00000000000028_requisitions.sql
create index requisitions_company_trgm on requisitions using gin (company gin_trgm_ops);

-- 00000000000028_requisitions.sql
create table scoring_config (
  id         int primary key default 1 check (id = 1),
  config     jsonb not null,
  updated_by uuid references people(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 00000000000028_requisitions.sql
insert into scoring_config (id, config) values (1, '{
  "weights": {
    "commitment": 0.25, "need": 0.20, "access": 0.20,
    "fillability": 0.20, "economics": 0.15
  },
  "grades": { "A": 85, "B": 70, "C": 55, "D": 40 },
  "search_type": {
    "retained": 100, "engaged": 90,
    "exclusive_contingent": 85, "non_exclusive_contingent": 55
  },
  "competition": {
    "alac_only": 10, "internal_plus_alac": 0,
    "one_two_agencies": -10, "three_plus_agencies": -25, "unknown": -10
  },
  "close_baseline": {
    "retained": 45, "engaged": 35,
    "exclusive_contingent": 30, "non_exclusive_contingent": 20
  },
  "close_competition": {
    "alac_only": 5, "internal_plus_alac": 0,
    "one_two_agencies": -3, "three_plus_agencies": -7, "unknown": -2
  },
  "fee_per_placement": [
    {"min": 30000, "score": 100}, {"min": 20000, "score": 80},
    {"min": 15000, "score": 60}, {"min": 10000, "score": 40}, {"min": 0, "score": 20}
  ],
  "total_fee": [
    {"min": 75000, "score": 100}, {"min": 50000, "score": 85},
    {"min": 30000, "score": 70}, {"min": 20000, "score": 55}, {"min": 0, "score": 35}
  ],
  "urgency_bands": [
    {"days": 30, "label": "CRITICAL", "score": 100},
    {"days": 45, "label": "URGENT", "score": 90},
    {"days": 60, "label": "ACTIVE", "score": 75},
    {"days": 90, "label": "NORMAL", "score": 60},
    {"days": 120, "label": "LOW URGENCY", "score": 45}
  ]
}'::jsonb);

-- 00000000000029_req_scoring.sql
create or replace function days_until(d date)
returns int language sql immutable as $$
  select case when d is null then null else (d - current_date) end;
$$;

-- 00000000000029_req_scoring.sql
create or replace function score_urgency(d date)
returns int language plpgsql stable as $$
declare
  n int := days_until(d);
begin
  if n is null then return 20; end if;
  if n <= 30  then return 100; end if;
  if n <= 45  then return 90;  end if;
  if n <= 60  then return 75;  end if;
  if n <= 90  then return 60;  end if;
  if n <= 120 then return 45;  end if;
  return 30;
end;
$$;

-- 00000000000029_req_scoring.sql
create or replace function urgency_label(d date)
returns text language plpgsql stable as $$
declare n int := days_until(d);
begin
  if n is null then return 'UNDEFINED'; end if;
  if n <= 30 then return 'CRITICAL'; end if;
  if n <= 45 then return 'URGENT'; end if;
  if n <= 60 then return 'ACTIVE'; end if;
  if n <= 90 then return 'NORMAL'; end if;
  return 'LOW URGENCY';
end;
$$;

-- 00000000000029_req_scoring.sql
create or replace function score_requisition(r requisitions)
returns jsonb language plpgsql stable as $$
declare
  cfg jsonb := (select config from scoring_config where id = 1);
  commitment numeric := 0;
  need numeric := 0;
  access numeric := 0;
  fill numeric := 0;
  econ numeric := 0;
  fee_each numeric;
  fee_total numeric;
  v numeric;
begin
  -- §17 COMMITMENT: search type, adjusted for who else is working it.
  commitment := coalesce((cfg->'search_type'->>r.search_type::text)::numeric, 55)
              + coalesce((cfg->'competition'->>r.competition::text)::numeric, -10);
  commitment := greatest(0, least(100, commitment));

  -- §18 NEED: approval 45%, target date 35%, business consequence 20%.
  need := 0.45 * case r.approval
            when 'approved' then 100 when 'pending' then 45 else 10 end
        + 0.35 * score_urgency(r.target_start)
        + 0.20 * case r.consequence
            when 'mission' then 100 when 'operational' then 80
            when 'growth' then 60 when 'normal' then 40
            when 'none' then 20 else 30 end;

  -- §19 ACCESS: can we actually reach the person who decides?
  access := 0.35 * case r.intake_with
              when 'hm_final' then 100 when 'hm_plus_hr' then 90
              when 'hr_only' then 50 else 20 end
          + 0.30 * case r.hm_access
              when 'direct' then 100 when 'through_hr' then 70
              when 'unknown' then 40 else 20 end
          + 0.20 * case r.process_defined
              when 'defined' then 100 when 'partial' then 60 else 20 end
          + 0.15 * case
              when r.interviews_from is null then 20
              when days_until(r.interviews_from) <= 14 then 100
              when days_until(r.interviews_from) <= 30 then 80
              else 50 end;

  -- §20 FILLABILITY: how large is the pool this search can actually draw from?
  v := case r.work_arrangement
         when 'remote' then 100 when 'hybrid' then 80 else 60 end;
  if r.work_arrangement = 'onsite' and r.relocation = 'yes' then
    v := least(100, v + 10);
  end if;

  fill := 0.15 * v
        + 0.20 * case r.clearance
            when 'none' then 100 when 'able' then 85 when 'secret' then 65
            when 'ts' then 50 when 'ts_sci' then 35 else 25 end
        + 0.20 * case r.industry_need
            when 'preferred' then 100 when 'strong' then 75 else 45 end
        + 0.20 * case r.must_haves
            when 'one_three' then 100 when 'four_six' then 65 else 35 end
        + 0.25 * case r.adjacent_ok
            when 'yes' then 100 when 'maybe' then 65 else 35 end;

  -- §21 ECONOMICS: is the fee worth the delivery effort?
  fee_each  := coalesce(r.comp_target, 0) * coalesce(r.fee_percent, 0) / 100.0;
  fee_total := fee_each * r.openings;

  econ := 0.70 * case
            when fee_each >= 30000 then 100 when fee_each >= 20000 then 80
            when fee_each >= 15000 then 60  when fee_each >= 10000 then 40
            else 20 end
        + 0.30 * case
            when fee_total >= 75000 then 100 when fee_total >= 50000 then 85
            when fee_total >= 30000 then 70  when fee_total >= 20000 then 55
            else 35 end;

  return jsonb_build_object(
    'commitment', round(commitment, 1),
    'need',       round(need, 1),
    'access',     round(access, 1),
    'fillability', round(fill, 1),
    'economics',  round(econ, 1),
    'fee_each',   round(fee_each, 2),
    'fee_total',  round(fee_total, 2),
    'total', round(
        commitment * (cfg->'weights'->>'commitment')::numeric
      + need       * (cfg->'weights'->>'need')::numeric
      + access     * (cfg->'weights'->>'access')::numeric
      + fill       * (cfg->'weights'->>'fillability')::numeric
      + econ       * (cfg->'weights'->>'economics')::numeric, 1)
  );
end;
$$;

-- 00000000000029_req_scoring.sql
create or replace function grade_of(p numeric)
returns char(1) language sql stable as $$
  select case
    when p >= 85 then 'A' when p >= 70 then 'B'
    when p >= 55 then 'C' when p >= 40 then 'D' else 'F' end;
$$;

-- 00000000000029_req_scoring.sql
create or replace function apply_guardrails(r requisitions, g char(1), fill numeric)
returns jsonb language plpgsql stable as $$
declare
  cap char(1) := g;
  why text := null;
  worse constant text := 'ABCDF';
begin
  if r.approval <> 'approved' then
    cap := 'C'; why := 'Headcount is not approved.';
  end if;

  if r.intake_with = 'none' and position(cap in worse) < position('C' in worse) then
    cap := 'C'; why := coalesce(why || ' ', '') || 'No formal intake took place.';
  end if;

  if r.search_type = 'non_exclusive_contingent'
     and r.competition = 'three_plus_agencies'
     and r.hm_access in ('no', 'unknown')
     and position(cap in worse) < position('C' in worse) then
    cap := 'C';
    why := coalesce(why || ' ', '') ||
           'Non-exclusive against three or more agencies with no direct hiring manager access.';
  end if;

  if r.approval = 'exploratory' and r.target_start is null then
    cap := 'D'; why := coalesce(why || ' ', '') || 'Exploratory with no target start date.';
  end if;

  if fill < 30 and position(cap in worse) < position('C' in worse) then
    cap := 'C';
    why := coalesce(why || ' ', '') || 'Requirements are close to unfillable as written.';
  end if;

  return jsonb_build_object('grade', cap, 'why', why);
end;
$$;

-- 00000000000030_req_live.sql
create or replace function initial_close(r requisitions, s jsonb)
returns numeric language plpgsql stable as $$
declare
  cfg jsonb := (select config from scoring_config where id = 1);
  p numeric;
begin
  p := coalesce((cfg->'close_baseline'->>r.search_type::text)::numeric, 20)
     + coalesce((cfg->'close_competition'->>r.competition::text)::numeric, -2);

  -- Each factor nudges by at most five points: these are modifiers on a
  -- baseline, not a second scoring system.
  p := p + greatest(-5, least(5, round(((s->>'need')::numeric        - 50) / 10)));
  p := p + greatest(-5, least(5, round(((s->>'access')::numeric      - 50) / 10)));
  p := p + greatest(-5, least(5, round(((s->>'fillability')::numeric - 50) / 10)));

  return greatest(5, least(60, p));
end;
$$;

-- 00000000000030_req_live.sql
create or replace function live_close(r requisitions, base numeric)
returns numeric language plpgsql stable as $$
declare p numeric := base;
begin
  p := p + case r.best_stage
             when 'offer' then 50 when 'final' then 35
             when 'round_two_plus' then 20 when 'interview' then 10
             when 'submitted' then 2 else 0 end;

  p := p + case when r.viable_candidates >= 3 then 6
                when r.viable_candidates = 2 then 4
                when r.viable_candidates = 1 then 2 else 0 end;

  p := p + case when r.client_likes >= 2 then 5
                when r.client_likes = 1 then 3 else 0 end;

  -- A client who takes ten days to give feedback is telling you something.
  p := p + case when r.feedback_days is null then 0
                when r.feedback_days <= 2 then 5
                when r.feedback_days <= 5 then 0
                when r.feedback_days <= 10 then -5
                else -10 end;

  -- Requirements that keep moving are the clearest signal of a search that
  -- was never properly defined.
  p := p - least(12, r.requirement_changes * 3);

  p := p + case
    when r.last_progress_at is null then 0
    when now() - r.last_progress_at <= interval '7 days'  then 2
    when now() - r.last_progress_at <= interval '14 days' then 0
    when now() - r.last_progress_at <= interval '30 days' then -5
    else -10 end;

  return greatest(3, least(90, p));
end;
$$;

-- 00000000000030_req_live.sql
create or replace function delivery_need_of(r requisitions, g char(1))
returns delivery_need language plpgsql stable as $$
begin
  -- Weak searches do not earn delivery capacity. Fix them first (§40).
  if g in ('D', 'F') then return 'low'; end if;
  if r.status in ('on_hold', 'paused', 'calibrating') then return 'none'; end if;

  -- Late stage: the work now is closing, not sourcing.
  if r.best_stage in ('final', 'offer') then return 'low'; end if;
  if r.best_stage in ('interview', 'round_two_plus') and r.viable_candidates >= 2
    then return 'low'; end if;

  -- Good search, nobody in play: this is where capacity actually goes.
  if r.viable_candidates = 0 then
    return case when g = 'A' then 'critical' else 'high' end;
  end if;
  if r.viable_candidates = 1 then return 'moderate'; end if;
  return 'low';
end;
$$;

-- 00000000000030_req_live.sql
create or replace function recommend_action(r requisitions, g char(1), need delivery_need)
returns req_action language plpgsql stable as $$
begin
  if not r.agreement_signed then return 'hold'; end if;
  if g = 'F' then return 'close'; end if;
  if g = 'D' then return 'calibrate'; end if;
  if r.best_stage in ('final', 'offer') then return 'advance'; end if;
  if need in ('critical', 'high') then return 'source'; end if;
  if r.viable_candidates > 0 then return 'advance'; end if;
  return 'deploy';
end;
$$;

-- 00000000000030_req_live.sql
create or replace function score_req_trigger()
returns trigger language plpgsql as $$
declare
  s jsonb;
  guard jsonb;
  base numeric;
begin
  s := score_requisition(new);

  new.initial_score := (s->>'total')::numeric;
  guard := apply_guardrails(new, grade_of(new.initial_score),
                            (s->>'fillability')::numeric);
  new.initial_grade   := guard->>'grade';
  new.guardrail_note  := guard->>'why';

  base := initial_close(new, s);
  new.initial_close_pct := base;
  new.live_close_pct    := live_close(new, base);

  -- Live grade re-reads the same factors against current evidence, so a
  -- search that decays shows A → C rather than silently staying an A.
  new.live_score := new.initial_score;
  new.live_grade := new.initial_grade;

  new.delivery_need      := delivery_need_of(new, new.live_grade);
  new.recommended_action := recommend_action(new, new.live_grade, new.delivery_need);

  -- §15: no signed agreement means it is not active delivery capacity.
  if not new.agreement_signed and new.status = 'active' then
    new.status := 'not_activated';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 00000000000030_req_live.sql
drop trigger if exists req_scoring on requisitions;

-- 00000000000030_req_live.sql
create trigger req_scoring
  before insert or update on requisitions
  for each row execute function score_req_trigger();

-- 00000000000031_guardrail_note.sql
create or replace function apply_guardrails(r requisitions, g char(1), fill numeric)
returns jsonb language plpgsql stable as $$
declare
  cap    char(1) := g;
  notes  text[] := '{}';
  worse  constant text := 'ABCDF';
  lower_to text;
begin
  -- Each condition records itself, then tightens the cap if it needs to.
  if r.approval <> 'approved' then
    notes := array_append(notes, 'Headcount is not approved.');
    lower_to := 'C';
  end if;

  if r.intake_with = 'none' then
    notes := array_append(notes, 'No formal intake took place.');
    lower_to := 'C';
  end if;

  if r.search_type = 'non_exclusive_contingent'
     and r.competition = 'three_plus_agencies'
     and r.hm_access in ('no', 'unknown') then
    notes := array_append(notes, 'Non-exclusive against three or more agencies with no direct hiring manager access.');
    lower_to := 'C';
  end if;

  if r.approval = 'exploratory' and r.target_start is null then
    notes := array_append(notes, 'Exploratory with no target start date.');
    lower_to := 'D';
  end if;

  if fill < 30 then
    notes := array_append(notes, 'Requirements are close to unfillable as written.');
    lower_to := 'C';
  end if;

  -- Apply the strictest cap any condition asked for.
  if lower_to is not null
     and position(cap in worse) < position(lower_to in worse) then
    cap := lower_to;
  end if;

  return jsonb_build_object(
    'grade', cap,
    'why', nullif(array_to_string(notes, ' '), '')
  );
end;
$$;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts disable trigger user;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts drop constraint if exists gtm_complete_needs_outcome;

-- 00000000000032_gtm_full.sql
drop index if exists gtm_stage_idx;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts add column stage_txt text;

-- 00000000000032_gtm_full.sql
update gtm_accounts set stage_txt = stage::text;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts alter column stage drop default;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts alter column stage type text using stage::text;

-- 00000000000032_gtm_full.sql
drop type gtm_stage;

-- 00000000000032_gtm_full.sql
create type gtm_stage as enum (
  'target',              
  'researching',         
  'contacts_found',      
  'pending_review',      
  'approved_build',      
  'pending_outreach',    
  'outreach_active',     
  'engaged',             
  'complete',            
  'hold'                 
);

-- 00000000000032_gtm_full.sql
update gtm_accounts set stage_txt = case stage_txt
  when 'outreach_active' then 'outreach_active'
  when 'engaged' then 'engaged'
  when 'complete' then 'complete'
  else stage_txt end;

-- 00000000000032_gtm_full.sql
update gtm_accounts set stage = stage_txt;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts alter column stage type gtm_stage using stage::gtm_stage;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts alter column stage set default 'target';

-- 00000000000032_gtm_full.sql
alter table gtm_accounts alter column stage set not null;

-- 00000000000032_gtm_full.sql
alter table gtm_accounts drop column stage_txt;

-- 00000000000032_gtm_full.sql
create index gtm_stage_idx on gtm_accounts (stage);

-- 00000000000032_gtm_full.sql
alter table gtm_accounts
  add constraint gtm_complete_needs_outcome
  check (stage <> 'complete' or outcome is not null);

-- 00000000000032_gtm_full.sql
alter table gtm_accounts enable trigger user;

-- 00000000000032_gtm_full.sql
create type sw_account_status as enum (
  'not_approved', 'approved', 'loaded', 'outreach_ready', 'outreach_active', 'engaged'
);

-- 00000000000032_gtm_full.sql
create type sw_contact_status as enum (
  'research_identified', 'approved_persona', 'loaded', 'current_persona',
  'queued', 'eligible', 'active', 'engaged', 'skipped', 'hold'
);

-- 00000000000032_gtm_full.sql
create type copy_status as enum (
  'draft', 'fact_check_required', 'ready_for_review', 'rework_requested', 'approved'
);

-- 00000000000032_gtm_full.sql
alter table gtm_accounts
  add column if not exists sw_status        sw_account_status not null default 'not_approved',
  add column if not exists approved_by      uuid references people(id) on delete set null,
  add column if not exists approved_at      timestamptz,
  add column if not exists launched_by      uuid references people(id) on delete set null,
  add column if not exists launched_at      timestamptz,
  add column if not exists hold_until       date,
  add column if not exists hold_reason      text,
  
  add column if not exists next_eligible_on date,
  add column if not exists why_now          text,
  add column if not exists engaged_at       timestamptz,
  add column if not exists engaged_contact_id uuid;

-- 00000000000032_gtm_full.sql
alter table gtm_contacts
  add column if not exists persona_order  int not null default 0,
  add column if not exists sw_status      sw_contact_status not null default 'research_identified',
  add column if not exists why_this_person text,
  add column if not exists contacted_at   timestamptz,
  add column if not exists responded_at   timestamptz,
  add column if not exists eligible_on    date,
  add column if not exists outcome        text,
  add column if not exists copy_body      text,
  add column if not exists copy_status    copy_status not null default 'draft',
  add column if not exists copy_note      text;

-- 00000000000032_gtm_full.sql
create table gtm_evidence (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references gtm_accounts(id) on delete cascade,
  claim        text not null,
  source_title text,
  source_url   text,
  published_on date,
  verified_at  timestamptz,
  verified_by  uuid references people(id) on delete set null,
  notes        text,
  created_by   uuid references people(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 00000000000032_gtm_full.sql
create table gtm_copy_versions (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references gtm_contacts(id) on delete cascade,
  body       text not null,
  status     copy_status not null,
  author_id  uuid references people(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

-- 00000000000032_gtm_full.sql
create index gtm_evidence_idx on gtm_evidence (account_id);

-- 00000000000032_gtm_full.sql
create index gtm_copy_idx on gtm_copy_versions (contact_id, created_at desc);

-- 00000000000033_gtm_workflow_rules.sql
create or replace function add_business_days(d date, n int)
returns date language plpgsql immutable as $$
declare
  result date := d;
  added int := 0;
begin
  while added < n loop
    result := result + 1;
    if extract(isodow from result) < 6 then
      added := added + 1;
    end if;
  end loop;
  return result;
end;
$$;

-- 00000000000033_gtm_workflow_rules.sql
create or replace function persona_spacing_days()
returns int language sql stable as $$
  select coalesce((select (config->>'persona_spacing_days')::int
                     from scoring_config where id = 1), 5);
$$;

-- 00000000000033_gtm_workflow_rules.sql
create or replace function refresh_personas(p_account uuid)
returns void language plpgsql as $$
declare
  acct        record;
  last_out    date;
  next_ok     date;
  c           record;
  found_next  boolean := false;
begin
  select * into acct from gtm_accounts where id = p_account;
  if acct.id is null then return; end if;

  -- §53: once somebody responds, stop approaching their colleagues.
  if acct.stage = 'engaged' then
    update gtm_contacts
       set sw_status = 'hold'::sw_contact_status
     where account_id = p_account
       and sw_status not in ('engaged', 'skipped')
       and responded_at is null;
    update gtm_accounts set next_eligible_on = null where id = p_account;
    return;
  end if;

  select max(contacted_at::date) into last_out
    from gtm_contacts where account_id = p_account and contacted_at is not null;

  next_ok := case when last_out is null then current_date
                  else add_business_days(last_out, persona_spacing_days()) end;

  for c in
    select * from gtm_contacts
     where account_id = p_account
       and sw_status not in ('engaged', 'skipped', 'hold')
     order by persona_order, seniority
  loop
    if c.responded_at is not null then
      update gtm_contacts set sw_status = 'engaged'::sw_contact_status where id = c.id;
    elsif c.contacted_at is not null then
      -- Approached and waiting: this is the persona currently in flight.
      update gtm_contacts set sw_status = 'current_persona'::sw_contact_status, eligible_on = null
       where id = c.id;
    elsif not found_next then
      found_next := true;
      update gtm_contacts
         set sw_status = case when next_ok <= current_date
                             then 'eligible'::sw_contact_status
                             else 'queued'::sw_contact_status end,
             eligible_on = next_ok
       where id = c.id;
      update gtm_accounts set next_eligible_on = next_ok where id = p_account;
    else
      -- Everyone after the next one waits their turn.
      update gtm_contacts set sw_status = 'queued'::sw_contact_status, eligible_on = null where id = c.id;
    end if;
  end loop;

  if not found_next then
    update gtm_accounts set next_eligible_on = null where id = p_account;
  end if;
end;
$$;

-- 00000000000033_gtm_workflow_rules.sql
create or replace function on_contact_change()
returns trigger language plpgsql as $$
begin
  -- refresh_personas writes back to gtm_contacts, which re-fires this
  -- trigger. The guard makes the recursion terminate after one pass; without
  -- it the stack blows on the first insert.
  if coalesce(current_setting('alac.refreshing_personas', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  perform set_config('alac.refreshing_personas', 'on', true);
  perform refresh_personas(coalesce(new.account_id, old.account_id));
  perform set_config('alac.refreshing_personas', 'off', true);
  return coalesce(new, old);
end;
$$;

-- 00000000000033_gtm_workflow_rules.sql
drop trigger if exists gtm_contact_change on gtm_contacts;

-- 00000000000033_gtm_workflow_rules.sql
create trigger gtm_contact_change
  after insert or update or delete on gtm_contacts
  for each row execute function on_contact_change();

-- 00000000000033_gtm_workflow_rules.sql
create or replace function guard_copy_status()
returns trigger language plpgsql as $$
declare
  unverified int;
begin
  if new.copy_status = 'ready_for_review'
     and old.copy_status is distinct from 'ready_for_review' then
    select count(*) into unverified
      from gtm_evidence
     where account_id = new.account_id and verified_at is null;

    if unverified > 0 then
      new.copy_status := 'fact_check_required';
      new.copy_note := format(
        '%s factual claim(s) still unverified. Verify sources before review.',
        unverified);
    end if;
  end if;
  return new;
end;
$$;

-- 00000000000033_gtm_workflow_rules.sql
drop trigger if exists gtm_copy_guard on gtm_contacts;

-- 00000000000033_gtm_workflow_rules.sql
create trigger gtm_copy_guard
  before update on gtm_contacts
  for each row execute function guard_copy_status();

-- 00000000000033_gtm_workflow_rules.sql
create or replace function log_copy_version()
returns trigger language plpgsql as $$
begin
  if new.copy_body is distinct from old.copy_body
     or new.copy_status is distinct from old.copy_status then
    insert into gtm_copy_versions (contact_id, body, status, author_id, note)
    values (new.id, coalesce(new.copy_body, ''), new.copy_status,
            mc.uid(), new.copy_note);
  end if;
  return null;
end;
$$;

-- 00000000000033_gtm_workflow_rules.sql
drop trigger if exists gtm_copy_history on gtm_contacts;

-- 00000000000033_gtm_workflow_rules.sql
create trigger gtm_copy_history
  after update on gtm_contacts
  for each row execute function log_copy_version();

-- 00000000000033_gtm_workflow_rules.sql
update scoring_config
   set config = config || '{"persona_spacing_days": 5}'::jsonb
 where id = 1;

-- 00000000000034_gtm_gates.sql
alter type notify_kind add value if not exists 'gtm_review_needed';

-- 00000000000034_gtm_gates.sql
alter type notify_kind add value if not exists 'gtm_launch_ready';

-- 00000000000035_gtm_gate_logic.sql
create or replace function gate_gtm_stage()
returns trigger language plpgsql as $$
begin
  if new.stage in ('approved_build', 'pending_outreach', 'outreach_active', 'engaged')
     and new.approved_by is null then
    raise exception
      'This account has not been approved. Approve it before moving it to %.',
      replace(new.stage::text, '_', ' ');
  end if;

  if new.stage = 'outreach_active' and new.launched_by is null then
    raise exception
      'Outreach has not been launched. A person must launch it explicitly.';
  end if;

  -- Approval and launch stamp themselves so the record is unambiguous.
  if new.approved_by is not null and new.approved_at is null then
    new.approved_at := now();
  end if;
  if new.launched_by is not null and new.launched_at is null then
    new.launched_at := now();
  end if;

  -- Engagement stops the sequence; §53 holds the remaining personas.
  if new.stage = 'engaged' and old.stage is distinct from 'engaged' then
    new.engaged_at := coalesce(new.engaged_at, now());
  end if;

  -- SourceWhale state follows the stage rather than being tracked twice.
  new.sw_status := case new.stage
    when 'approved_build'   then 'approved'::sw_account_status
    when 'pending_outreach' then 'loaded'
    when 'outreach_active'  then 'outreach_active'
    when 'engaged'          then 'engaged'
    else new.sw_status end;

  return new;
end;
$$;

-- 00000000000035_gtm_gate_logic.sql
drop trigger if exists gtm_gates on gtm_accounts;

-- 00000000000035_gtm_gate_logic.sql
create trigger gtm_gates
  before update on gtm_accounts
  for each row execute function gate_gtm_stage();

-- 00000000000035_gtm_gate_logic.sql
create or replace function on_gtm_event()
returns trigger language plpgsql as $$
declare
  actor      uuid := mc.uid();
  actor_name text;
  link       text;
begin
  actor := coalesce(actor, new.created_by, new.researcher_id, new.owner_id);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');
  link := '/gtm/' || new.id;

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('gtm_account', new.id, actor, 'created',
            format('%s added %s as a target', actor_name, new.company));

    if new.researcher_id is not null then
      perform notify(new.researcher_id, 'gtm_target_added',
        format('New GTM target: %s', new.company),
        coalesce(new.why_now, new.signal_note), link, 'gtm_account', new.id, actor);
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'stage_changed', 'stage',
            old.stage::text, new.stage::text,
            format('%s moved %s to %s', actor_name, new.company,
                   replace(new.stage::text, '_', ' ')));

    if new.stage = 'researching' then
      perform notify(new.owner_id, 'gtm_started',
        format('%s started researching %s', actor_name, new.company),
        new.why_now, link, 'gtm_account', new.id, actor);
    end if;

    -- The founder gate. This is the decision the board exists to surface.
    if new.stage = 'pending_review' then
      perform notify(new.owner_id, 'gtm_review_needed',
        format('%s is ready for your review', new.company),
        coalesce(new.why_now, 'Research complete. Approve or hold.'),
        link, 'gtm_account', new.id, actor);
    end if;

    -- Loaded and waiting on a human to press launch.
    if new.stage = 'pending_outreach' then
      perform notify(new.owner_id, 'gtm_launch_ready',
        format('%s is loaded and ready to launch', new.company),
        'Nothing sends until you launch it.', link, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'engaged' then
      perform notify(new.owner_id, 'gtm_review',
        format('%s responded', new.company),
        'Someone at the account engaged.', link, 'gtm_account', new.id, actor);
    end if;

    if new.stage = 'complete' then
      new.completed_at := coalesce(new.completed_at, now());
      perform notify(new.owner_id, 'gtm_review',
        format('%s campaign complete, %s', new.company,
               replace(coalesce(new.outcome::text, 'closed'), '_', ' ')),
        new.outcome_note, link, 'gtm_account', new.id, actor);
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000036_engaged_holds.sql
create or replace function hold_on_engagement()
returns trigger language plpgsql as $$
begin
  if new.stage = 'engaged' and old.stage is distinct from 'engaged' then
    perform refresh_personas(new.id);
  end if;
  return null;
end;
$$;

-- 00000000000036_engaged_holds.sql
drop trigger if exists gtm_engaged_holds on gtm_accounts;

-- 00000000000036_engaged_holds.sql
create trigger gtm_engaged_holds
  after update on gtm_accounts
  for each row execute function hold_on_engagement();

-- 00000000000037_next_actions.sql
create type action_type as enum (
  'research_persona',     
  'write_first_touch',    
  'approve_copy',         
  'launch_outreach',      
  'follow_up',            
  'progress_persona',     
  'review_response',      
  'account_review',       
  'stale_check'           
);

-- 00000000000037_next_actions.sql
create type action_urgency as enum ('overdue', 'today', 'upcoming', 'waiting');

-- 00000000000037_next_actions.sql
update scoring_config
   set config = config || jsonb_build_object(
     'persona_progression_days', 7,
     'follow_up_days', 4,
     'stale_days', 7)
 where id = 1;

-- 00000000000037_next_actions.sql
create or replace function config_days(p_key text, p_default int)
returns int language sql stable as $$
  select coalesce((select (config->>p_key)::int from scoring_config where id = 1),
                  p_default);
$$;

-- 00000000000037_next_actions.sql
create or replace view account_next_action as
with persona_state as (
  select
    a.id as account_id,
    
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is not null
        and c.responded_at is null
        and c.sw_status not in ('skipped', 'hold')
      order by c.contacted_at desc limit 1) as current_contact,
    
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is null
        and c.sw_status not in ('skipped', 'hold')
      order by c.persona_order, c.seniority limit 1) as next_contact,
    
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.responded_at is not null
      order by c.responded_at desc limit 1) as responded_contact,
    (select count(*) from gtm_contacts c where c.account_id = a.id) as persona_count,
    (select count(*) from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is not null) as contacted_count,
    
    greatest(
      a.updated_at,
      coalesce((select max(c.contacted_at) from gtm_contacts c where c.account_id = a.id),
               a.created_at),
      coalesce((select max(c.responded_at) from gtm_contacts c where c.account_id = a.id),
               a.created_at)
    ) as last_activity
  from gtm_accounts a
)
select
  a.id as account_id,
  a.company,
  a.priority,
  a.stage,
  ps.current_contact,
  ps.next_contact,
  ps.responded_contact,
  ps.persona_count,
  ps.contacted_count,
  ps.last_activity,

  
  case
    when ps.responded_contact is not null then 'review_response'
    when a.stage = 'pending_review'        then 'account_review'
    when ps.persona_count = 0              then 'research_persona'
    when a.stage in ('approved_build', 'pending_outreach')
         and nc.copy_status = 'approved'   then 'launch_outreach'
    when nc.copy_status = 'ready_for_review' then 'approve_copy'
    when nc.id is not null
         and (nc.copy_body is null or nc.copy_status in ('draft', 'fact_check_required',
                                                         'rework_requested'))
                                           then 'write_first_touch'
    when cc.id is not null
         and cc.contacted_at > now() - make_interval(days => config_days('persona_progression_days', 7))
                                           then 'follow_up'
    when nc.id is not null                 then 'progress_persona'
    when ps.last_activity < now() - make_interval(days => config_days('stale_days', 7))
                                           then 'stale_check'
    else null
  end::action_type as action_type,

  
  
  case
    when ps.responded_contact is not null then a.owner_id
    when a.stage = 'pending_review'       then a.owner_id
    when nc.copy_status = 'ready_for_review' then a.owner_id
    when a.stage in ('approved_build', 'pending_outreach')
         and nc.copy_status = 'approved'  then a.owner_id
    else coalesce(a.researcher_id, a.owner_id)
  end as owner_id,

  
  
  case
    when cc.id is not null and ps.responded_contact is null
      then (cc.contacted_at
            + make_interval(days => config_days('persona_progression_days', 7)))::date
    else current_date
  end as due_on,

  nc.name  as next_persona_name,
  nc.title as next_persona_title,
  cc.name  as current_persona_name,
  cc.title as current_persona_title,
  cc.contacted_at as current_contacted_at,
  nc.copy_status as next_copy_status
from gtm_accounts a
join persona_state ps on ps.account_id = a.id
left join gtm_contacts cc on cc.id = ps.current_contact
left join gtm_contacts nc on nc.id = ps.next_contact

where a.stage not in ('complete', 'hold')
  and a.stage <> 'target';

-- 00000000000038_action_queue.sql
create or replace function action_reason(
  p_type action_type,
  p_current text, p_contacted timestamptz,
  p_next text, p_days int
) returns text language sql immutable as $$
  select case p_type
    when 'review_response' then
      coalesce(p_current, 'Someone') || ' replied. Read it before anything else goes out.'
    when 'account_review' then
      'Research is complete and this is waiting on your decision.'
    when 'research_persona' then
      'No decision makers identified yet, so there is nobody to approach.'
    when 'write_first_touch' then
      case when p_contacted is null
        then 'No copy written for ' || coalesce(p_next, 'the next persona') || ' yet.'
        else coalesce(p_current, 'The previous persona') || ' was contacted '
             || extract(day from now() - p_contacted)::int
             || ' days ago with no response. ' || coalesce(p_next, 'The next persona')
             || ' is next and needs copy.'
      end
    when 'approve_copy' then
      'Copy for ' || coalesce(p_next, 'the next persona')
      || ' is written and waiting on your approval.'
    when 'launch_outreach' then
      'Approved and loaded. Nothing sends until someone launches it.'
    when 'follow_up' then
      coalesce(p_current, 'The current persona') || ' was contacted '
      || extract(day from now() - p_contacted)::int
      || ' days ago. The next touch in the sequence is due.'
    when 'progress_persona' then
      coalesce(p_current, 'The previous persona') || ' reached ' || p_days
      || ' days with no response. Move to ' || coalesce(p_next, 'the next persona') || '.'
    when 'stale_check' then
      'Nothing has happened on this account for ' || p_days
      || ' days and nothing is scheduled.'
    else null
  end;
$$;

-- 00000000000038_action_queue.sql
create or replace view action_queue as
select
  n.*,
  action_reason(n.action_type, n.current_persona_title, n.current_contacted_at,
                n.next_persona_title, config_days('persona_progression_days', 7))
    as reason,
  case
    when n.due_on < current_date  then 'overdue'
    when n.due_on = current_date  then 'today'
    when n.due_on <= current_date + 3 then 'upcoming'
    else 'waiting'
  end::action_urgency as urgency,
  
  (case
     when n.due_on < current_date then 0
     when n.action_type = 'review_response' then 1
     when n.due_on = current_date then 2
     when n.due_on <= current_date + 3 then 3
     else 4
   end) * 10
  + (case n.priority when 'high' then 0 when 'normal' then 1 else 2 end)
    as sort_key
from account_next_action n
where n.action_type is not null;

-- 00000000000039_dedup_by_kind.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Same person, same entity, same KIND, same statement: that is a repeat.
  if exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and kind = p_kind
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  select slack_user_id into slack_id from people where id = p_person;

  if slack_id is not null and exists (
    select 1 from slack_outbox
     where target_slack_id = slack_id
       and kind = p_kind::text
       and task_id is not distinct from
           (case when p_entity = 'task' then p_entity_id else null end)
       and created_at >= statement_timestamp()
  ) then
    return;
  end if;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false)
     and slack_id is not null then
    insert into slack_outbox (kind, target_slack_id, text, url, task_id)
    values (p_kind::text, slack_id, p_title, p_url,
            case when p_entity = 'task' then p_entity_id else null end);
  end if;
end;
$$;

-- 00000000000040_dedup_final.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
  already  boolean;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Anything already sent to this person about this entity in THIS statement
  -- belongs to the same action, whatever its kind.
  select exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and created_at >= statement_timestamp()
  ) into already;

  if not already then
    select slack_user_id into slack_id from people where id = p_person;
    if slack_id is not null then
      -- Scoped to THIS entity: task_id only identifies tasks, so the url
      -- (which always contains the entity id) is what makes the check
      -- specific for GTM accounts and content.
      select exists (
        select 1 from slack_outbox o
         where o.target_slack_id = slack_id
           and o.created_at >= statement_timestamp()
           and coalesce(o.url, '') = coalesce(p_url, '')
      ) into already;
    end if;
  end if;

  if already then return; end if;

  select slack_user_id into slack_id from people where id = p_person;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor);
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false)
     and slack_id is not null then
    insert into slack_outbox (kind, target_slack_id, text, url, task_id)
    values (p_kind::text, slack_id, p_title, p_url,
            case when p_entity = 'task' then p_entity_id else null end);
  end if;
end;
$$;

-- 00000000000041_action_order.sql
create or replace view account_next_action as
with persona_state as (
  select
    a.id as account_id,
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is not null
        and c.responded_at is null
        and c.sw_status not in ('skipped', 'hold')
      order by c.contacted_at desc limit 1) as current_contact,
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is null
        and c.sw_status not in ('skipped', 'hold')
      order by c.persona_order, c.seniority limit 1) as next_contact,
    (select c.id from gtm_contacts c
      where c.account_id = a.id and c.responded_at is not null
      order by c.responded_at desc limit 1) as responded_contact,
    (select count(*) from gtm_contacts c where c.account_id = a.id) as persona_count,
    (select count(*) from gtm_contacts c
      where c.account_id = a.id and c.contacted_at is not null) as contacted_count,
    greatest(
      a.updated_at,
      coalesce((select max(c.contacted_at) from gtm_contacts c where c.account_id = a.id),
               a.created_at),
      coalesce((select max(c.responded_at) from gtm_contacts c where c.account_id = a.id),
               a.created_at)
    ) as last_activity
  from gtm_accounts a
)
select
  a.id as account_id,
  a.company,
  a.priority,
  a.stage,
  ps.current_contact,
  ps.next_contact,
  ps.responded_contact,
  ps.persona_count,
  ps.contacted_count,
  ps.last_activity,

  case
    
    when ps.responded_contact is not null then 'review_response'
    when a.stage = 'pending_review'        then 'account_review'
    when ps.persona_count = 0              then 'research_persona'

    
    
    when cc.id is not null
         and cc.contacted_at > now()
             - make_interval(days => config_days('persona_progression_days', 7))
      then 'follow_up'

    
    
    when a.stage in ('approved_build', 'pending_outreach')
         and nc.copy_status = 'approved'   then 'launch_outreach'
    when nc.copy_status = 'ready_for_review' then 'approve_copy'
    when nc.id is not null
         and (nc.copy_body is null
              or nc.copy_status in ('draft', 'fact_check_required', 'rework_requested'))
      then 'write_first_touch'
    when nc.id is not null                 then 'progress_persona'

    when ps.last_activity < now() - make_interval(days => config_days('stale_days', 7))
      then 'stale_check'
    else null
  end::action_type as action_type,

  case
    when ps.responded_contact is not null then a.owner_id
    when a.stage = 'pending_review'       then a.owner_id
    when nc.copy_status = 'ready_for_review' then a.owner_id
    when a.stage in ('approved_build', 'pending_outreach')
         and nc.copy_status = 'approved'  then a.owner_id
    else coalesce(a.researcher_id, a.owner_id)
  end as owner_id,

  
  case
    when ps.responded_contact is not null then current_date
    when cc.id is not null
      then (cc.contacted_at
            + make_interval(days => config_days('follow_up_days', 4)))::date
    else current_date
  end as due_on,

  nc.name  as next_persona_name,
  nc.title as next_persona_title,
  cc.name  as current_persona_name,
  cc.title as current_persona_title,
  cc.contacted_at as current_contacted_at,
  nc.copy_status as next_copy_status
from gtm_accounts a
join persona_state ps on ps.account_id = a.id
left join gtm_contacts cc on cc.id = ps.current_contact
left join gtm_contacts nc on nc.id = ps.next_contact
where a.stage not in ('complete', 'hold')
  and a.stage <> 'target';

-- 00000000000042_gtm_lifecycle.sql
alter table gtm_accounts
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_by   uuid references people(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists completed_by  uuid references people(id) on delete set null,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references people(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists reopened_at   timestamptz,
  add column if not exists reopened_by   uuid references people(id) on delete set null,
  add column if not exists reopen_count  int not null default 0,
  
  
  add column if not exists stage_before_archive gtm_stage;

-- 00000000000042_gtm_lifecycle.sql
create index if not exists gtm_active_idx on gtm_accounts (stage)
  where archived_at is null and deleted_at is null;

-- 00000000000042_gtm_lifecycle.sql
create index if not exists gtm_archive_idx on gtm_accounts (archived_at desc)
  where archived_at is not null;

-- 00000000000042_gtm_lifecycle.sql
create or replace function stamp_gtm_lifecycle()
returns trigger language plpgsql as $$
begin
  if new.stage = 'complete' and old.stage is distinct from 'complete' then
    new.completed_at         := coalesce(new.completed_at, now());
    new.completed_by         := coalesce(new.completed_by, mc.uid(), new.owner_id);
    new.stage_before_archive := old.stage;
    new.archived_at          := coalesce(new.archived_at, now());
    new.archived_by          := coalesce(new.archived_by, mc.uid(), new.owner_id);
  end if;

  if old.stage = 'complete' and new.stage is distinct from 'complete' then
    new.archived_at  := null;
    new.archived_by  := null;
    new.completed_at := null;
    new.reopened_at  := now();
    new.reopened_by  := coalesce(mc.uid(), new.owner_id);
    new.reopen_count := old.reopen_count + 1;
  end if;

  return new;
end;
$$;

-- 00000000000042_gtm_lifecycle.sql
drop trigger if exists gtm_lifecycle on gtm_accounts;

-- 00000000000042_gtm_lifecycle.sql
create trigger gtm_lifecycle
  before update on gtm_accounts
  for each row execute function stamp_gtm_lifecycle();

-- 00000000000042_gtm_lifecycle.sql
create or replace function archive_gtm_account(p_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare actor uuid := mc.uid();
begin
  update gtm_accounts
     set archived_at = now(), archived_by = actor,
         archive_reason = p_reason,
         stage_before_archive = stage
   where id = p_id and archived_at is null;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('gtm_account', p_id, actor, 'archived',
          coalesce(p_reason, 'Archived. Preserved, not deleted.'));
end;
$$;

-- 00000000000042_gtm_lifecycle.sql
create or replace function reopen_gtm_account(p_id uuid, p_stage gtm_stage default null)
returns void language plpgsql security definer as $$
declare
  actor  uuid := mc.uid();
  target gtm_stage;
begin
  select coalesce(p_stage, stage_before_archive, 'researching')
    into target from gtm_accounts where id = p_id;

  update gtm_accounts
     set stage = target, archived_at = null, archived_by = null,
         archive_reason = null, completed_at = null,
         reopened_at = now(), reopened_by = actor,
         reopen_count = reopen_count + 1
   where id = p_id;

  insert into activity (entity_type, entity_id, actor_id, verb, to_value, summary)
  values ('gtm_account', p_id, actor, 'reopened', target::text,
          'Reopened from the archive to ' || replace(target::text, '_', ' ') || '.');
end;
$$;

-- 00000000000042_gtm_lifecycle.sql
create or replace function soft_delete_gtm_account(p_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare actor uuid := mc.uid();
begin
  update gtm_accounts
     set deleted_at = now(), deleted_by = actor,
         delete_reason = p_reason, archived_at = null
   where id = p_id;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('gtm_account', p_id, actor, 'deleted',
          coalesce(p_reason, 'Removed. Not counted as completed work.'));
end;
$$;

-- 00000000000043_archive_all.sql
alter table content
  add column if not exists archive_reason text,
  add column if not exists stage_before_archive content_status;

-- 00000000000043_archive_all.sql
alter table tasks
  add column if not exists archive_reason text,
  add column if not exists stage_before_archive task_status;

-- 00000000000043_archive_all.sql
create or replace function archive_content(p_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare actor uuid := mc.uid();
begin
  update content
     set archived_at = now(), archived_by = actor,
         archive_reason = p_reason, stage_before_archive = status
   where id = p_id and archived_at is null;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('content', p_id, actor, 'archived',
          coalesce(p_reason, 'Archived. Preserved, not deleted.'));
end;
$$;

-- 00000000000043_archive_all.sql
create or replace function archive_task(p_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare actor uuid := mc.uid();
begin
  update tasks
     set archived_at = now(), archived_by = actor,
         archive_reason = p_reason, stage_before_archive = status
   where id = p_id and archived_at is null;

  insert into activity (entity_type, entity_id, actor_id, verb, summary)
  values ('task', p_id, actor, 'archived',
          coalesce(p_reason, 'Archived. Preserved, not deleted.'));
end;
$$;

-- 00000000000043_archive_all.sql
create or replace function reopen_content(p_id uuid, p_status content_status default null)
returns void language plpgsql security definer as $$
declare
  actor  uuid := mc.uid();
  target content_status;
begin
  select coalesce(p_status, stage_before_archive, 'in_progress')
    into target from content where id = p_id;

  update content
     set status = target, archived_at = null, archived_by = null,
         archive_reason = null, reopened_at = now(), reopened_by = actor,
         reopen_count = reopen_count + 1
   where id = p_id;

  insert into activity (entity_type, entity_id, actor_id, verb, to_value, summary)
  values ('content', p_id, actor, 'reopened', target::text,
          'Reopened from the archive.');
end;
$$;

-- 00000000000043_archive_all.sql
drop view if exists archive_items;

-- 00000000000043_archive_all.sql
create view archive_items as
  select 'task'::text as kind, t.id, t.title,
         t.archived_at, t.archived_by, t.status::text as final_status,
         coalesce(t.stage_before_archive::text, t.status::text) as stage_before,
         t.function_id, t.project_id, t.assignee_id as owner_id,
         t.created_at, t.reopen_count, t.archive_reason,
         'Company Board'::text as source_board
    from tasks t where t.archived_at is not null and t.deleted_at is null
  union all
  select 'content', c.id, c.title,
         c.archived_at, c.archived_by, c.status::text,
         coalesce(c.stage_before_archive::text, c.status::text),
         null, null, c.owner_id, c.created_at, c.reopen_count, c.archive_reason,
         'Content'
    from content c where c.archived_at is not null and c.deleted_at is null
  union all
  select 'gtm_account', g.id, g.company,
         g.archived_at, g.archived_by, g.stage::text,
         coalesce(g.stage_before_archive::text, g.stage::text),
         null, null, coalesce(g.owner_id, g.researcher_id),
         g.created_at, g.reopen_count, g.archive_reason,
         'GTM Execution'
    from gtm_accounts g where g.archived_at is not null and g.deleted_at is null;

-- 00000000000043_archive_all.sql
drop view if exists completed_work;

-- 00000000000043_archive_all.sql
create view completed_work as
  select 'task'::text as kind, t.id, t.title, t.done_at as completed_at,
         t.completed_by, t.function_id, t.project_id, t.reopen_count
    from tasks t
   where t.status = 'done' and t.archived_at is not null and t.deleted_at is null
  union all
  select 'content', c.id, c.title, c.published_at, c.owner_id, null, null, c.reopen_count
    from content c
   where c.status = 'published' and c.archived_at is not null and c.deleted_at is null
  union all
  select 'gtm_account', g.id, g.company, g.completed_at, g.completed_by, null, null,
         g.reopen_count
    from gtm_accounts g
   where g.stage = 'complete' and g.archived_at is not null and g.deleted_at is null;

-- 00000000000044_backfill_terminal.sql
update tasks
   set archived_at = coalesce(done_at, updated_at, created_at),
       stage_before_archive = coalesce(stage_before_archive, status)
 where status = 'done'
   and archived_at is null
   and deleted_at is null;

-- 00000000000044_backfill_terminal.sql
update content
   set archived_at = coalesce(published_at, updated_at, created_at),
       stage_before_archive = coalesce(stage_before_archive, status)
 where status = 'published'
   and archived_at is null
   and deleted_at is null;

-- 00000000000044_backfill_terminal.sql
update gtm_accounts
   set archived_at = coalesce(completed_at, updated_at, created_at),
       stage_before_archive = coalesce(stage_before_archive, stage)
 where stage = 'complete'
   and archived_at is null
   and deleted_at is null;

-- 00000000000045_terminal_on_insert.sql
create or replace function stamp_task_terminal_insert()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    new.archived_at := coalesce(new.archived_at, new.done_at, now());
    new.stage_before_archive := coalesce(new.stage_before_archive, new.status);
  end if;
  return new;
end;
$$;

-- 00000000000045_terminal_on_insert.sql
create or replace function stamp_content_terminal_insert()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    new.archived_at := coalesce(new.archived_at, new.published_at, now());
    new.stage_before_archive := coalesce(new.stage_before_archive, new.status);
  end if;
  return new;
end;
$$;

-- 00000000000045_terminal_on_insert.sql
create or replace function stamp_gtm_terminal_insert()
returns trigger language plpgsql as $$
begin
  if new.stage = 'complete' then
    new.archived_at := coalesce(new.archived_at, new.completed_at, now());
    new.stage_before_archive := coalesce(new.stage_before_archive, new.stage);
  end if;
  return new;
end;
$$;

-- 00000000000045_terminal_on_insert.sql
drop trigger if exists tasks_terminal_insert on tasks;

-- 00000000000045_terminal_on_insert.sql
create trigger tasks_terminal_insert
  before insert on tasks
  for each row execute function stamp_task_terminal_insert();

-- 00000000000045_terminal_on_insert.sql
drop trigger if exists content_terminal_insert on content;

-- 00000000000045_terminal_on_insert.sql
create trigger content_terminal_insert
  before insert on content
  for each row execute function stamp_content_terminal_insert();

-- 00000000000045_terminal_on_insert.sql
drop trigger if exists gtm_terminal_insert on gtm_accounts;

-- 00000000000045_terminal_on_insert.sql
create trigger gtm_terminal_insert
  before insert on gtm_accounts
  for each row execute function stamp_gtm_terminal_insert();

-- 00000000000046_content_media.sql
create type asset_stage as enum (
  'reference',  
  'raw',        
  'edited',     
  'final',      
  'supporting'  
);

-- 00000000000046_content_media.sql
create type asset_approval as enum (
  'not_required', 'needs_review', 'changes_requested', 'approved'
);

-- 00000000000046_content_media.sql
alter table content_assets
  add column if not exists stage        asset_stage not null default 'supporting',
  add column if not exists approval     asset_approval not null default 'not_required',
  add column if not exists display_name text,
  add column if not exists is_primary   boolean not null default false,
  add column if not exists version      int not null default 1,
  add column if not exists replaces_id  uuid references content_assets(id) on delete set null,
  add column if not exists approved_by  uuid references people(id) on delete set null,
  add column if not exists approved_at  timestamptz,
  add column if not exists duration_s   numeric(8,2),
  add column if not exists width        int,
  add column if not exists height       int,
  
  
  add column if not exists is_link      boolean generated always as
    (storage_path is null and external_url is not null) stored;

-- 00000000000046_content_media.sql
create unique index if not exists content_assets_primary_idx
  on content_assets (content_id) where is_primary;

-- 00000000000046_content_media.sql
create index if not exists content_assets_stage_idx
  on content_assets (content_id, stage);

-- 00000000000046_content_media.sql
create or replace function guard_content_asset()
returns trigger language plpgsql as $$
begin
  -- Marking one primary un-marks the previous.
  if new.is_primary and (tg_op = 'INSERT' or not old.is_primary) then
    update content_assets set is_primary = false
     where content_id = new.content_id and id <> new.id and is_primary;
  end if;

  -- A final asset needs review unless someone explicitly approved it.
  if new.stage = 'final' and new.approval = 'not_required' then
    new.approval := 'needs_review';
  end if;

  -- Replacing an approved asset resets approval on the replacement.
  if tg_op = 'UPDATE'
     and new.storage_path is distinct from old.storage_path
     and old.approval = 'approved' then
    new.approval := 'needs_review';
    new.approved_by := null;
    new.approved_at := null;
  end if;

  -- Approval stamps itself so nobody has to remember to.
  if new.approval = 'approved' and old.approval is distinct from 'approved' then
    new.approved_by := coalesce(new.approved_by, mc.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  return new;
end;
$$;

-- 00000000000046_content_media.sql
drop trigger if exists content_asset_guard on content_assets;

-- 00000000000046_content_media.sql
create trigger content_asset_guard
  before insert or update on content_assets
  for each row execute function guard_content_asset();

-- 00000000000046_content_media.sql
create or replace function log_content_asset()
returns trigger language plpgsql as $$
declare
  actor uuid := coalesce(mc.uid(), new.uploaded_by);
  who   text;
  label text := coalesce(new.display_name, new.file_name);
begin
  select name into who from people where id = actor;

  if tg_op = 'INSERT' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('content', new.content_id, actor, 'asset_added',
            format('%s added %s (%s)', coalesce(who, 'Someone'), label, new.stage));
  elsif new.approval is distinct from old.approval then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('content', new.content_id, actor, 'asset_reviewed', 'approval',
            old.approval::text, new.approval::text,
            format('%s marked %s %s', coalesce(who, 'Someone'), label,
                   replace(new.approval::text, '_', ' ')));
  end if;
  return null;
end;
$$;

-- 00000000000046_content_media.sql
drop trigger if exists content_asset_log on content_assets;

-- 00000000000046_content_media.sql
create trigger content_asset_log
  after insert or update on content_assets
  for each row execute function log_content_asset();

-- 00000000000047_content_next_action.sql
create type content_action as enum (
  'write_copy',       
  'record_raw',       
  'edit_media',       
  'review_edit',      
  'revise_edit',      
  'mark_final',       
  'schedule',         
  'publish',          
  'add_link'          
);

-- 00000000000047_content_next_action.sql
create or replace view content_next_action as
with media as (
  select
    c.id as content_id,
    count(*) filter (where a.stage = 'raw')       as raw_count,
    count(*) filter (where a.stage = 'edited')    as edited_count,
    count(*) filter (where a.stage = 'final')     as final_count,
    count(*) filter (where a.stage = 'reference') as ref_count,
    count(*) filter (where a.stage = 'final' and a.approval = 'approved')
      as approved_count,
    count(*) filter (where a.approval = 'needs_review')      as pending_review,
    count(*) filter (where a.approval = 'changes_requested') as needs_changes,
    count(*)                                       as asset_count
  from content c
  left join content_assets a on a.content_id = c.id
  group by c.id
)
select
  c.id as content_id,
  c.title,
  c.status,
  c.owner_id,
  c.publish_date,
  m.raw_count, m.edited_count, m.final_count, m.ref_count,
  m.approved_count, m.pending_review, m.needs_changes, m.asset_count,

  case
    
    when m.needs_changes > 0                       then 'revise_edit'
    
    when m.pending_review > 0                      then 'review_edit'
    
    when c.status = 'published' and c.published_url is null then 'add_link'
    when c.status = 'published'                    then null
    
    when coalesce(c.body, c.script, '') = ''
         and coalesce(c.hook, '') = ''             then 'write_copy'
    
    when m.raw_count = 0 and m.edited_count = 0
         and m.final_count = 0
         and c.kind in ('short', 'long')           then 'record_raw'
    
    when m.raw_count > 0 and m.edited_count = 0
         and m.final_count = 0                     then 'edit_media'
    
    when m.approved_count > 0 and m.final_count = 0 then 'mark_final'
    
    when m.final_count > 0 and c.publish_date is null then 'schedule'
    when m.final_count > 0 and c.publish_date <= current_date
         and c.status <> 'published'               then 'publish'
    else null
  end::content_action as action_type,

  
  case
    when m.pending_review > 0 then
      (select id from people where is_admin order by created_at limit 1)
    else c.owner_id
  end as action_owner_id,

  
  case
    when m.needs_changes > 0  then 'Waiting on edits'
    when m.pending_review > 0 then 'Waiting on approval'
    when m.raw_count > 0 and m.edited_count = 0 then 'Waiting on editing'
    when m.raw_count = 0 and c.kind in ('short', 'long') then 'Waiting on raw footage'
    when m.final_count > 0 and c.publish_date is null then 'Waiting on scheduling'
    else null
  end as waiting_on
from content c
join media m on m.content_id = c.id
where c.archived_at is null and c.deleted_at is null;

-- 00000000000049_gtm_audit_history.sql
create or replace function gtm_audit() returns trigger
language plpgsql as $$
declare
  actor uuid := mc.uid();
  actor_name text;
  who text;
  -- Each entry is field / from / to / a sentence a person can read.
  entries text[][];
begin
  actor := coalesce(actor, new.owner_id, new.researcher_id, new.created_by);
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if new.priority is distinct from old.priority then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'priority_changed', 'priority',
            old.priority::text, new.priority::text,
            format('%s set %s to %s priority', actor_name, new.company,
                   new.priority::text));
  end if;

  if new.owner_id is distinct from old.owner_id then
    select name into who from people where id = new.owner_id;
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'owner_changed', 'owner_id',
            old.owner_id::text, new.owner_id::text,
            format('%s assigned %s to %s', actor_name, new.company,
                   coalesce(who, 'nobody')));
  end if;

  if new.researcher_id is distinct from old.researcher_id then
    select name into who from people where id = new.researcher_id;
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'researcher_changed', 'researcher_id',
            old.researcher_id::text, new.researcher_id::text,
            format('%s gave research on %s to %s', actor_name, new.company,
                   coalesce(who, 'nobody')));
  end if;

  if new.next_action is distinct from old.next_action
     or new.next_action_on is distinct from old.next_action_on then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'next_action_changed', 'next_action',
            old.next_action, new.next_action,
            format('%s set the next action on %s', actor_name, new.company));
  end if;

  -- Archive, restore and delete are the changes people most need to trace,
  -- because each one takes a card off somebody's board.
  if new.archived_at is distinct from old.archived_at then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor,
            case when new.archived_at is null then 'restored' else 'archived' end,
            'archived_at', old.archived_at::text, new.archived_at::text,
            case when new.archived_at is null
                 then format('%s reopened %s', actor_name, new.company)
                 else format('%s archived %s', actor_name, new.company) end);
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor,
            case when new.deleted_at is null then 'undeleted' else 'deleted' end,
            'deleted_at', old.deleted_at::text, new.deleted_at::text,
            case when new.deleted_at is null
                 then format('%s recovered %s', actor_name, new.company)
                 else format('%s deleted %s', actor_name, new.company) end);
  end if;

  if new.why_now is distinct from old.why_now then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('gtm_account', new.id, actor, 'why_now_changed', 'why_now',
            old.why_now, new.why_now,
            format('%s revised why now on %s', actor_name, new.company));
  end if;

  return null;  -- AFTER trigger; the row is already written.
end;
$$;

-- 00000000000049_gtm_audit_history.sql
create trigger gtm_audit_history
  after update on gtm_accounts
  for each row execute function gtm_audit();

-- 00000000000050_priority_sanity.sql
create or replace view gtm_priority_health as
select
  count(*) filter (where priority = 'high')                      as high_count,
  count(*)                                                       as total,
  round(100.0 * count(*) filter (where priority = 'high')
        / nullif(count(*), 0))                                   as high_pct,
  
  count(*) filter (where priority = 'high') > greatest(3, count(*) * 0.4)
                                                                 as high_is_diluted
from gtm_accounts
where archived_at is null and deleted_at is null;

-- 00000000000050_priority_sanity.sql
comment on view gtm_priority_health is
  'Signal quality of the HIGH priority flag on the active GTM board (§16).';

-- 00000000000051_gtm_validation.sql
update gtm_accounts
   set company = 'Untitled account (' || left(id::text, 8) || ')'
 where company is null or btrim(company) = '';

-- 00000000000051_gtm_validation.sql
alter table gtm_accounts
  add constraint gtm_company_not_blank
  check (btrim(company) <> '');

-- 00000000000051_gtm_validation.sql
update tasks set title = 'Untitled task' where btrim(title) = '';

-- 00000000000051_gtm_validation.sql
alter table tasks
  add constraint task_title_not_blank check (btrim(title) <> '');

-- 00000000000051_gtm_validation.sql
update content set title = 'Untitled piece' where btrim(title) = '';

-- 00000000000051_gtm_validation.sql
alter table content
  add constraint content_title_not_blank check (btrim(title) <> '');

-- 00000000000052_gtm_revisions.sql
alter table gtm_accounts add column if not exists revision integer not null default 1;

-- 00000000000052_gtm_revisions.sql
create or replace function bump_revision() returns trigger
language plpgsql as $$
begin
  -- The revision belongs to the row's content, so a no-op write does not
  -- burn a number and invalidate everyone else's open editor.
  if to_jsonb(new) - 'revision' - 'updated_at'
     is distinct from to_jsonb(old) - 'revision' - 'updated_at' then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

-- 00000000000052_gtm_revisions.sql
create trigger gtm_bump_revision
  before update on gtm_accounts
  for each row execute function bump_revision();

-- 00000000000052_gtm_revisions.sql
create or replace function update_gtm_account_checked(
  p_id uuid,
  p_expected_revision integer,
  p_patch jsonb
) returns integer
language plpgsql security invoker as $$
declare
  current_rev integer;
  new_rev integer;
begin
  select revision into current_rev from gtm_accounts where id = p_id for update;

  if current_rev is null then
    raise exception 'That account no longer exists.';
  end if;

  if p_expected_revision is not null and current_rev <> p_expected_revision then
    raise exception
      'Somebody else changed this account while you were editing it. Reload to see their changes before saving.'
      using errcode = '40001';
  end if;

  update gtm_accounts set
    company        = coalesce((p_patch->>'company')::text, company),
    website        = coalesce((p_patch->>'website')::text, website),
    industry       = coalesce((p_patch->>'industry')::text, industry),
    why_now        = coalesce((p_patch->>'why_now')::text, why_now),
    notes          = coalesce((p_patch->>'notes')::text, notes),
    next_action    = coalesce((p_patch->>'next_action')::text, next_action),
    next_action_on = coalesce((p_patch->>'next_action_on')::date, next_action_on),
    priority       = coalesce((p_patch->>'priority')::priority, priority),
    owner_id       = coalesce((p_patch->>'owner_id')::uuid, owner_id),
    researcher_id  = coalesce((p_patch->>'researcher_id')::uuid, researcher_id)
  where id = p_id
  returning revision into new_rev;

  return new_rev;
end;
$$;

-- 00000000000053_gate_messages.sql
create or replace function gate_gtm_stage()
returns trigger language plpgsql as $$
begin
  if new.stage in ('approved_build', 'pending_outreach', 'outreach_active', 'engaged')
     and new.approved_by is null then
    raise exception
      'This account has not been approved yet. Open the Review tab to approve %, then move it.',
      new.company;
  end if;

  if new.stage = 'outreach_active' and new.launched_by is null then
    raise exception
      'Outreach for % has not been launched. Open the account and launch it explicitly, a drag cannot start a campaign.',
      new.company;
  end if;

  -- Approval and launch stamp themselves so the record is unambiguous.
  if new.approved_by is not null and new.approved_at is null then
    new.approved_at := now();
  end if;
  if new.launched_by is not null and new.launched_at is null then
    new.launched_at := now();
  end if;

  -- Engagement stops the sequence; §53 holds the remaining personas.
  if new.stage = 'engaged' and old.stage is distinct from 'engaged' then
    new.engaged_at := coalesce(new.engaged_at, now());
  end if;

  -- SourceWhale state follows the stage rather than being tracked twice.
  new.sw_status := case new.stage
    when 'approved_build'   then 'approved'::sw_account_status
    when 'pending_outreach' then 'loaded'
    when 'outreach_active'  then 'outreach_active'
    when 'engaged'          then 'engaged'
    else new.sw_status end;

  return new;
end;
$$;

-- 00000000000054_remove_workflow_gates.sql
create or replace function gate_gtm_stage()
returns trigger language plpgsql as $$
begin
  -- Approval and launch stamp themselves so the record stays unambiguous,
  -- including when the stage was reached by dragging the card there.
  if new.stage in ('approved_build', 'pending_outreach', 'outreach_active', 'engaged')
     and new.approved_by is null then
    new.approved_by := coalesce(mc.uid(), new.owner_id);
  end if;
  if new.approved_by is not null and new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.stage in ('outreach_active', 'engaged') and new.launched_by is null then
    new.launched_by := coalesce(mc.uid(), new.owner_id);
  end if;
  if new.launched_by is not null and new.launched_at is null then
    new.launched_at := now();
  end if;

  if new.stage = 'engaged' and old.stage is distinct from 'engaged' then
    new.engaged_at := coalesce(new.engaged_at, now());
  end if;

  -- SourceWhale state follows the stage rather than being tracked twice.
  new.sw_status := case new.stage
    when 'approved_build'   then 'approved'::sw_account_status
    when 'pending_outreach' then 'loaded'
    when 'outreach_active'  then 'outreach_active'
    when 'engaged'          then 'engaged'
    else new.sw_status end;

  return new;
end;
$$;

-- 00000000000054_remove_workflow_gates.sql
alter table gtm_accounts drop constraint if exists gtm_complete_needs_outcome;

-- 00000000000055_contact_function.sql
alter table gtm_contacts add column if not exists hiring_for text;

-- 00000000000055_contact_function.sql
comment on column gtm_contacts.hiring_for is
  'For a hiring manager: the function they hire for (Manufacturing, Quality…).';

-- 00000000000056_sourcewhale_ack.sql
alter table gtm_accounts
  add column if not exists sw_loaded_by  uuid references people(id) on delete set null,
  add column if not exists sw_loaded_at  timestamptz,
  
  
  add column if not exists sw_load_note  text;

-- 00000000000056_sourcewhale_ack.sql
comment on column gtm_accounts.sw_loaded_by is
  'Who confirmed the account and every hiring-manager-and-above contact were loaded into SourceWhale.';

-- 00000000000056_sourcewhale_ack.sql
create or replace function gate_sw_load() returns trigger
language plpgsql as $$
declare
  forward constant gtm_stage[] := array['pending_outreach', 'outreach_active',
                                        'engaged']::gtm_stage[];
begin
  if new.stage = any(forward)
     and old.stage is distinct from new.stage
     and new.sw_loaded_by is null then
    raise exception
      'Confirm the SourceWhale load first: % is not marked as uploaded with every hiring manager and above included.',
      new.company
      using hint = 'Open the account and confirm the load.';
  end if;

  if new.sw_loaded_by is not null and new.sw_loaded_at is null then
    new.sw_loaded_at := now();
  end if;

  -- Un-confirming clears the stamp, so the record cannot claim a load that
  -- somebody has since retracted.
  if new.sw_loaded_by is null then
    new.sw_loaded_at := null;
    new.sw_load_note := null;
  end if;

  return new;
end;
$$;

-- 00000000000056_sourcewhale_ack.sql
drop trigger if exists gtm_sw_load_gate on gtm_accounts;

-- 00000000000056_sourcewhale_ack.sql
create trigger gtm_sw_load_gate
  before update on gtm_accounts
  for each row execute function gate_sw_load();

-- 00000000000057_review_task_and_heat.sql
alter table tasks add column if not exists source_kind text;

-- 00000000000057_review_task_and_heat.sql
alter table tasks add column if not exists source_id   uuid;

-- 00000000000057_review_task_and_heat.sql
create index if not exists tasks_source_idx on tasks (source_kind, source_id)
  where source_kind is not null;

-- 00000000000057_review_task_and_heat.sql
create or replace function review_task_for_copy() returns trigger
language plpgsql as $$
declare
  acct record;
begin
  if new.status = 'ready_for_review'
     and old.status is distinct from 'ready_for_review' then
    select a.id, a.company, a.owner_id into acct
      from gtm_accounts a where a.id = new.account_id;

    if acct.owner_id is not null then
      -- A task, not just a notification: a notification is read once and
      -- gone, while the review is work that has to survive until it is done
      -- and show up in My Work alongside everything else owed.
      insert into tasks (title, assignee_id, priority, due_date, status,
                         source_kind, source_id)
      select
        format('Review outreach copy: %s', acct.company),
        acct.owner_id,
        -- Review inherits the account's heat, so a hot account's copy does
        -- not queue behind routine work.
        (select priority from gtm_accounts where id = acct.id),
        current_date,
        'todo',
        'gtm_account',
        acct.id
      -- One open review task per account, however many drafts are marked.
      where not exists (
        select 1 from tasks t
         where t.source_kind = 'gtm_account' and t.source_id = acct.id
           and t.title like 'Review outreach copy:%'
           and t.status not in ('done')
           and t.archived_at is null
           and t.deleted_at is null);
    end if;
  end if;

  -- Approval closes the task the same way finishing it would.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select a.id into acct from gtm_accounts a where a.id = new.account_id;
    update tasks set status = 'done'
     where source_kind = 'gtm_account' and source_id = acct.id
       and title like 'Review outreach copy:%'
       and status <> 'done';
  end if;

  return null;
end;
$$;

-- 00000000000057_review_task_and_heat.sql
drop trigger if exists outreach_review_notify on outreach_drafts;

-- 00000000000057_review_task_and_heat.sql
create trigger outreach_review_notify
  after update on outreach_drafts
  for each row execute function review_task_for_copy();

-- 00000000000057_review_task_and_heat.sql
drop view if exists action_queue;

-- 00000000000057_review_task_and_heat.sql
create view action_queue as
select
  n.*,
  action_reason(n.action_type, n.current_persona_title, n.current_contacted_at,
                n.next_persona_title, config_days('persona_progression_days', 7))
    as reason,
  case
    when n.due_on < current_date  then 'overdue'
    when n.due_on = current_date  then 'today'
    when n.due_on <= current_date + 3 then 'upcoming'
    else 'waiting'
  end::action_urgency as urgency,
  
  
  
  (case n.priority when 'high' then 0 when 'normal' then 1 else 2 end) * 100
  + (case
       when n.due_on < current_date then 0
       when n.action_type = 'review_response' then 1
       when n.due_on = current_date then 2
       when n.due_on <= current_date + 3 then 3
       else 4
     end)
    as sort_key
from account_next_action n
where n.action_type is not null;

-- 00000000000058_review_tasks_everywhere.sql
create or replace function open_review_task(
  p_title      text,
  p_reviewer   uuid,
  p_kind       text,
  p_id         uuid,
  p_priority   priority default 'normal'
) returns void language plpgsql as $$
begin
  if p_reviewer is null then return; end if;

  insert into tasks (title, assignee_id, priority, due_date, status,
                     source_kind, source_id)
  select p_title, p_reviewer, p_priority, current_date, 'todo', p_kind, p_id
   where not exists (
     select 1 from tasks t
      where t.source_kind = p_kind and t.source_id = p_id
        and t.status <> 'done'
        and t.archived_at is null and t.deleted_at is null);
end;
$$;

-- 00000000000058_review_tasks_everywhere.sql
create or replace function close_review_task(p_kind text, p_id uuid)
returns void language plpgsql as $$
begin
  update tasks set status = 'done'
   where source_kind = p_kind and source_id = p_id and status <> 'done';
end;
$$;

-- 00000000000058_review_tasks_everywhere.sql
create or replace function content_reviewer() returns uuid
language sql stable as $$
  select id from people
   where role in ('owner', 'admin') and coalesce(is_active, true)
   order by case role when 'owner' then 0 else 1 end, created_at
   limit 1;
$$;

-- 00000000000058_review_tasks_everywhere.sql
create or replace function content_review_task() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status = 'review'
     and old.status is distinct from 'review' then
    perform open_review_task(
      format('Review content: %s', new.title),
      coalesce(new.owner_id, content_reviewer()),
      'content', new.id);
  end if;

  -- Leaving review means the decision was made, whichever way it went.
  if tg_op = 'UPDATE' and old.status = 'review'
     and new.status is distinct from 'review' then
    perform close_review_task('content', new.id);
  end if;

  return null;
end;
$$;

-- 00000000000058_review_tasks_everywhere.sql
drop trigger if exists content_review_task_trg on content;

-- 00000000000058_review_tasks_everywhere.sql
create trigger content_review_task_trg
  after update on content
  for each row execute function content_review_task();

-- 00000000000058_review_tasks_everywhere.sql
create or replace function asset_review_task() returns trigger
language plpgsql as $$
declare
  piece record;
begin
  if new.approval = 'needs_review'
     and (tg_op = 'INSERT' or old.approval is distinct from 'needs_review') then
    select c.id, c.title, c.owner_id into piece
      from content c where c.id = new.content_id;

    if piece.id is not null then
      perform open_review_task(
        format('Approve media: %s', piece.title),
        coalesce(piece.owner_id, content_reviewer()),
        'content_asset', new.id);
    end if;
  end if;

  if tg_op = 'UPDATE' and new.approval in ('approved', 'changes_requested')
     and old.approval is distinct from new.approval then
    perform close_review_task('content_asset', new.id);
  end if;

  return null;
end;
$$;

-- 00000000000058_review_tasks_everywhere.sql
drop trigger if exists asset_review_task_trg on content_assets;

-- 00000000000058_review_tasks_everywhere.sql
create trigger asset_review_task_trg
  after insert or update on content_assets
  for each row execute function asset_review_task();

-- 00000000000059_sheet_mirror.sql
create table if not exists sync_runs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean,
  created       integer not null default 0,
  updated       integer not null default 0,
  unchanged     integer not null default 0,
  flagged       integer not null default 0,
  errors        integer not null default 0,
  
  error_text    text,
  notes         jsonb not null default '[]'::jsonb,
  run_by        uuid references people(id) on delete set null
);

-- 00000000000059_sheet_mirror.sql
create index if not exists sync_runs_recent on sync_runs (source, started_at desc);

-- 00000000000059_sheet_mirror.sql
create table if not exists sheet_accounts (
  record_id           text primary key,
  company             text not null,
  
  match_key           text not null,
  linkedin_url        text,
  priority            priority,
  tam_score           numeric,
  heat_score          integer,
  prep_status         text,
  motion              text,
  sw_status           text,
  next_action         text,
  battlecard_url      text,
  target_leads_url    text,
  heyreach_loaded_on  date,
  on_active_10        boolean not null default false,
  board_block         text,      
  
  gtm_account_id      uuid references gtm_accounts(id) on delete set null,
  
  
  match_confidence    text,      
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  
  
  missing_since       timestamptz,
  raw                 jsonb
);

-- 00000000000059_sheet_mirror.sql
create index if not exists sheet_accounts_match on sheet_accounts (match_key);

-- 00000000000059_sheet_mirror.sql
create index if not exists sheet_accounts_board on sheet_accounts (board_block)
  where board_block is not null;

-- 00000000000059_sheet_mirror.sql
create index if not exists sheet_accounts_linked on sheet_accounts (gtm_account_id)
  where gtm_account_id is not null;

-- 00000000000059_sheet_mirror.sql
create table if not exists sheet_signals (
  id            text primary key,
  company       text not null,
  match_key     text not null,
  signal_date   date,
  headline      text,
  amount        text,
  hq            text,
  heat_score    integer,
  tam_score     numeric,
  recommended   text,
  best_contact  text,
  source_url    text,
  record_id     text,
  last_scored   date,
  last_seen_at  timestamptz not null default now(),
  raw           jsonb
);

-- 00000000000059_sheet_mirror.sql
create index if not exists sheet_signals_match on sheet_signals (match_key);

-- 00000000000059_sheet_mirror.sql
create index if not exists sheet_signals_heat on sheet_signals (heat_score desc);

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists sheet_row        integer;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists match_key        text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists relationship_stage text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists campaign_status  text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists value_add_move   text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists last_touch_on    date;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists next_touch_on    date;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists cadence_days     integer;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists resource_note    text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists context_note     text;

-- 00000000000059_sheet_mirror.sql
alter table clients add column if not exists synced_at        timestamptz;

-- 00000000000059_sheet_mirror.sql
create index if not exists clients_match on clients (match_key);

-- 00000000000059_sheet_mirror.sql
create index if not exists clients_touch on clients (next_touch_on)
  where next_touch_on is not null;

-- 00000000000059_sheet_mirror.sql
create table if not exists client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  role        text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 00000000000059_sheet_mirror.sql
create index if not exists client_contacts_client on client_contacts (client_id);

-- 00000000000059_sheet_mirror.sql
create index if not exists gtm_external_idx on gtm_accounts (external_id)
  where external_id is not null;

-- 00000000000060_client_owner.sql
alter table clients add column if not exists owner_id uuid
  references people(id) on delete set null;

-- 00000000000060_client_owner.sql
create index if not exists clients_owner_idx on clients (owner_id)
  where owner_id is not null;

-- 00000000000060_client_owner.sql
alter table clients add column if not exists priority priority not null default 'normal';

-- 00000000000061_capacity_gate.sql
update scoring_config
   set config = config || '{
     "weekly_release_cap": 5,
     "wip_approved_build": 5,
     "wip_pending_outreach": 5,
     "review_warn": 5,
     "review_max": 7
   }'::jsonb
 where id = 1;

-- 00000000000061_capacity_gate.sql
create or replace function config_int(p_key text, p_default int)
returns int language sql stable as $$
  select coalesce((select (config->>p_key)::int from scoring_config where id = 1),
                  p_default);
$$;

-- 00000000000061_capacity_gate.sql
create or replace function week_start(p_when timestamptz default now())
returns date language sql stable as $$
  select (date_trunc('week', p_when at time zone 'America/New_York'))::date;
$$;

-- 00000000000061_capacity_gate.sql
create or replace view gtm_capacity as
with counts as (
  select stage::text as stage, count(*)::int as used
    from gtm_accounts
   where archived_at is null and deleted_at is null
   group by stage
)
select
  s.stage,
  coalesce(c.used, 0) as used,
  s.cap,
  coalesce(c.used, 0) > s.cap as over_capacity,
  greatest(s.cap - coalesce(c.used, 0), 0) as available
from (
  values
    ('approved_build',   config_int('wip_approved_build', 5)),
    ('pending_outreach', config_int('wip_pending_outreach', 5))
) as s(stage, cap)
left join counts c on c.stage = s.stage;

-- 00000000000061_capacity_gate.sql
create table if not exists gtm_capacity_events (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references gtm_accounts(id) on delete set null,
  company      text,
  kind         text not null,   
  stage        text,
  used_before  int,
  cap          int,
  reason       text,
  actor_id     uuid references people(id) on delete set null,
  week_of      date not null default week_start(),
  created_at   timestamptz not null default now()
);

-- 00000000000061_capacity_gate.sql
create index if not exists capacity_events_week on gtm_capacity_events (week_of, kind);

-- 00000000000061_capacity_gate.sql
create index if not exists capacity_events_account on gtm_capacity_events (account_id);

-- 00000000000061_capacity_gate.sql
create or replace function weekly_released(p_week date default week_start())
returns int language sql stable as $$
  select count(*)::int from gtm_capacity_events
   where week_of = p_week and kind in ('released', 'override');
$$;

-- 00000000000061_capacity_gate.sql
create or replace function gate_gtm_capacity() returns trigger
language plpgsql as $$
declare
  cap  int;
  used int;
  is_override boolean := coalesce(
    nullif(current_setting('alac.capacity_override', true), '')::boolean, false);
begin
  -- Only entering a controlled stage is gated. Leaving one, or moving
  -- between uncontrolled stages, is ordinary work and must stay fast.
  if new.stage = old.stage then return new; end if;

  select g.cap, g.used into cap, used
    from gtm_capacity g where g.stage = new.stage::text;

  if cap is null then return new; end if;          -- stage has no limit

  if used >= cap and not is_override then
    raise exception
      'CAPACITY_REACHED: % is full (%/%). Complete or move something out first, or override.',
      replace(new.stage::text, '_', ' '), used, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 00000000000061_capacity_gate.sql
drop trigger if exists gtm_capacity_gate on gtm_accounts;

-- 00000000000061_capacity_gate.sql
create trigger gtm_capacity_gate
  before update on gtm_accounts
  for each row execute function gate_gtm_capacity();

-- 00000000000061_capacity_gate.sql
create or replace function set_capacity_override(p_on boolean)
returns void language sql security definer set search_path = mc, public as $$
  select set_config('alac.capacity_override', p_on::text, false);
$$;

-- 00000000000062_review_owner.sql
create or replace function gtm_reviewer(p_account_owner uuid default null)
returns uuid language sql stable as $$
  select coalesce(
    -- The account owner, but only if they can actually approve.
    (select id from people
      where id = p_account_owner and role in ('owner', 'admin')),
    -- Otherwise the first owner, then any admin.
    (select id from people
      where role in ('owner', 'admin') and coalesce(is_active, true)
      order by case role when 'owner' then 0 else 1 end, created_at
      limit 1));
$$;

-- 00000000000062_review_owner.sql
create or replace function gtm_stage_review_task() returns trigger
language plpgsql as $$
declare
  reviewer uuid;
begin
  if new.stage = 'pending_review'
     and (tg_op = 'INSERT' or old.stage is distinct from 'pending_review') then
    reviewer := gtm_reviewer(new.owner_id);
    perform open_review_task(
      format('Review account: %s', new.company),
      reviewer, 'gtm_account_stage', new.id, new.priority);
  end if;

  -- Leaving the stage means the decision was made, whichever way it went.
  if tg_op = 'UPDATE' and old.stage = 'pending_review'
     and new.stage is distinct from 'pending_review' then
    perform close_review_task('gtm_account_stage', new.id);
  end if;

  return null;
end;
$$;

-- 00000000000062_review_owner.sql
drop trigger if exists gtm_stage_review_trg on gtm_accounts;

-- 00000000000062_review_owner.sql
create trigger gtm_stage_review_trg
  after insert or update on gtm_accounts
  for each row execute function gtm_stage_review_task();

-- 00000000000062_review_owner.sql
create or replace function review_task_for_copy() returns trigger
language plpgsql as $$
declare
  acct record;
begin
  if new.status = 'ready_for_review'
     and old.status is distinct from 'ready_for_review' then
    select a.id, a.company, a.owner_id, a.priority into acct
      from gtm_accounts a where a.id = new.account_id;

    if acct.id is not null then
      perform open_review_task(
        format('Review outreach copy: %s', acct.company),
        gtm_reviewer(acct.owner_id), 'gtm_account', acct.id, acct.priority);
    end if;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform close_review_task('gtm_account', new.account_id);
  end if;

  return null;
end;
$$;

-- 00000000000062_review_owner.sql
update tasks t
   set assignee_id = gtm_reviewer(a.owner_id)
  from gtm_accounts a
 where t.source_id = a.id
   and t.source_kind in ('gtm_account', 'gtm_account_stage')
   and t.status <> 'done'
   and t.archived_at is null
   and t.deleted_at is null
   and t.assignee_id not in (
     select id from people where role in ('owner', 'admin'));

-- 00000000000062_review_owner.sql
do $$
declare a record;
begin
  for a in
    select id, company, owner_id, priority from gtm_accounts
     where stage = 'pending_review'
       and archived_at is null and deleted_at is null
  loop
    perform open_review_task(
      format('Review account: %s', a.company),
      gtm_reviewer(a.owner_id), 'gtm_account_stage', a.id, a.priority);
  end loop;
end;
$$;

-- 00000000000063_sprint_model.sql
create type search_difficulty as enum ('easy', 'medium', 'hard');

-- 00000000000063_sprint_model.sql
alter table requisitions
  add column if not exists search_difficulty search_difficulty not null default 'medium',
  
  
  add column if not exists sprint_target_override int
    check (sprint_target_override is null or sprint_target_override between 1 and 20),
  add column if not exists sourcing_paused_at timestamptz,
  
  
  
  add column if not exists sourcing_was_paused boolean not null default false;

-- 00000000000063_sprint_model.sql
create or replace function sprint_default(p_difficulty search_difficulty)
returns int language sql immutable as $$
  select case p_difficulty
    when 'easy'   then 5
    when 'medium' then 4
    when 'hard'   then 3
  end;
$$;

-- 00000000000063_sprint_model.sql
create or replace function sprint_target(p_req requisitions)
returns int language sql stable as $$
  select coalesce(
    p_req.sprint_target_override,
    sprint_default(p_req.search_difficulty)
      + ceil((greatest(p_req.openings, 1) - 1)
             * sprint_default(p_req.search_difficulty) / 2.0)::int);
$$;

-- 00000000000063_sprint_model.sql
create or replace function active_candidate_count(p_req requisitions)
returns int language sql stable as $$
  select greatest(coalesce(p_req.viable_candidates, 0), 0);
$$;

-- 00000000000063_sprint_model.sql
create or replace function requisition_next_action(p_req requisitions)
returns text language sql stable as $$
  select case
    -- Closed work has no next action.
    when p_req.status in ('filled', 'closed_lost', 'withdrawn') then null

    -- An offer is the search. Everything else waits.
    when p_req.best_stage = 'offer' then 'Manage offer'

    -- The client has gone quiet on people already in front of them. More
    -- candidates will not fix that.
    when p_req.feedback_days is not null and p_req.feedback_days > 5
      then 'Follow up, client feedback'

    -- Enough people in play, and they are moving.
    when active_candidate_count(p_req) >= sprint_target(p_req)
         and p_req.best_stage in ('interview', 'round_two_plus', 'final')
      then 'Monitor interviews'

    -- Enough in play, nothing moving yet: stop sourcing and wait.
    when active_candidate_count(p_req) >= sprint_target(p_req)
      then 'Pause, pipeline full'

    -- An old search with nothing in it is not a sourcing problem.
    when p_req.date_received < current_date - 30
         and active_candidate_count(p_req) = 0
      then 'Recalibrate search'

    -- Reached target once and fell back: reopening, not starting.
    when p_req.sourcing_was_paused
      then format('Reopen, need %s more',
                  sprint_target(p_req) - active_candidate_count(p_req))

    else format('Source, need %s more',
                sprint_target(p_req) - active_candidate_count(p_req))
  end;
$$;

-- 00000000000063_sprint_model.sql
create or replace function requisition_sourcing_state(p_req requisitions)
returns text language sql stable as $$
  select case
    when p_req.status in ('filled', 'closed_lost', 'withdrawn') then 'closed'
    when p_req.best_stage = 'offer' then 'offer'
    when p_req.feedback_days is not null and p_req.feedback_days > 5
      then 'awaiting_client'
    when p_req.best_stage in ('interview', 'round_two_plus', 'final')
      then 'interviewing'
    when active_candidate_count(p_req) >= sprint_target(p_req) then 'paused'
    when p_req.date_received < current_date - 30
         and active_candidate_count(p_req) = 0 then 'at_risk'
    when p_req.sourcing_was_paused then 'reopen'
    else 'sourcing'
  end;
$$;

-- 00000000000063_sprint_model.sql
create or replace function track_sourcing_state() returns trigger
language plpgsql as $$
begin
  if active_candidate_count(new) >= sprint_target(new) then
    if new.sourcing_paused_at is null then
      new.sourcing_paused_at := now();
    end if;
    new.sourcing_was_paused := true;
  elsif new.sourcing_paused_at is not null then
    -- Fell back below target. The pause ends, but the fact that it happened
    -- is what distinguishes reopening from starting.
    new.sourcing_paused_at := null;
  end if;
  return new;
end;
$$;

-- 00000000000063_sprint_model.sql
drop trigger if exists req_sourcing_state on requisitions;

-- 00000000000063_sprint_model.sql
create trigger req_sourcing_state
  before insert or update on requisitions
  for each row execute function track_sourcing_state();

-- 00000000000063_sprint_model.sql
create or replace view requisition_board as
select
  r.*,
  sprint_target(r.*)              as sprint_target,
  active_candidate_count(r.*)     as active_candidates,
  requisition_next_action(r.*)    as next_action,
  requisition_sourcing_state(r.*) as sourcing_state,
  greatest(sprint_target(r.*) - active_candidate_count(r.*), 0) as candidates_needed,
  (current_date - r.date_received) as age_days
from requisitions r;

-- 00000000000063_sprint_model.sql
create or replace function requisition_audit() returns trigger
language plpgsql as $$
declare
  actor uuid := mc.uid();
  actor_name text;
begin
  select name into actor_name from people where id = actor;
  actor_name := coalesce(actor_name, 'The system');

  if new.openings is distinct from old.openings then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'openings_changed', 'openings',
            old.openings::text, new.openings::text,
            format('%s changed openings on %s from %s to %s',
                   actor_name, new.role_title, old.openings, new.openings));
  end if;

  if new.viable_candidates is distinct from old.viable_candidates then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'pipeline_changed', 'viable_candidates',
            old.viable_candidates::text, new.viable_candidates::text,
            format('%s changed the pipeline on %s from %s to %s',
                   actor_name, new.role_title,
                   old.viable_candidates, new.viable_candidates));
  end if;

  if new.search_difficulty is distinct from old.search_difficulty then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'difficulty_changed', 'search_difficulty',
            old.search_difficulty::text, new.search_difficulty::text,
            format('%s changed difficulty on %s from %s to %s',
                   actor_name, new.role_title,
                   old.search_difficulty, new.search_difficulty));
  end if;

  -- The pause and reopen are automatic, so they are the events most worth
  -- recording: nobody pressed anything, and the trail is the only evidence.
  if new.sourcing_paused_at is not null and old.sourcing_paused_at is null then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('requisition', new.id, actor, 'sourcing_paused',
            format('Pipeline on %s reached its target, sourcing paused',
                   new.role_title));
  elsif new.sourcing_paused_at is null and old.sourcing_paused_at is not null then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('requisition', new.id, actor, 'sourcing_reopened',
            format('Pipeline on %s fell below target, sourcing reopened',
                   new.role_title));
  end if;

  return null;
end;
$$;

-- 00000000000063_sprint_model.sql
drop trigger if exists req_audit on requisitions;

-- 00000000000063_sprint_model.sql
create trigger req_audit
  after update on requisitions
  for each row execute function requisition_audit();

-- 00000000000064_one_review_per_account.sql
update tasks t
   set status = 'done'
 where t.source_kind = 'gtm_account'
   and t.status <> 'done'
   and exists (
     select 1 from tasks s
      where s.source_kind = 'gtm_account_stage'
        and s.source_id = t.source_id
        and s.status <> 'done'
        and s.archived_at is null and s.deleted_at is null);

-- 00000000000064_one_review_per_account.sql
create or replace function review_task_for_copy() returns trigger
language plpgsql as $$
declare
  acct record;
begin
  if new.status = 'ready_for_review'
     and old.status is distinct from 'ready_for_review' then
    select a.id, a.company, a.owner_id, a.priority into acct
      from gtm_accounts a where a.id = new.account_id;

    if acct.id is not null then
      perform open_review_task(
        format('Review account: %s', acct.company),
        gtm_reviewer(acct.owner_id), 'gtm_account_stage', acct.id, acct.priority);
    end if;
  end if;

  -- Approving the copy is approving the account, so it closes the review.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform close_review_task('gtm_account_stage', new.account_id);
  end if;

  return null;
end;
$$;

-- 00000000000065_outreach_variations.sql
create table if not exists outreach_variations (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references outreach_drafts(id) on delete cascade,
  
  slot          int not null check (slot between 1 and 9),
  subject       text,
  hook          text,
  body          text,
  ps            text,
  
  
  revision      int not null default 1,
  created_by    uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (draft_id, revision, slot)
);

-- 00000000000065_outreach_variations.sql
create index if not exists outreach_variations_draft
  on outreach_variations (draft_id, revision, slot);

-- 00000000000065_outreach_variations.sql
alter table outreach_drafts
  
  add column if not exists final_subject text,
  add column if not exists final_body    text,
  add column if not exists final_ps      text,
  
  add column if not exists final_from_variation uuid
    references outreach_variations(id) on delete set null,
  add column if not exists approved_by uuid references people(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists revision    int not null default 1,
  
  
  
  add column if not exists research_url text,
  add column if not exists research_added_by uuid references people(id) on delete set null,
  add column if not exists research_added_at timestamptz;

-- 00000000000065_outreach_variations.sql
create or replace function outreach_handoff() returns trigger
language plpgsql as $$
declare
  acct    record;
  builder uuid;
  person  text;
begin
  select a.id, a.company, a.researcher_id, a.owner_id, a.priority into acct
    from gtm_accounts a where a.id = new.account_id;
  if acct.id is null then return null; end if;

  -- The person who prepared it is the one who acts on the outcome.
  builder := coalesce(acct.researcher_id, acct.owner_id);
  select name into person from gtm_contacts where id = new.contact_id;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform close_review_task('gtm_account_stage', acct.id);
    perform open_review_task(
      format('Build approved outreach: %s%s', acct.company,
             coalesce(', ' || person, '')),
      builder, 'gtm_build', new.id, acct.priority);
  end if;

  if new.status = 'needs_revision'
     and old.status is distinct from 'needs_revision' then
    perform close_review_task('gtm_account_stage', acct.id);
    perform open_review_task(
      format('Changes requested: %s%s', acct.company,
             coalesce(', ' || person, '')),
      builder, 'gtm_changes', new.id, acct.priority);
  end if;

  -- Coming back for review closes whichever side of the handoff was open.
  if new.status = 'ready_for_review'
     and old.status is distinct from 'ready_for_review' then
    perform close_review_task('gtm_build', new.id);
    perform close_review_task('gtm_changes', new.id);
  end if;

  return null;
end;
$$;

-- 00000000000065_outreach_variations.sql
drop trigger if exists outreach_handoff_trg on outreach_drafts;

-- 00000000000065_outreach_variations.sql
create trigger outreach_handoff_trg
  after update on outreach_drafts
  for each row execute function outreach_handoff();

-- 00000000000065_outreach_variations.sql
create or replace function stamp_outreach_approval() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_by := coalesce(new.approved_by, mc.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  if new.research_url is not null
     and (old.research_url is null or old.research_url is distinct from new.research_url) then
    new.research_added_by := coalesce(mc.uid(), new.research_added_by);
    new.research_added_at := now();
  end if;
  return new;
end;
$$;

-- 00000000000065_outreach_variations.sql
drop trigger if exists outreach_approval_stamp on outreach_drafts;

-- 00000000000065_outreach_variations.sql
create trigger outreach_approval_stamp
  before update on outreach_drafts
  for each row execute function stamp_outreach_approval();

-- 00000000000066_dedup_by_entity.sql
alter table notifications add column if not exists stmt_at timestamptz;

-- 00000000000066_dedup_by_entity.sql
alter table slack_outbox  add column if not exists stmt_at timestamptz;

-- 00000000000066_dedup_by_entity.sql
create or replace function notify(
  p_person   uuid,
  p_kind     notify_kind,
  p_title    text,
  p_body     text,
  p_url      text,
  p_entity   text,
  p_entity_id uuid,
  p_actor    uuid
) returns void language plpgsql security definer as $$
declare
  slack_id text;
  already  boolean;
begin
  if p_person is null or p_person = p_actor then return; end if;

  -- Anything already sent to this person about this entity in THIS statement
  -- belongs to the same action, whatever its kind.
  select exists (
    select 1 from notifications
     where person_id = p_person
       and entity_id = p_entity_id
       and stmt_at = statement_timestamp()
  ) into already;

  if not already then
    select slack_user_id into slack_id from people where id = p_person;
    if slack_id is not null then
      -- Scoped to THIS entity: task_id only identifies tasks, so the url
      -- (which always contains the entity id) is what makes the check
      -- specific for GTM accounts and content.
      -- Scoped to the entity, not to an exact url. Two messages about one
      -- task carry different links ("assigned you" points at the task,
      -- "ready for review" at the review), so matching urls let the
      -- duplicate through whenever the notifications check above missed.
      select exists (
        select 1 from slack_outbox o
         where o.target_slack_id = slack_id
           and o.stmt_at = statement_timestamp()
           and coalesce(o.url, '') like '%' || p_entity_id::text || '%'
      ) into already;
    end if;
  end if;

  if already then return; end if;

  select slack_user_id into slack_id from people where id = p_person;

  if wants_notification(p_person, p_kind, 'in_app') then
    insert into notifications (person_id, kind, title, body, url,
                               entity_type, entity_id, actor_id, stmt_at)
    values (p_person, p_kind, p_title, p_body, p_url,
            p_entity, p_entity_id, p_actor, statement_timestamp());
  end if;

  if wants_notification(p_person, p_kind, 'slack')
     and coalesce((select is_connected from slack_settings where id = 1), false)
     and slack_id is not null then
    insert into slack_outbox (kind, target_slack_id, text, url, task_id, stmt_at)
    values (p_kind::text, slack_id, p_title, p_url,
            case when p_entity = 'task' then p_entity_id else null end,
            statement_timestamp());
  end if;
end;
$$;

-- 00000000000067_req_lifecycle.sql
do $$ begin
  create type req_outcome as enum (
  'alac_placement',      -- we filled it. The win.
  'internal_hire',       -- the client's own team filled it
  'other_agency',        -- somebody else filled it
  'referral',            -- filled through the client's network
  'cancelled',           -- the role stopped existing
  'no_hire',             -- ran its course, nobody hired
  'lost_engagement',     -- the job survived, the relationship did not
    'other');
exception when duplicate_object then null;
end $$;

-- 00000000000067_req_lifecycle.sql
alter table requisitions
  add column if not exists outcome_kind    req_outcome,
  add column if not exists outcome_detail  text,   
  add column if not exists closed_on       date,
  add column if not exists closed_by       uuid references people(id) on delete set null,
  
  add column if not exists paused_on       date,
  add column if not exists pause_reason    text,
  add column if not exists expected_reopen date,
  add column if not exists reopened_on     date,
  
  add column if not exists engagement_type text,   
  add column if not exists exclusivity     text,   
  add column if not exists hiring_manager  text,
  add column if not exists location        text,
  add column if not exists notes           text;

-- 00000000000067_req_lifecycle.sql
create table if not exists placements (
  id              uuid primary key default gen_random_uuid(),
  requisition_id  uuid not null references requisitions(id) on delete cascade,
  candidate_name  text not null,
  
  filled_by       req_outcome not null default 'alac_placement',
  filled_detail   text,
  accepted_on     date,
  start_on        date,
  base_comp       numeric(12,2),
  fee             numeric(12,2),
  recruiter_id    uuid references people(id) on delete set null,
  notes           text,
  created_by      uuid references people(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- 00000000000067_req_lifecycle.sql
create index if not exists placements_req on placements (requisition_id);

-- 00000000000067_req_lifecycle.sql
create index if not exists placements_recruiter on placements (recruiter_id, accepted_on desc);

-- 00000000000067_req_lifecycle.sql
create or replace function placements_made(p_req_id uuid)
returns int language sql stable as $$
  select count(*)::int from placements where requisition_id = p_req_id;
$$;

-- 00000000000067_req_lifecycle.sql
create or replace function alac_placements(p_req_id uuid)
returns int language sql stable as $$
  select count(*)::int from placements
   where requisition_id = p_req_id and filled_by = 'alac_placement';
$$;

-- 00000000000067_req_lifecycle.sql
create or replace function close_when_fully_placed() returns trigger
language plpgsql as $$
declare
  req record;
  made int;
begin
  select * into req from requisitions where id = new.requisition_id;
  if req.id is null then return null; end if;

  made := placements_made(new.requisition_id);

  if made >= req.openings and req.status not in ('filled', 'closed_lost', 'withdrawn') then
    update requisitions
       set status = 'filled',
           closed_on = coalesce(closed_on, current_date),
           -- The parent records the dominant outcome; the per-seat truth
           -- lives in placements.
           outcome_kind = coalesce(outcome_kind,
             case when alac_placements(new.requisition_id) > 0
                  then 'alac_placement'::req_outcome
                  else 'other'::req_outcome end)
     where id = new.requisition_id;
  end if;

  return null;
end;
$$;

-- 00000000000067_req_lifecycle.sql
drop trigger if exists placement_closes_req on placements;

-- 00000000000067_req_lifecycle.sql
create trigger placement_closes_req
  after insert on placements
  for each row execute function close_when_fully_placed();

-- 00000000000067_req_lifecycle.sql
create or replace function req_status_work() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('paused', 'on_hold', 'filled', 'closed_lost', 'withdrawn') then
      perform close_review_task('requisition', new.id);
    end if;

    if new.status = 'paused' and old.status <> 'paused' then
      new.paused_on := coalesce(new.paused_on, current_date);
    end if;

    -- Reopening clears the pause so the sprint model starts fresh.
    if old.status in ('paused', 'on_hold') and new.status = 'active' then
      new.reopened_on := current_date;
      new.paused_on := null;
      new.sourcing_paused_at := null;
      new.sourcing_was_paused := false;
    end if;

    if new.status in ('filled', 'closed_lost', 'withdrawn') then
      new.closed_on := coalesce(new.closed_on, current_date);
      new.closed_by := coalesce(new.closed_by, mc.uid());
    end if;
  end if;
  return new;
end;
$$;

-- 00000000000067_req_lifecycle.sql
drop trigger if exists req_status_work_trg on requisitions;

-- 00000000000067_req_lifecycle.sql
create trigger req_status_work_trg
  before update on requisitions
  for each row execute function req_status_work();

-- 00000000000067_req_lifecycle.sql
create or replace function requisition_next_action(p_req requisitions)
returns text language sql stable as $$
  select case
    when p_req.status = 'paused'      then 'Role paused'
    when p_req.status = 'on_hold'     then 'On hold'
    when p_req.status = 'filled'      then 'Role filled'
    when p_req.status = 'closed_lost' then
      case p_req.outcome_kind
        when 'other_agency'    then 'Filled elsewhere'
        when 'internal_hire'   then 'Filled internally'
        when 'cancelled'       then 'Role cancelled'
        when 'lost_engagement' then 'Engagement lost'
        else 'Search closed' end
    when p_req.status = 'withdrawn'     then 'Withdrawn'
    when p_req.status = 'not_activated' then 'Awaiting agreement'

    when p_req.best_stage = 'offer' then 'Manage offer'
    when p_req.feedback_days is not null and p_req.feedback_days > 5
      then 'Follow up client'
    when active_candidate_count(p_req) >= sprint_target(p_req)
         and p_req.best_stage in ('interview', 'round_two_plus', 'final')
      then 'Interviewing'
    when active_candidate_count(p_req) >= sprint_target(p_req)
      then 'Pause sourcing'
    when p_req.date_received < current_date - 30
         and active_candidate_count(p_req) = 0
      then 'Recalibrate search'
    when p_req.sourcing_was_paused
      then format('Reopen, source %s more',
                  sprint_target(p_req) - active_candidate_count(p_req))
    else format('Source %s more',
                sprint_target(p_req) - active_candidate_count(p_req))
  end;
$$;

-- 00000000000067_req_lifecycle.sql
drop view if exists requisition_board;

-- 00000000000067_req_lifecycle.sql
create view requisition_board as
select
  r.*,
  sprint_target(r.*)              as sprint_target,
  active_candidate_count(r.*)     as active_candidates,
  requisition_next_action(r.*)    as next_action,
  requisition_sourcing_state(r.*) as sourcing_state,
  greatest(sprint_target(r.*) - active_candidate_count(r.*), 0) as candidates_needed,
  placements_made(r.id)           as placements_made,
  alac_placements(r.id)           as alac_placements,
  greatest(r.openings - placements_made(r.id), 0) as openings_remaining,
  (current_date - r.date_received) as age_days,
  
  case when r.closed_on is not null then (r.closed_on - r.date_received) end as days_to_close
from requisitions r;

-- 00000000000067_req_lifecycle.sql
create or replace function requisition_terms_audit() returns trigger
language plpgsql as $$
declare
  actor uuid := mc.uid();
  who text;
begin
  select name into who from people where id = actor;
  who := coalesce(who, 'The system');

  if new.exclusivity is distinct from old.exclusivity then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'exclusivity_changed', 'exclusivity',
            old.exclusivity, new.exclusivity,
            format('%s changed exclusivity on %s from %s to %s', who,
                   new.role_title, coalesce(old.exclusivity, 'unset'),
                   coalesce(new.exclusivity, 'unset')));
  end if;

  if new.status is distinct from old.status then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'status_changed', 'status',
            old.status::text, new.status::text,
            format('%s moved %s from %s to %s', who, new.role_title,
                   old.status, new.status));
  end if;

  if new.outcome_kind is distinct from old.outcome_kind
     and new.outcome_kind is not null then
    insert into activity (entity_type, entity_id, actor_id, verb, field,
                          from_value, to_value, summary)
    values ('requisition', new.id, actor, 'outcome_recorded', 'outcome_kind',
            old.outcome_kind::text, new.outcome_kind::text,
            format('%s closed %s as %s', who, new.role_title,
                   replace(new.outcome_kind::text, '_', ' ')));
  end if;

  return null;
end;
$$;

-- 00000000000067_req_lifecycle.sql
drop trigger if exists req_terms_audit on requisitions;

-- 00000000000067_req_lifecycle.sql
create trigger req_terms_audit
  after update on requisitions
  for each row execute function requisition_terms_audit();

-- 00000000000067_req_lifecycle.sql
create or replace function placement_activity() returns trigger
language plpgsql as $$
declare
  req record;
  who text;
begin
  select role_title, company into req from requisitions where id = new.requisition_id;
  select name into who from people where id = new.recruiter_id;

  if new.filled_by = 'alac_placement' then
    insert into activity (entity_type, entity_id, actor_id, verb, summary)
    values ('requisition', new.requisition_id, coalesce(new.recruiter_id, mc.uid()),
            'placement',
            format('Placed %s at %s, %s%s', new.candidate_name, req.company,
                   req.role_title,
                   case when who is null then '' else ' (' || who || ')' end));
  end if;
  return null;
end;
$$;

-- 00000000000067_req_lifecycle.sql
drop trigger if exists placement_activity_trg on placements;

-- 00000000000067_req_lifecycle.sql
create trigger placement_activity_trg
  after insert on placements
  for each row execute function placement_activity();

-- 00000000000068_functions_delivery_personal.sql
insert into functions (key, name, color, sort_order)
select 'delivery', 'Delivery', '#22C55E',
       coalesce((select max(sort_order) from functions), 0) + 1
 where not exists (select 1 from functions where key = 'delivery');

-- 00000000000068_functions_delivery_personal.sql
insert into functions (key, name, color, sort_order)
select 'personal', 'Personal', '#94A3B8',
       coalesce((select max(sort_order) from functions), 0) + 1
 where not exists (select 1 from functions where key = 'personal');

-- 00000000000069_ideas.sql
create type idea_status as enum (
  'new', 'reviewing', 'planned', 'in_progress', 'implemented', 'declined'
);

-- 00000000000069_ideas.sql
create type idea_impact as enum ('low', 'medium', 'high', 'critical');

-- 00000000000069_ideas.sql
create table if not exists ideas (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (btrim(title) <> ''),
  
  
  problem       text,
  proposal      text,
  category      text,
  impact        idea_impact not null default 'medium',
  status        idea_status not null default 'new',
  
  
  is_priority   boolean not null default false,
  owner_id      uuid references people(id) on delete set null,
  submitted_by  uuid references people(id) on delete set null,
  
  
  outcome_note  text,
  implemented_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  deleted_at    timestamptz
);

-- 00000000000069_ideas.sql
create index if not exists ideas_status on ideas (status, created_at desc)
  where deleted_at is null;

-- 00000000000069_ideas.sql
create table if not exists idea_votes (
  idea_id    uuid not null references ideas(id) on delete cascade,
  person_id  uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, person_id)
);

-- 00000000000069_ideas.sql
create or replace view ideas_board as
select
  i.*,
  (select count(*)::int from idea_votes v where v.idea_id = i.id) as votes,
  p.name as submitted_by_name,
  o.name as owner_name
from ideas i
left join people p on p.id = i.submitted_by
left join people o on o.id = i.owner_id
where i.deleted_at is null;

-- 00000000000069_ideas.sql
create trigger ideas_touch before update on ideas
  for each row execute function touch_updated_at();

-- 00000000000069_ideas.sql
create or replace function idea_status_notify() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.submitted_by is not null
     and new.status in ('planned', 'in_progress', 'implemented', 'declined') then
    perform notify(
      new.submitted_by, 'task_assigned',
      case new.status
        when 'implemented' then format('Shipped: %s', new.title)
        when 'declined'    then format('Not going ahead: %s', new.title)
        when 'in_progress' then format('Started: %s', new.title)
        else format('Planned: %s', new.title)
      end,
      coalesce(new.outcome_note, new.proposal),
      '/ideas?idea=' || new.id, 'idea', new.id, mc.uid());
  end if;

  if new.status = 'implemented' and old.status is distinct from 'implemented' then
    new.implemented_at := coalesce(new.implemented_at, now());
  end if;

  return new;
end;
$$;

-- 00000000000069_ideas.sql
drop trigger if exists idea_status_notify_trg on ideas;

-- 00000000000069_ideas.sql
create trigger idea_status_notify_trg
  before update on ideas
  for each row execute function idea_status_notify();

-- 00000000000070_outreach_per_contact.sql
alter table outreach_drafts
  add column if not exists final_note text;

-- 00000000000070_outreach_per_contact.sql
update outreach_drafts d
   set contact_id = m.contact_id
  from (
    select d2.id as draft_id, (array_agg(c.id))[1] as contact_id, count(*) as n
      from outreach_drafts d2
      join gtm_contacts c on c.account_id = d2.account_id
     where d2.contact_id is null
       and d2.body is not null
       
       and d2.body ~* ('\y' || split_part(c.name, ' ', 1) || '\y')
     group by d2.id
    having count(*) = 1
  ) m
 where d.id = m.draft_id;

-- 00000000000070_outreach_per_contact.sql
create index if not exists outreach_by_contact
  on outreach_drafts (contact_id, updated_at desc)
  where contact_id is not null;

-- 00000000000071_sops_and_schedule.sql
create table if not exists sops (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  
  url          text not null,
  summary      text,
  
  
  function_id  text references functions(key) on delete set null,
  
  is_essential boolean not null default false,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 00000000000071_sops_and_schedule.sql
create index if not exists sops_function_idx on sops (function_id) where is_active;

-- 00000000000071_sops_and_schedule.sql
drop trigger if exists sops_touch on sops;

-- 00000000000071_sops_and_schedule.sql
create trigger sops_touch before update on sops
  for each row execute function touch_updated_at();

-- 00000000000071_sops_and_schedule.sql
alter table recurring_tasks
  add column if not exists week_of_month int
    check (week_of_month between -1 and 4 and week_of_month <> 0);

-- 00000000000071_sops_and_schedule.sql
alter table recurring_tasks
  add column if not exists sop_id uuid references sops(id) on delete set null;

-- 00000000000071_sops_and_schedule.sql
alter table tasks
  add column if not exists sop_id uuid references sops(id) on delete set null;

-- 00000000000071_sops_and_schedule.sql
create or replace function nth_weekday(
  in_month date, dow int, nth int
) returns date language plpgsql immutable as $$
declare
  first_of  date := date_trunc('month', in_month)::date;
  last_of   date := (date_trunc('month', in_month) + interval '1 month - 1 day')::date;
  candidate date;
begin
  if nth = -1 then
    -- Step back from the month's end to the most recent matching weekday.
    candidate := last_of - ((extract(dow from last_of)::int - dow + 7) % 7);
  else
    -- Step forward from the first to the earliest matching weekday, then add
    -- whole weeks.
    candidate := first_of + ((dow - extract(dow from first_of)::int + 7) % 7);
    candidate := candidate + (nth - 1) * 7;
    -- A fifth Tuesday does not exist in every month; fall back to the fourth.
    if candidate > last_of then candidate := candidate - 7; end if;
  end if;
  return candidate;
end;
$$;

-- 00000000000071_sops_and_schedule.sql
create or replace function next_recurrence(r recurring_tasks, from_date date)
returns date language plpgsql immutable as $$
declare
  d     date;
  month date;
begin
  case r.frequency
    when 'daily' then
      d := from_date + 1;
    when 'weekly' then
      d := from_date + 7;
    when 'biweekly' then
      d := from_date + 14;
    when 'monthly' then
      month := (date_trunc('month', from_date) + interval '1 month')::date;

      if r.week_of_month is not null and r.day_of_week is not null then
        d := nth_weekday(month, r.day_of_week, r.week_of_month);
      elsif r.day_of_month is not null then
        -- Clamp to the month's length so the 31st does not skip February.
        d := date_trunc('month', month)::date
             + (least(r.day_of_month,
                      extract(day from (date_trunc('month', month)
                        + interval '1 month - 1 day'))::int) - 1);
      else
        d := (from_date + interval '1 month')::date;
      end if;
    else
      d := from_date + 7;
  end case;
  return d;
end;
$$;

-- 00000000000071_sops_and_schedule.sql
create or replace function align_recurring_due() returns trigger
language plpgsql as $$
declare
  candidate date;
  today     date := current_date;
begin
  if new.frequency = 'monthly' then
    if new.week_of_month is not null and new.day_of_week is not null then
      candidate := nth_weekday(today, new.day_of_week, new.week_of_month);
    elsif new.day_of_month is not null then
      candidate := date_trunc('month', today)::date
                   + (least(new.day_of_month,
                            extract(day from (date_trunc('month', today)
                              + interval '1 month - 1 day'))::int) - 1);
    end if;
  elsif new.day_of_week is not null
        and new.frequency in ('weekly', 'biweekly') then
    candidate := today + ((new.day_of_week - extract(dow from today)::int + 7) % 7);
  end if;

  -- A date already gone this month belongs to the next one.
  if candidate is not null then
    if candidate < today then
      new.next_due := next_recurrence(new, candidate);
    else
      new.next_due := candidate;
    end if;
  end if;

  return new;
end;
$$;

-- 00000000000071_sops_and_schedule.sql
drop trigger if exists recurring_align_trg on recurring_tasks;

-- 00000000000071_sops_and_schedule.sql
create trigger recurring_align_trg
  before insert or update of frequency, day_of_week, day_of_month, week_of_month
  on recurring_tasks
  for each row execute function align_recurring_due();

-- 00000000000071_sops_and_schedule.sql
create or replace function generate_recurring(r_id uuid, due date)
returns uuid language plpgsql as $$
declare
  r        recurring_tasks%rowtype;
  new_id   uuid;
  item     text;
  i        int := 0;
begin
  select * into r from recurring_tasks where id = r_id;
  if not found or not r.is_active then return null; end if;

  select id into new_id from tasks
   where recurring_id = r_id and due_date = due limit 1;
  if new_id is not null then return new_id; end if;

  insert into tasks (project_id, title, notes, status, priority,
                     assignee_id, due_date, recurring_id, sop_id)
  values (r.project_id, r.title, r.notes, 'todo', r.priority,
          r.assignee_id, due, r.id, r.sop_id)
  returning id into new_id;

  foreach item in array r.checklist loop
    insert into checklist_items (task_id, content, position)
    values (new_id, item, i);
    i := i + 1;
  end loop;

  update recurring_tasks
     set next_due = next_recurrence(r, due)
   where id = r_id;

  return new_id;
end;
$$;

-- 00000000000072_recurrence_rules.sql
alter type recurrence add value if not exists 'quarterly';

-- 00000000000072_recurrence_rules.sql
alter type recurrence add value if not exists 'custom';

-- 00000000000072_recurrence_rules.sql
alter table recurring_tasks
  
  add column if not exists interval_n int not null default 1
    check (interval_n between 1 and 52),
  
  
  add column if not exists starts_on date not null default current_date,
  
  add column if not exists ends_on date,
  add column if not exists ends_after int check (ends_after > 0),
  
  
  add column if not exists occurrences_made int not null default 0,
  add column if not exists notes text;

-- 00000000000072_recurrence_rules.sql
do $$ begin
  create type recurrence_kind as enum
    ('weekday', 'day_of_month', 'last_day', 'nth_weekday');
exception when duplicate_object then null;
end $$;

-- 00000000000072_recurrence_rules.sql
create table if not exists recurrence_rules (
  id            uuid primary key default gen_random_uuid(),
  recurring_id  uuid not null references recurring_tasks(id) on delete cascade,
  kind          recurrence_kind not null,
  
  day_of_week   int check (day_of_week between 0 and 6),
  
  
  day_of_month  int check (day_of_month between 1 and 31),
  
  week_of_month int check (week_of_month between -1 and 4 and week_of_month <> 0),
  
  
  next_due      date,
  created_at    timestamptz not null default now(),

  
  
  constraint rule_shape check (
    case kind
      when 'weekday'      then day_of_week is not null
      when 'day_of_month' then day_of_month is not null
      when 'last_day'     then true
      when 'nth_weekday'  then day_of_week is not null
                               and week_of_month is not null
    end
  )
);

-- 00000000000072_recurrence_rules.sql
create index if not exists recurrence_rules_task_idx
  on recurrence_rules (recurring_id);

-- 00000000000072_recurrence_rules.sql
delete from tasks t
 using tasks dup
 where t.recurring_id is not null
   and t.recurring_id = dup.recurring_id
   and t.due_date = dup.due_date
   and t.id > dup.id;

-- 00000000000072_recurrence_rules.sql
create unique index if not exists tasks_recurring_due_idx
  on tasks (recurring_id, due_date)
  where recurring_id is not null;

-- 00000000000072_recurrence_rules.sql
create or replace function rule_next_on_or_after(
  r recurrence_rules, from_date date
) returns date language plpgsql immutable as $$
declare
  month_start date := date_trunc('month', from_date)::date;
  candidate   date;
begin
  if r.kind = 'weekday' then
    -- The next occurrence of that weekday, today included.
    return from_date
           + ((r.day_of_week - extract(dow from from_date)::int + 7) % 7);
  end if;

  -- The month-anchored kinds: try this month, then next.
  for i in 0..1 loop
    if r.kind = 'day_of_month' then
      candidate := month_start
        + (least(r.day_of_month,
                 extract(day from (month_start + interval '1 month - 1 day'))::int) - 1);
    elsif r.kind = 'last_day' then
      candidate := (month_start + interval '1 month - 1 day')::date;
    else -- nth_weekday
      candidate := nth_weekday(month_start, r.day_of_week, r.week_of_month);
    end if;

    if candidate >= from_date then return candidate; end if;
    month_start := (month_start + interval '1 month')::date;
  end loop;

  return candidate;
end;
$$;

-- 00000000000072_recurrence_rules.sql
create or replace function rule_advance(
  r recurrence_rules, task recurring_tasks, after_date date
) returns date language plpgsql immutable as $$
declare
  probe date;
begin
  case task.frequency
    when 'daily'     then probe := after_date + 1;
    when 'weekly'    then probe := after_date + (7 * task.interval_n);
    when 'biweekly'  then probe := after_date + 14;
    when 'monthly'   then probe := (date_trunc('month', after_date)
                                    + (task.interval_n || ' month')::interval)::date;
    when 'quarterly' then probe := (date_trunc('month', after_date)
                                    + interval '3 month')::date;
    when 'custom'    then
      -- A custom rule repeats over whichever unit its shape implies: a
      -- weekday rule counts weeks, a month-anchored rule counts months.
      if r.kind = 'weekday' then probe := after_date + (7 * task.interval_n);
      else probe := (date_trunc('month', after_date)
                     + (task.interval_n || ' month')::interval)::date;
      end if;
    else probe := after_date + 7;
  end case;

  return rule_next_on_or_after(r, probe);
end;
$$;

-- 00000000000072_recurrence_rules.sql
create or replace function sync_recurring_schedule(r_id uuid)
returns void language plpgsql as $$
declare
  task recurring_tasks%rowtype;
  rule recurrence_rules%rowtype;
  base date;
begin
  select * into task from recurring_tasks where id = r_id;
  if not found then return; end if;

  base := greatest(task.starts_on, current_date);

  for rule in select * from recurrence_rules where recurring_id = r_id loop
    -- Only seed a rule that has no date yet. One already set is either ahead
    -- of us, or behind because it is owed work the scheduler has not caught
    -- up on, and dragging that forward would swallow the missed occurrences.
    if rule.next_due is null then
      update recurrence_rules
         set next_due = rule_next_on_or_after(rule, base)
       where id = rule.id;
    end if;
  end loop;

  update recurring_tasks
     set next_due = coalesce(
           (select min(next_due) from recurrence_rules
             where recurring_id = r_id and next_due is not null),
           next_due)
   where id = r_id;
end;
$$;

-- 00000000000072_recurrence_rules.sql
drop trigger if exists recurring_align_trg on recurring_tasks;

-- 00000000000072_recurrence_rules.sql
create or replace function recurrence_rules_sync() returns trigger
language plpgsql as $$
begin
  perform sync_recurring_schedule(coalesce(new.recurring_id, old.recurring_id));
  return null;
end;
$$;

-- 00000000000072_recurrence_rules.sql
drop trigger if exists recurrence_rules_sync_trg on recurrence_rules;

-- 00000000000072_recurrence_rules.sql
create trigger recurrence_rules_sync_trg
  after insert or delete
     or update of kind, day_of_week, day_of_month, week_of_month
  on recurrence_rules
  for each row execute function recurrence_rules_sync();

-- 00000000000072_recurrence_rules.sql
create or replace function backfill_recurrence_rule(r_id uuid)
returns void language plpgsql as $$
declare
  t recurring_tasks%rowtype;
begin
  select * into t from recurring_tasks where id = r_id;
  if not found then return; end if;
  if exists (select 1 from recurrence_rules where recurring_id = r_id) then
    return;
  end if;

  if t.week_of_month is not null and t.day_of_week is not null then
    insert into recurrence_rules (recurring_id, kind, day_of_week, week_of_month)
    values (r_id, 'nth_weekday', t.day_of_week, t.week_of_month);
  elsif t.day_of_month is not null then
    insert into recurrence_rules (recurring_id, kind, day_of_month)
    values (r_id, 'day_of_month', t.day_of_month);
  elsif t.day_of_week is not null then
    insert into recurrence_rules (recurring_id, kind, day_of_week)
    values (r_id, 'weekday', t.day_of_week);
  elsif t.frequency = 'daily' then
    -- Daily needs no rule of its own; one weekday rule per day covers it.
    insert into recurrence_rules (recurring_id, kind, day_of_week)
    select r_id, 'weekday', d from generate_series(0, 6) d;
  end if;
  -- No legacy columns set means there is nothing to infer. Leave it alone
  -- rather than inventing a schedule: the caller is about to add real rules,
  -- and a guessed one would generate a task on the wrong day.
end;
$$;

-- 00000000000072_recurrence_rules.sql
do $$
declare r record;
begin
  for r in select id from recurring_tasks loop
    perform backfill_recurrence_rule(r.id);
  end loop;
end $$;

-- 00000000000072_recurrence_rules.sql
create or replace function next_recurrence(r recurring_tasks, from_date date)
returns date language plpgsql as $$
declare
  best date;
  rule recurrence_rules%rowtype;
  d    date;
begin
  for rule in select * from recurrence_rules where recurring_id = r.id loop
    d := rule_advance(rule, r, from_date);
    if best is null or d < best then best := d; end if;
  end loop;

  -- No rules yet (a task mid-insert): fall back to a plain period step.
  if best is null then
    case r.frequency
      when 'daily'    then best := from_date + 1;
      when 'weekly'   then best := from_date + 7;
      when 'biweekly' then best := from_date + 14;
      else best := (date_trunc('month', from_date) + interval '1 month')::date;
    end case;
  end if;

  return best;
end;
$$;

-- 00000000000072_recurrence_rules.sql
create or replace function generate_recurring(r_id uuid, due date)
returns uuid language plpgsql as $$
declare
  r      recurring_tasks%rowtype;
  new_id uuid;
  item   text;
  i      int := 0;
begin
  select * into r from recurring_tasks where id = r_id;
  if not found or not r.is_active then return null; end if;

  -- Stop conditions (spec section 8).
  if r.ends_on is not null and due > r.ends_on then return null; end if;
  if r.ends_after is not null and r.occurrences_made >= r.ends_after then
    return null;
  end if;

  insert into tasks (project_id, title, notes, status, priority,
                     assignee_id, due_date, recurring_id, sop_id)
  values (r.project_id, r.title, r.notes, 'todo', r.priority,
          r.assignee_id, due, r.id, r.sop_id)
  on conflict (recurring_id, due_date) where recurring_id is not null
  do nothing
  returning id into new_id;

  -- Already generated for this day. Not an error, and not a second task.
  if new_id is null then
    select id into new_id from tasks
     where recurring_id = r_id and due_date = due;
    return new_id;
  end if;

  foreach item in array r.checklist loop
    insert into checklist_items (task_id, content, position)
    values (new_id, item, i);
    i := i + 1;
  end loop;

  update recurring_tasks
     set occurrences_made = occurrences_made + 1
   where id = r_id;

  return new_id;
end;
$$;

-- 00000000000072_recurrence_rules.sql
create or replace function run_due_recurring()
returns int language plpgsql as $$
declare
  task  recurring_tasks%rowtype;
  rule  recurrence_rules%rowtype;
  made  int := 0;
  due   date;
  guard int;
begin
  for task in select * from recurring_tasks where is_active loop
    for rule in select * from recurrence_rules
                 where recurring_id = task.id and next_due is not null loop
      due   := rule.next_due;
      guard := 0;

      while due <= current_date and guard < 400 loop
        if generate_recurring(task.id, due) is not null then
          made := made + 1;
        end if;
        due   := rule_advance(rule, task, due);
        guard := guard + 1;
      end loop;

      if due <> rule.next_due then
        update recurrence_rules set next_due = due where id = rule.id;
      end if;
    end loop;

    update recurring_tasks
       set next_due = coalesce(
             (select min(next_due) from recurrence_rules
               where recurring_id = task.id and next_due is not null),
             next_due)
     where id = task.id;
  end loop;

  return made;
end;
$$;

-- 00000000000072_recurrence_rules.sql
create or replace function on_recurring_done()
returns trigger language plpgsql as $$
declare
  task recurring_tasks%rowtype;
  rule recurrence_rules%rowtype;
  due  date;
begin
  if new.recurring_id is null
     or new.status <> 'done'
     or old.status is not distinct from 'done' then
    return new;
  end if;

  select * into task from recurring_tasks where id = new.recurring_id;
  if not found or not task.is_active then return new; end if;

  -- The rule that owns this date, so only that one moves forward.
  select * into rule from recurrence_rules
   where recurring_id = task.id
     and next_due is not null
     and next_due <= coalesce(new.due_date, current_date)
   order by next_due desc limit 1;

  if not found then
    select * into rule from recurrence_rules
     where recurring_id = task.id order by next_due nulls last limit 1;
  end if;
  if not found then return new; end if;

  due := rule_advance(rule, task, coalesce(new.due_date, current_date));
  perform generate_recurring(task.id, due);
  update recurrence_rules set next_due = rule_advance(rule, task, due)
   where id = rule.id;
  perform sync_recurring_schedule(task.id);

  return new;
end;
$$;

-- 00000000000073_daily_rally.sql
create table if not exists rally_lines (
  id         uuid primary key default gen_random_uuid(),
  
  body       text not null,
  
  source     text,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 00000000000073_daily_rally.sql
drop trigger if exists rally_touch on rally_lines;

-- 00000000000073_daily_rally.sql
create trigger rally_touch before update on rally_lines
  for each row execute function touch_updated_at();

-- 00000000000073_daily_rally.sql
create or replace function rally_line_for(on_day date)
returns table (body text, source text)
language sql stable as $$
  with active as (
    select r.body, r.source,
           row_number() over (order by r.sort_order, r.id) - 1 as n,
           count(*) over () as total
      from rally_lines r
     where r.is_active
  )
  select a.body, a.source from active a
   where a.total > 0
     and a.n = (on_day - date '2026-01-01') % a.total
$$;

-- 00000000000074_gtm_three_motions.sql
create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> ''),
  
  
  domain       text unique,
  website      text,
  linkedin_url text,
  industry     text,
  notes        text,
  created_by   uuid references people(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 00000000000074_gtm_three_motions.sql
create index if not exists companies_name_trgm
  on companies using gin (name gin_trgm_ops);

-- 00000000000074_gtm_three_motions.sql
drop trigger if exists companies_touch on companies;

-- 00000000000074_gtm_three_motions.sql
create trigger companies_touch before update on companies
  for each row execute function touch_updated_at();

-- 00000000000074_gtm_three_motions.sql
create or replace function normalize_domain(raw text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(raw, ''))), '^https?://', ''),
        '^www\.', ''),
      '[/?#].*$', ''),
    '')
$$;

-- 00000000000074_gtm_three_motions.sql
create or replace function company_for(
  p_name text, p_website text default null, p_actor uuid default null
) returns uuid language plpgsql as $$
declare
  d       text := normalize_domain(p_website);
  -- Named found_id rather than id: a bare id collides with companies.id
  -- inside the UPDATE below and Postgres rejects it as ambiguous.
  found_id uuid;
begin
  -- Domain first: it is the only field that reliably identifies a company.
  if d is not null then
    select c.id into found_id from companies c where c.domain = d;
    if found_id is not null then return found_id; end if;
  end if;

  -- Then an exact name match, so a company added without a website still
  -- joins up when the website arrives later.
  select c.id into found_id from companies c
   where lower(btrim(c.name)) = lower(btrim(p_name))
   limit 1;
  if found_id is not null then
    update companies
       set domain  = coalesce(companies.domain, d),
           website = coalesce(companies.website, p_website)
     where companies.id = found_id;
    return found_id;
  end if;

  insert into companies (name, domain, website, created_by)
  values (btrim(p_name), d, p_website, p_actor)
  returning companies.id into found_id;
  return found_id;
end;
$$;

-- 00000000000074_gtm_three_motions.sql
do $$ begin
  create type account_stage as enum (
    'identified', 'research_required', 'signal_verified',
    'decision_makers_needed', 'contacts_identified', 'ready_for_outreach',
    'outreach_active', 'engagement', 'meeting_booked', 'opportunity',
    'client', 'closed');
exception when duplicate_object then null; end $$;

-- 00000000000074_gtm_three_motions.sql
do $$ begin
  create type lead_stage as enum (
    'job_identified', 'job_verified', 'company_qualified',
    'decision_maker_needed', 'decision_maker_identified', 'ready_for_outreach',
    'outreach_active', 'engagement', 'meeting_booked', 'search_opportunity',
    'search_won', 'closed');
exception when duplicate_object then null; end $$;

-- 00000000000074_gtm_three_motions.sql
do $$ begin
  create type mpc_stage as enum (
    'candidate_identified', 'candidate_qualified', 'mpc_approved',
    'target_companies_needed', 'target_accounts_built',
    'decision_makers_needed', 'ready_for_outreach', 'campaign_active',
    'company_interest', 'candidate_introduction', 'interview', 'placement',
    'closed');
exception when duplicate_object then null; end $$;

-- 00000000000074_gtm_three_motions.sql
do $$ begin
  create type gtm_signal_type as enum (
    'funding', 'contract_award', 'hiring_growth', 'expansion', 'new_program',
    'new_leadership', 'acquisition', 'production_ramp', 'product_launch',
    'other');
exception when duplicate_object then null; end $$;

-- 00000000000074_gtm_three_motions.sql
do $$ begin
  create type lead_source as enum (
    'linkedin', 'careers_page', 'indeed', 'clearance_jobs', 'built_in',
    'google_jobs', 'other');
exception when duplicate_object then null; end $$;

-- 00000000000074_gtm_three_motions.sql
alter table gtm_accounts
  add column if not exists company_id uuid references companies(id) on delete set null,
  add column if not exists pipeline_stage account_stage not null default 'identified',
  add column if not exists signal_type gtm_signal_type,
  add column if not exists signal_date date,
  add column if not exists linkedin_url text,
  
  
  add column if not exists potential_need text[] not null default '{}';

-- 00000000000074_gtm_three_motions.sql
create index if not exists gtm_pipeline_idx on gtm_accounts (pipeline_stage)
  where archived_at is null and deleted_at is null;

-- 00000000000074_gtm_three_motions.sql
create index if not exists gtm_company_idx on gtm_accounts (company_id);

-- 00000000000074_gtm_three_motions.sql
create or replace function mirror_pipeline_stage() returns trigger
language plpgsql as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    new.stage := case new.pipeline_stage
      when 'identified'              then 'target'
      when 'research_required'       then 'researching'
      when 'signal_verified'         then 'researching'
      when 'decision_makers_needed'  then 'researching'
      when 'contacts_identified'     then 'contacts_found'
      -- Deliberately approved_build, not pending_outreach: the SourceWhale
      -- load gate refuses pending_outreach until the account is confirmed
      -- loaded, and that confirmation belongs at the point outreach starts,
      -- not while the board is being triaged.
      when 'ready_for_outreach'      then 'approved_build'
      when 'outreach_active'         then 'outreach_active'
      when 'engagement'              then 'engaged'
      when 'meeting_booked'          then 'engaged'
      when 'opportunity'             then 'engaged'
      when 'client'                  then 'complete'
      when 'closed'                  then 'complete'
    end::gtm_stage;
  end if;
  return new;
end;
$$;

-- 00000000000074_gtm_three_motions.sql
drop trigger if exists gtm_mirror_stage on gtm_accounts;

-- 00000000000074_gtm_three_motions.sql
create trigger gtm_mirror_stage
  before update of pipeline_stage on gtm_accounts
  for each row execute function mirror_pipeline_stage();

-- 00000000000074_gtm_three_motions.sql
create table if not exists live_leads (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  job_title      text not null check (btrim(job_title) <> ''),
  job_url        text not null,
  location       text,
  compensation   text,
  posted_on      date,
  researcher_id  uuid references people(id) on delete set null,
  owner_id       uuid references people(id) on delete set null,
  priority       priority not null default 'normal',
  
  
  why_this_role  text,
  role_family    text,
  source         lead_source,
  stage          lead_stage not null default 'job_identified',
  next_action    text,
  next_action_on date,
  notes          text,
  outcome_note   text,
  created_by     uuid references people(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,
  deleted_at     timestamptz
);

-- 00000000000074_gtm_three_motions.sql
create index if not exists live_leads_stage_idx on live_leads (stage)
  where archived_at is null and deleted_at is null;

-- 00000000000074_gtm_three_motions.sql
create index if not exists live_leads_company_idx on live_leads (company_id);

-- 00000000000074_gtm_three_motions.sql
drop trigger if exists live_leads_touch on live_leads;

-- 00000000000074_gtm_three_motions.sql
create trigger live_leads_touch before update on live_leads
  for each row execute function touch_updated_at();

-- 00000000000074_gtm_three_motions.sql
create table if not exists mpcs (
  id               uuid primary key default gen_random_uuid(),
  candidate_name   text not null check (btrim(candidate_name) <> ''),
  title            text not null,
  location         text,
  
  relocation       text,
  
  remote_pref      text,
  target_geo       text,
  comp_target      text,
  clearance        text,
  primary_function text,
  target_titles    text[] not null default '{}',
  
  
  why_placeable    text,
  linkedin_url     text,
  resume_url       text,
  owner_id         uuid references people(id) on delete set null,
  priority         priority not null default 'normal',
  stage            mpc_stage not null default 'candidate_identified',
  next_action      text,
  next_action_on   date,
  notes            text,
  created_by       uuid references people(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,
  deleted_at       timestamptz
);

-- 00000000000074_gtm_three_motions.sql
create index if not exists mpcs_stage_idx on mpcs (stage)
  where archived_at is null and deleted_at is null;

-- 00000000000074_gtm_three_motions.sql
drop trigger if exists mpcs_touch on mpcs;

-- 00000000000074_gtm_three_motions.sql
create trigger mpcs_touch before update on mpcs
  for each row execute function touch_updated_at();

-- 00000000000074_gtm_three_motions.sql
create table if not exists mpc_targets (
  id         uuid primary key default gen_random_uuid(),
  mpc_id     uuid not null references mpcs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  
  rationale  text,
  status     text not null default 'identified',
  created_at timestamptz not null default now(),
  unique (mpc_id, company_id)
);

-- 00000000000074_gtm_three_motions.sql
create index if not exists mpc_targets_mpc_idx on mpc_targets (mpc_id);

-- 00000000000074_gtm_three_motions.sql
alter table gtm_contacts
  add column if not exists lead_id uuid references live_leads(id) on delete cascade,
  add column if not exists mpc_target_id uuid references mpc_targets(id) on delete cascade;

-- 00000000000074_gtm_three_motions.sql
alter table gtm_contacts alter column account_id drop not null;

-- 00000000000074_gtm_three_motions.sql
alter table gtm_contacts drop constraint if exists gtm_contact_one_parent;

-- 00000000000074_gtm_three_motions.sql
alter table gtm_contacts add constraint gtm_contact_one_parent check (
  (account_id is not null)::int
  + (lead_id is not null)::int
  + (mpc_target_id is not null)::int = 1
);

-- 00000000000074_gtm_three_motions.sql
create index if not exists gtm_contacts_lead_idx on gtm_contacts (lead_id);

-- 00000000000074_gtm_three_motions.sql
create index if not exists gtm_contacts_mpc_idx on gtm_contacts (mpc_target_id);

-- 00000000000074_gtm_three_motions.sql
create or replace function attach_company() returns trigger
language plpgsql as $$
begin
  if new.company_id is null then
    new.company_id := company_for(new.company, new.website, new.created_by);
  end if;
  return new;
end;
$$;

-- 00000000000074_gtm_three_motions.sql
drop trigger if exists gtm_attach_company on gtm_accounts;

-- 00000000000074_gtm_three_motions.sql
create trigger gtm_attach_company
  before insert or update of company, website on gtm_accounts
  for each row execute function attach_company();

-- 00000000000074_gtm_three_motions.sql
do $$
declare a record;
begin
  for a in select id, company, website from gtm_accounts where company_id is null loop
    update gtm_accounts
       set company_id = company_for(a.company, a.website, created_by)
     where gtm_accounts.id = a.id;
  end loop;
end $$;

-- 00000000000074_gtm_three_motions.sql
update gtm_accounts set pipeline_stage = case stage
    when 'target'           then 'identified'
    when 'researching'      then 'research_required'
    when 'contacts_found'   then 'contacts_identified'
    when 'pending_review'   then 'signal_verified'
    when 'approved_build'   then 'ready_for_outreach'
    when 'pending_outreach' then 'ready_for_outreach'
    when 'outreach_active'  then 'outreach_active'
    when 'engaged'          then 'engagement'
    when 'complete'         then 'closed'
    when 'hold'             then 'closed'
  end::account_stage
 where pipeline_stage = 'identified' and stage <> 'target';

-- 00000000000074_gtm_three_motions.sql
update gtm_accounts
   set why_now = signal_note
 where why_now is null and signal_note is not null;

-- 00000000000075_content_performance.sql
create or replace view content_metrics_wide as
select
  l.content_id,
  l.platform,
  max(l.value) filter (where l.metric = 'impressions')     as impressions,
  max(l.value) filter (where l.metric = 'reach')           as reach,
  max(l.value) filter (where l.metric = 'video_views')     as video_views,
  max(l.value) filter (where l.metric = 'reactions')       as reactions,
  max(l.value) filter (where l.metric = 'comments')        as comments,
  max(l.value) filter (where l.metric = 'shares')          as shares,
  max(l.value) filter (where l.metric = 'saves')           as saves,
  max(l.value) filter (where l.metric = 'clicks')          as clicks,
  max(l.value) filter (where l.metric = 'link_clicks')     as link_clicks,
  max(l.value) filter (where l.metric = 'new_followers')   as new_followers,
  max(l.value) filter (where l.metric = 'new_connections') as new_connections,
  max(l.value) filter (where l.metric = 'inbound_dms')     as inbound_dms,
  max(l.value) filter (where l.metric = 'leads')           as leads,
  max(l.value) filter (where l.metric = 'meetings')        as meetings,
  max(l.observed_at)                                       as updated_at
from content_metrics_latest l
group by l.content_id, l.platform;

-- 00000000000075_content_performance.sql
create or replace view content_performance as
select
  w.content_id, w.platform, w.updated_at,
  
  
  
  w.impressions::bigint     as impressions,
  w.reach::bigint           as reach,
  w.video_views::bigint     as video_views,
  w.reactions::bigint       as reactions,
  w.comments::bigint        as comments,
  w.shares::bigint          as shares,
  w.saves::bigint           as saves,
  w.clicks::bigint          as clicks,
  w.link_clicks::bigint     as link_clicks,
  w.new_followers::bigint   as new_followers,
  w.new_connections::bigint as new_connections,
  w.inbound_dms::bigint     as inbound_dms,
  w.leads::bigint           as leads,
  w.meetings::bigint        as meetings,

  case when w.reactions is null and w.comments is null
        and w.shares is null and w.saves is null then null
       else (coalesce(w.reactions, 0) + coalesce(w.comments, 0)
             + coalesce(w.shares, 0) + coalesce(w.saves, 0))::bigint
  end as engagements,

  case when coalesce(w.impressions, 0) > 0
        and not (w.reactions is null and w.comments is null
                 and w.shares is null and w.saves is null)
       then round((coalesce(w.reactions, 0) + coalesce(w.comments, 0)
                   + coalesce(w.shares, 0) + coalesce(w.saves, 0))
                  * 100.0 / w.impressions, 2)
  end as engagement_rate,

  case when coalesce(w.impressions, 0) > 0 and w.clicks is not null
       then round(w.clicks * 100.0 / w.impressions, 2) end as ctr,

  case when coalesce(w.impressions, 0) > 0 and w.link_clicks is not null
       then round(w.link_clicks * 100.0 / w.impressions, 2) end as link_ctr,

  case when coalesce(w.impressions, 0) > 0 and w.new_connections is not null
       then round(w.new_connections * 100.0 / w.impressions, 2)
  end as connection_rate,

  case when coalesce(w.clicks, 0) > 0 and w.leads is not null
       then round(w.leads * 100.0 / w.clicks, 2) end as lead_rate,

  case when coalesce(w.leads, 0) > 0 and w.meetings is not null
       then round(w.meetings * 100.0 / w.leads, 2) end as meeting_rate

from content_metrics_wide w;

-- 00000000000075_content_performance.sql
create or replace function record_content_metrics(
  p_content  uuid,
  p_platform platform,
  p_metrics  jsonb
) returns void language plpgsql security definer set search_path = mc, public as $$
declare
  k text;
  v numeric;
begin
  if not at_least('member') then
    raise exception 'Not allowed to record metrics';
  end if;

  for k in select jsonb_object_keys(p_metrics) loop
    -- A null in the payload means "not entered", which must not overwrite a
    -- reading somebody took yesterday.
    if jsonb_typeof(p_metrics -> k) = 'null' then continue; end if;
    v := (p_metrics ->> k)::numeric;
    if v < 0 then
      raise exception 'Metric % cannot be negative', k;
    end if;
    insert into content_metrics (content_id, platform, metric, value, source)
    values (p_content, p_platform, k, v, 'manual');
  end loop;
end;
$$;

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
