-- Task due times, and reminders for work that is due.
--
-- A task could carry a date but not a time, and nothing reminded anybody about
-- anything: the bell only rang when a person acted. This adds an optional time
-- to a task and one database function that sends every reminder, so the daily
-- cron and the opportunistic run on page load share a single definition.

-- --- Due time ------------------------------------------------------------------

-- Nullable. A date with no time is due that day, exactly as before, and the
-- priority trigger that fills a missing due_date is untouched.
alter table mc.tasks add column if not exists due_time time;

-- A time only means something next to a date. Clearing the date clears the
-- time on every write path, the board, the drawer and the MCP tools alike.
create or replace function mc.clear_orphan_due_time()
returns trigger language plpgsql set search_path = mc, public as $$
begin
  if new.due_date is null then new.due_time := null; end if;
  return new;
end;
$$;

-- Named to sort after tasks_priority_target, so on insert the derived date is
-- already in place and a time given without a date survives on it.
create trigger tasks_zz_due_time
  before insert or update of due_date, due_time on mc.tasks
  for each row execute function mc.clear_orphan_due_time();

-- --- Reminder kind -------------------------------------------------------------

-- The migration runner applies this file in one transaction, and a value added
-- here cannot be used until it commits. Nothing below uses it at apply time:
-- plpgsql resolves the 'reminder' literal when the function runs, not when it
-- is created.
alter type mc.notify_kind add value if not exists 'reminder';

-- --- State -----------------------------------------------------------------------

-- One row. The team's clock for "today" and "from 8:00", and the claim that
-- stops page loads running reminders more than once every ten minutes.
create table if not exists mc.reminder_state (
  id          int primary key default 1 check (id = 1),
  timezone    text not null default 'America/New_York',
  last_run_at timestamptz not null default '-infinity'
);

insert into mc.reminder_state (id) values (1) on conflict (id) do nothing;

-- One reminder per person, per entity, per rule, per team day. The unique key
-- is the race guard: a reminder is sent only when its row was inserted.
create table if not exists mc.reminder_log (
  person_id   uuid not null references mc.people(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  rule        text not null,
  day         date not null,
  sent_at     timestamptz not null default now(),
  primary key (person_id, entity_type, entity_id, rule, day)
);

-- --- The rules -------------------------------------------------------------------

create or replace function mc.run_reminders()
returns int language plpgsql security definer set search_path = mc, public as $$
declare
  tz     text := coalesce((select timezone from mc.reminder_state where id = 1),
                          'America/New_York');
  local  timestamp := now() at time zone tz;
  today  date := local::date;
  sent   int := 0;
  n      int;
  r      record;
begin
  for r in
    -- Task due within the next hour.
    select t.assignee_id as person_id, 'task' as entity_type, t.id as entity_id,
           'due_soon' as rule,
           'Due soon: ' || t.title as title,
           'Due at ' || to_char(t.due_time, 'FMHH12:MI AM') || ' today' as body,
           '/board?task=' || t.id as url
      from mc.tasks t
     where t.assignee_id is not null and t.status <> 'done'
       and t.archived_at is null and t.deleted_at is null
       and t.due_date = today and t.due_time is not null
       and t.due_date + t.due_time > local
       and t.due_date + t.due_time <= local + interval '60 minutes'

    union all
    -- Task due today with no time, once the team day has started.
    select t.assignee_id, 'task', t.id, 'due_today',
           'Due today: ' || t.title, null, '/board?task=' || t.id
      from mc.tasks t
     where t.assignee_id is not null and t.status <> 'done'
       and t.archived_at is null and t.deleted_at is null
       and t.due_date = today and t.due_time is null
       and local::time >= time '08:00'

    union all
    -- Task overdue: a past date, or today with its time gone by.
    select t.assignee_id, 'task', t.id, 'overdue',
           'Overdue: ' || t.title,
           case when t.due_date < today
                then 'Was due ' || to_char(t.due_date, 'FMMon FMDD')
                else 'Was due at ' || to_char(t.due_time, 'FMHH12:MI AM') end,
           '/board?task=' || t.id
      from mc.tasks t
     where t.assignee_id is not null and t.status <> 'done'
       and t.archived_at is null and t.deleted_at is null
       and (t.due_date < today
            or (t.due_date = today and t.due_time is not null
                and t.due_date + t.due_time <= local))

    union all
    -- GTM account whose next action date has arrived.
    select a.owner_id, 'gtm_account', a.id, 'next_action',
           'GTM next action: ' || a.company,
           coalesce(a.next_action, 'Next action')
             || case when a.next_action_on < today
                     then ', was due ' || to_char(a.next_action_on, 'FMMon FMDD')
                     else ', due today' end,
           '/gtm/' || a.id
      from mc.gtm_accounts a
     where a.owner_id is not null and a.next_action_on <= today
       and a.stage <> 'complete'
       and a.archived_at is null and a.deleted_at is null

    union all
    -- Requisition needing a human, not more sourcing. Of the next actions the
    -- board derives, three are decisions only the owner can take: an offer to
    -- manage, a client silent for more than five days, and a search 30 days
    -- old with nobody in it. "Source N more" and "Interviewing" are routine
    -- and would make this noise.
    select b.owner_id, 'requisition', b.id, 'needs_action',
           b.next_action || ': ' || b.role_title,
           b.company, '/requisitions'
      from mc.requisition_board b
     where b.owner_id is not null
       and b.status in ('active', 'calibrating')
       and b.archived_at is null and b.deleted_at is null
       and b.next_action in ('Manage offer', 'Follow up client', 'Recalibrate search')

    union all
    -- Content whose publish date has arrived and is not out.
    select c.owner_id, 'content', c.id, 'publish_due',
           'Publish due: ' || c.title,
           case when c.publish_date < today
                then 'Was due ' || to_char(c.publish_date, 'FMMon FMDD')
                else 'Scheduled for today' end,
           '/content'
      from mc.content c
     where c.owner_id is not null and c.publish_date <= today
       and c.status <> 'published'
       and c.archived_at is null and c.deleted_at is null
  loop
    insert into mc.reminder_log (person_id, entity_type, entity_id, rule, day)
    values (r.person_id, r.entity_type, r.entity_id, r.rule, today)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 1 then
      -- No actor: a reminder is the system talking, and notify() still
      -- honours the person's in-app and Slack preferences for this kind.
      perform mc.notify(r.person_id, 'reminder', r.title, r.body, r.url,
                        r.entity_type, r.entity_id, null);
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

-- Page loads call this. The UPDATE is the claim: of two concurrent callers the
-- second waits on the row lock, re-reads last_run_at and matches nothing, so
-- reminders run at most once per ten minutes however many pages load.
-- Returns null when it did not run.
create or replace function mc.run_reminders_if_due()
returns int language plpgsql security definer set search_path = mc, public as $$
begin
  update mc.reminder_state set last_run_at = now()
   where id = 1 and last_run_at < now() - interval '10 minutes';
  if not found then return null; end if;
  return mc.run_reminders();
end;
$$;
