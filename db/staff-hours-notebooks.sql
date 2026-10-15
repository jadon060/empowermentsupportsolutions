-- ESS manual administrative notebooks. Independent of charting and logistics.
create schema if not exists ess_private;
revoke all on schema ess_private from public, anon;
grant usage on schema ess_private to authenticated;

create table ess_private.notebook_admins (
  email text primary key check (email = lower(email)),
  enabled boolean not null default true
);
alter table ess_private.notebook_admins enable row level security;
revoke all on ess_private.notebook_admins from public, anon, authenticated;
-- Existing ESS business contact; mailbox ownership must be verified by Supabase Auth.
insert into ess_private.notebook_admins(email) values ('empowermentess@gmail.com');

create function ess_private.is_notebook_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join ess_private.notebook_admins a on a.email = lower(u.email) and a.enabled
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;
revoke all on function ess_private.is_notebook_admin() from public, anon;
grant execute on function ess_private.is_notebook_admin() to authenticated;

create function public.staff_hours_admin_access() returns boolean
language sql stable security invoker set search_path = '' as $$
  select ess_private.is_notebook_admin();
$$;
revoke all on function public.staff_hours_admin_access() from public, anon;
grant execute on function public.staff_hours_admin_access() to authenticated;

create table public.admin_staff_hours (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references ess.clients(id),
  staff_name text not null check (length(btrim(staff_name)) between 1 and 120),
  worked_on date not null check (worked_on between date '2000-01-01' and date '2100-12-31'),
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  verified_exported boolean not null default false,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid(),
  revision integer not null default 1,
  deleted_at timestamptz,
  check (verified_exported = (verified_at is not null and verified_by is not null))
);
create index admin_staff_hours_client_date on public.admin_staff_hours(client_id, worked_on) where deleted_at is null;
create table public.admin_staff_hours_history (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.admin_staff_hours(id),
  client_id uuid not null references ess.clients(id),
  action text not null check (action in ('added','edited','verified','unverified','deleted')),
  changed_at timestamptz not null default now(),
  changed_by uuid not null,
  before_entry jsonb,
  after_entry jsonb not null
);
create index admin_staff_hours_history_client on public.admin_staff_hours_history(client_id, id desc);
create index admin_staff_hours_history_entry on public.admin_staff_hours_history(entry_id);

alter table public.admin_staff_hours enable row level security;
alter table public.admin_staff_hours_history enable row level security;
revoke all on public.admin_staff_hours, public.admin_staff_hours_history from public, anon, authenticated;
grant select, insert, update on public.admin_staff_hours to authenticated;
grant select on public.admin_staff_hours_history to authenticated;
create policy notebook_admin_select on public.admin_staff_hours for select to authenticated
  using ((select ess_private.is_notebook_admin()));
create policy notebook_admin_insert on public.admin_staff_hours for insert to authenticated
  with check ((select ess_private.is_notebook_admin()) and updated_by = (select auth.uid()));
create policy notebook_admin_update on public.admin_staff_hours for update to authenticated
  using ((select ess_private.is_notebook_admin()) and deleted_at is null)
  with check ((select ess_private.is_notebook_admin()) and updated_by = (select auth.uid()));
create policy notebook_admin_history on public.admin_staff_hours_history for select to authenticated
  using ((select ess_private.is_notebook_admin()));

create function ess_private.stamp_notebook_entry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.staff_name := btrim(new.staff_name);
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := new.updated_at;
    new.revision := 1;
    new.deleted_at := null;
  else
    if new.id <> old.id or new.client_id <> old.client_id then
      raise exception 'A notebook entry cannot be moved to another client.';
    end if;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
    if (new.staff_name, new.worked_on, new.hours) is distinct from (old.staff_name, old.worked_on, old.hours)
       or new.deleted_at is not null then
      new.verified_exported := false;
    end if;
    if new.deleted_at is not null then new.deleted_at := new.updated_at; end if;
  end if;
  if new.verified_exported then
    if tg_op = 'INSERT' then
      new.verified_at := new.updated_at; new.verified_by := auth.uid();
    elsif not old.verified_exported then
      new.verified_at := new.updated_at; new.verified_by := auth.uid();
    else
      new.verified_at := old.verified_at; new.verified_by := old.verified_by;
    end if;
  else
    new.verified_at := null; new.verified_by := null;
  end if;
  return new;
end;
$$;
revoke all on function ess_private.stamp_notebook_entry() from public, anon, authenticated;
create trigger stamp_notebook_entry before insert or update on public.admin_staff_hours
for each row execute function ess_private.stamp_notebook_entry();

-- Only this trigger can append audit events; clients cannot forge or erase history.
create function ess_private.audit_notebook_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_action text;
begin
  if auth.uid() is null or not ess_private.is_notebook_admin() then
    raise exception 'Verified administrator access required.';
  end if;
  if tg_op = 'INSERT' then event_action := 'added';
  elsif new.deleted_at is not null then event_action := 'deleted';
  elsif (new.staff_name,new.worked_on,new.hours) is distinct from (old.staff_name,old.worked_on,old.hours) then event_action := 'edited';
  elsif new.verified_exported and not old.verified_exported then event_action := 'verified';
  elsif not new.verified_exported and old.verified_exported then event_action := 'unverified';
  else event_action := 'edited'; end if;
  insert into public.admin_staff_hours_history(entry_id,client_id,action,changed_at,changed_by,before_entry,after_entry)
  values(new.id,new.client_id,event_action,new.updated_at,auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end;
$$;
revoke all on function ess_private.audit_notebook_entry() from public, anon, authenticated;
create trigger audit_notebook_entry after insert or update on public.admin_staff_hours
for each row execute function ess_private.audit_notebook_entry();

-- Realtime updates are authorized by the same SELECT policies as ordinary reads.
alter publication supabase_realtime add table public.admin_staff_hours;
