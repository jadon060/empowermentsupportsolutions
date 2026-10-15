-- Transactional regression checks. All fixtures and users are rolled back.
begin;
create temporary table notebook_test_context as
select gen_random_uuid() as admin_id,gen_random_uuid() as outsider_id,
  (select id from ess.clients order by created_at limit 1) as client_a,
  (select id from ess.clients order by created_at offset 1 limit 1) as client_b,
  gen_random_uuid() as entry_id;
grant select on notebook_test_context to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select admin_id,'authenticated','authenticated','ess-notebook-test@example.invalid',now(),'{}'::jsonb,'{}'::jsonb from notebook_test_context
union all select outsider_id,'authenticated','authenticated','ess-notebook-outsider@example.invalid',now(),'{}'::jsonb,'{}'::jsonb from notebook_test_context;
insert into ess_private.notebook_admins(email) values ('ess-notebook-test@example.invalid');
select set_config('request.jwt.claim.sub',(select admin_id::text from notebook_test_context),true);
set local role authenticated;
do $$
declare fixture record; affected integer; saved public.admin_staff_hours;
begin
  select * into fixture from notebook_test_context;
  assert public.staff_hours_admin_access(),'verified admin access';
  insert into public.admin_staff_hours(id,client_id,staff_name,worked_on,hours)
  values(fixture.entry_id,fixture.client_a,' QA staff ','2026-10-01',6.5);
  insert into public.admin_staff_hours(client_id,staff_name,worked_on,hours)
  values(fixture.client_b,'Other notebook','2026-10-01',2);
  select * into saved from public.admin_staff_hours where id=fixture.entry_id;
  assert saved.staff_name='QA staff' and saved.hours=6.5 and saved.revision=1 and not saved.verified_exported,'insert normalization';
  assert (select count(*) from public.admin_staff_hours where client_id=fixture.client_a and worked_on>='2026-10-01' and worked_on<'2026-11-01')=1,'client isolation';
  update public.admin_staff_hours set verified_exported=true where id=fixture.entry_id and revision=1;
  select * into saved from public.admin_staff_hours where id=fixture.entry_id;
  assert saved.verified_exported and saved.verified_at is not null and saved.verified_by=fixture.admin_id and saved.revision=2,'verification server stamp';
  update public.admin_staff_hours set hours=9 where id=fixture.entry_id and revision=1;
  get diagnostics affected=row_count;
  assert affected=0,'stale device conflict blocked';
  update public.admin_staff_hours set hours=5 where id=fixture.entry_id and revision=2;
  select * into saved from public.admin_staff_hours where id=fixture.entry_id;
  assert not saved.verified_exported and saved.verified_at is null and saved.verified_by is null and saved.revision=3,'edit resets verification';
  assert exists(select 1 from public.admin_staff_hours_history where entry_id=fixture.entry_id and action='edited' and (before_entry->>'verified_exported')::boolean),'prior verification retained';
  begin
    update public.admin_staff_hours set client_id=fixture.client_b where id=fixture.entry_id;
    raise exception 'client transfer unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm='client transfer unexpectedly accepted' then raise; end if;
  end;
  begin
    insert into public.admin_staff_hours(client_id,staff_name,worked_on,hours) values(fixture.client_a,'Invalid hours','2026-10-01',25);
    raise exception 'invalid hours unexpectedly accepted';
  exception when check_violation then null;
  end;
  update public.admin_staff_hours set worked_on='2026-09-30' where id=fixture.entry_id and revision=3;
  assert not exists(select 1 from public.admin_staff_hours where id=fixture.entry_id and worked_on>='2026-10-01' and worked_on<'2026-11-01'),'date moves out of old month';
  assert exists(select 1 from public.admin_staff_hours where id=fixture.entry_id and worked_on>='2026-09-01' and worked_on<'2026-10-01'),'date moves into correct month';
  update public.admin_staff_hours set deleted_at=now() where id=fixture.entry_id and revision=4;
  assert not exists(select 1 from public.admin_staff_hours where id=fixture.entry_id and deleted_at is null),'deleted entry hidden';
  assert (select count(*) from public.admin_staff_hours_history where entry_id=fixture.entry_id)=5,'complete immutable history';
  update public.admin_staff_hours set deleted_at=null where id=fixture.entry_id;
  get diagnostics affected=row_count;
  assert affected=0,'deleted records cannot be silently restored';
  begin
    delete from public.admin_staff_hours_history where entry_id=fixture.entry_id;
    raise exception 'audit deletion unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',(select outsider_id::text from notebook_test_context),true);
set local role authenticated;
do $$
begin
  assert not public.staff_hours_admin_access(),'ordinary account not authorized';
  assert (select count(*) from public.admin_staff_hours)=0,'ordinary account cannot read notebooks';
  assert (select count(*) from public.admin_staff_hours_history)=0,'ordinary account cannot read history';
  begin
    insert into public.admin_staff_hours(client_id,staff_name,worked_on,hours)
    select client_a,'Unauthorized','2026-10-01',2 from notebook_test_context;
    raise exception 'outsider insert unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into ess_private.notebook_admins(email) values ('unauthorized@example.invalid');
    raise exception 'self-promotion unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform id from public.admin_staff_hours;
    raise exception 'anonymous access unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select 'PASS: admin CRUD, client isolation, month movement, audit history, conflicts, and unauthorized access' as verification;
rollback;
