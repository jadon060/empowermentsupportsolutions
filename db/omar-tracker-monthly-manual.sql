-- Admin-only, month-specific display adjustments for Omar's service tracker.
-- Does not alter ess.daily_entries, billing, signatures, authorizations or logistics.
create table public.omar_tracker_monthly_manual (
  month_key text primary key check (month_key ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
  hours_334 numeric(7,2) not null check (hours_334 between 0 and 744),
  hours_335_a numeric(7,2) not null check (hours_335_a between 0 and 744),
  hours_335_b numeric(7,2) not null check (hours_335_b between 0 and 744),
  enabled boolean not null default true,
  edit_note text not null check (length(btrim(edit_note)) between 8 and 500),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid(),
  constraint omar_manual_month_max check (hours_334 + hours_335_a + hours_335_b <= 744)
);

create table public.omar_tracker_monthly_audit (
  id bigint generated always as identity primary key,
  month_key text not null,
  action text not null check (action in ('enabled','revised','disabled')),
  changed_at timestamptz not null default now(),
  changed_by uuid not null,
  edit_note text not null,
  before_record jsonb,
  after_record jsonb not null
);
create index omar_tracker_audit_month on public.omar_tracker_monthly_audit(month_key, id desc);

alter table public.omar_tracker_monthly_manual enable row level security;
alter table public.omar_tracker_monthly_audit enable row level security;
revoke all on public.omar_tracker_monthly_manual, public.omar_tracker_monthly_audit from public, anon, authenticated;
-- Public Omar portal reads only display numbers, never admin notes or identities.
grant select (month_key, hours_334, hours_335_a, hours_335_b, enabled, updated_at)
  on public.omar_tracker_monthly_manual to anon;
grant select, insert, update on public.omar_tracker_monthly_manual to authenticated;
grant select on public.omar_tracker_monthly_audit to authenticated;

create policy omar_tracker_public_current on public.omar_tracker_monthly_manual
  for select to anon using (enabled = true);
create policy omar_tracker_admin_select on public.omar_tracker_monthly_manual
  for select to authenticated using ((select ess_private.is_notebook_admin()));
create policy omar_tracker_admin_insert on public.omar_tracker_monthly_manual
  for insert to authenticated with check ((select ess_private.is_notebook_admin()) and updated_by = (select auth.uid()));
create policy omar_tracker_admin_update on public.omar_tracker_monthly_manual
  for update to authenticated using ((select ess_private.is_notebook_admin()))
  with check ((select ess_private.is_notebook_admin()) and updated_by = (select auth.uid()));
create policy omar_tracker_audit_admin_read on public.omar_tracker_monthly_audit
  for select to authenticated using ((select ess_private.is_notebook_admin()));

create function ess_private.stamp_omar_tracker_manual() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not ess_private.is_notebook_admin() then
    raise exception 'Administrator authentication required';
  end if;
  new.edit_note := btrim(new.edit_note);
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.month_key is distinct from old.month_key then
      raise exception 'Month cannot be changed';
    end if;
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;
revoke all on function ess_private.stamp_omar_tracker_manual() from public, anon, authenticated;
create trigger stamp_omar_tracker_month before insert or update on public.omar_tracker_monthly_manual
for each row execute function ess_private.stamp_omar_tracker_manual();

-- Audit writes are produced exclusively by the trigger, not arbitrary clients.
create function ess_private.audit_omar_tracker_manual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.omar_tracker_monthly_audit
    (month_key, action, changed_by, edit_note, before_record, after_record)
  values (
    new.month_key,
    case when new.enabled = false then 'disabled'
         when tg_op = 'INSERT' or old.enabled = false then 'enabled'
         else 'revised' end,
    new.updated_by,
    new.edit_note,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function ess_private.audit_omar_tracker_manual() from public, anon, authenticated;
create trigger audit_omar_tracker_month after insert or update on public.omar_tracker_monthly_manual
for each row execute function ess_private.audit_omar_tracker_manual();

comment on table public.omar_tracker_monthly_manual is 'Display-only monthly override for Omar. Signed charting and invoicing must always read ess.daily_entries.';
