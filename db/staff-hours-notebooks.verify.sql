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
  assert (select count(*) from public.admin_employee_snapshots)>0,'admin can read verified employee snapshots';
  assert not has_table_privilege(current_user,'public.admin_employee_snapshots','UPDATE'),'browser cannot change Gusto snapshots';
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
do $$
declare test_id uuid:=gen_random_uuid(); employee_id_value uuid; client_id_value uuid; saved public.admin_staff_hours;
begin
  select id into employee_id_value from public.admin_employee_snapshots order by full_name limit 1;
  select client_a into client_id_value from notebook_test_context;
  insert into public.admin_staff_hours(id,client_id,staff_name,worked_on,hours,employee_id,entry_kind,verified_exported)
  values(test_id,client_id_value,'QA employee session','2026-10-02',1.25,employee_id_value,'employee',true);
  select * into saved from public.admin_staff_hours where id=test_id;
  assert saved.verified_exported and saved.verified_at is not null,'verification at insertion works';
  begin
    insert into public.admin_staff_hours(id,client_id,staff_name,worked_on,hours) values(test_id,client_id_value,'Duplicate retry','2026-10-02',1.25);
    raise exception 'duplicate UUID unexpectedly accepted';
  exception when unique_violation then null;
  end;
  insert into public.admin_staff_hours(client_id,staff_name,worked_on,hours,employee_id,entry_kind)
  values(client_id_value,'QA employee session','2026-10-02',1.25,employee_id_value,'employee');
  assert (select count(*) from public.admin_staff_hours where client_id=client_id_value and staff_name='QA employee session' and worked_on='2026-10-02')=2,'legitimate same-day sessions allowed';
  update public.admin_staff_hours set employee_id=null,entry_kind='ess_direct' where id=test_id;
  select * into saved from public.admin_staff_hours where id=test_id;
  assert not saved.verified_exported and saved.verified_at is null,'employee identity changes clear verification';
  update public.admin_staff_hours set verified_exported=true where id=test_id;
  select * into saved from public.admin_staff_hours where id=test_id;
  assert saved.verified_exported and saved.verified_at is not null,'fresh verification after identity change works';
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
  assert (select count(*) from public.admin_employee_snapshots)=0,'ordinary account cannot read payroll snapshots';
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
set local role anon;
do $$
begin
  begin
    perform id from public.admin_employee_snapshots;
    raise exception 'anonymous payroll access unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select 'PASS: admin CRUD, client isolation, month movement, audit history, conflicts, and unauthorized access' as verification;
rollback;
