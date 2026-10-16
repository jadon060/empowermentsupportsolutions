-- Additive migration. Gusto values are loaded server-side and never committed here.
create table public.admin_employee_snapshots (
  id uuid primary key,
  full_name text not null,
  job_title text not null,
  active boolean not null,
  hourly_rate numeric(12,2) check (hourly_rate >= 0),
  hire_date date not null,
  assigned_clients text[] not null default '{}',
  last_processed_date date,
  last_check_date date,
  last_gross_pay numeric(14,2),
  ytd_gross numeric(14,2),
  verified_at timestamptz not null,
  source text not null default 'Gusto authorized connector snapshot'
);
alter table public.admin_employee_snapshots enable row level security;
revoke all on public.admin_employee_snapshots from public,anon,authenticated;
grant select on public.admin_employee_snapshots to authenticated;
create policy admin_employee_snapshot_read on public.admin_employee_snapshots for select to authenticated
using ((select ess_private.is_notebook_admin()));
alter table public.admin_staff_hours add column employee_id uuid references public.admin_employee_snapshots(id);
alter table public.admin_staff_hours add column entry_kind text not null default 'legacy'
check (entry_kind in ('legacy','employee','ess_direct'));
alter table public.admin_staff_hours add constraint notebook_employee_kind
check ((entry_kind = 'employee' and employee_id is not null) or (entry_kind <> 'employee' and employee_id is null));
create index admin_staff_hours_employee_month on public.admin_staff_hours(employee_id,worked_on) where deleted_at is null;

-- Run before the existing timestamp trigger; changing identity requires a fresh check.
create function ess_private.clear_notebook_identity_verification() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (new.employee_id,new.entry_kind) is distinct from (old.employee_id,old.entry_kind) then
    new.verified_exported := false;
  end if;
  return new;
end;
$$;
revoke all on function ess_private.clear_notebook_identity_verification() from public,anon,authenticated;
create trigger aa_notebook_identity_change before update on public.admin_staff_hours
for each row execute function ess_private.clear_notebook_identity_verification();
