-- Applied to Supabase as migration ess_admin_private_notes_todos_sync_20261016.
-- Additive admin-only storage. Does not modify any PIN, client portal, official chart,
-- service-category tracker, or existing client logistics data.
create table if not exists public.admin_private_notes (
  id text primary key check(length(id) between 1 and 128),
  user_id uuid not null default auth.uid(),
  note_text text not null check(length(note_text) between 1 and 15000),
  created_label text not null default '',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists admin_private_notes_user_active on public.admin_private_notes(user_id,created_at desc) where deleted_at is null;
create table if not exists public.admin_todo_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null check(length(btrim(title)) between 1 and 400),
  done boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists admin_todo_items_user_active on public.admin_todo_items(user_id,created_at desc) where deleted_at is null;
create or replace function ess_private.stamp_admin_organizer()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if tg_op='INSERT' then
    if new.user_id is distinct from auth.uid() then raise exception 'Invalid owner'; end if;
    new.revision:=1;
    new.updated_at:=clock_timestamp();
    new.created_at:=new.updated_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'Record identity cannot change';
    end if;
    new.created_at:=old.created_at;
    new.revision:=old.revision+1;
    new.updated_at:=clock_timestamp();
    if old.deleted_at is not null then raise exception 'Deleted records cannot be modified'; end if;
  end if;
  return new;
end; $$;
revoke all on function ess_private.stamp_admin_organizer() from public,anon,authenticated;
create trigger stamp_admin_private_notes before insert or update on public.admin_private_notes for each row execute function ess_private.stamp_admin_organizer();
create trigger stamp_admin_todo_items before insert or update on public.admin_todo_items for each row execute function ess_private.stamp_admin_organizer();
alter table public.admin_private_notes enable row level security;
alter table public.admin_todo_items enable row level security;
revoke all on public.admin_private_notes,public.admin_todo_items from public,anon,authenticated;
grant select,insert,update on public.admin_private_notes,public.admin_todo_items to authenticated;
create policy admin_notes_read on public.admin_private_notes for select to authenticated using (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
create policy admin_notes_create on public.admin_private_notes for insert to authenticated with check (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
create policy admin_notes_edit on public.admin_private_notes for update to authenticated using (user_id=(select auth.uid()) and deleted_at is null and (select ess_private.is_notebook_admin())) with check (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
create policy admin_todos_read on public.admin_todo_items for select to authenticated using (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
create policy admin_todos_create on public.admin_todo_items for insert to authenticated with check (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
create policy admin_todos_edit on public.admin_todo_items for update to authenticated using (user_id=(select auth.uid()) and deleted_at is null and (select ess_private.is_notebook_admin())) with check (user_id=(select auth.uid()) and (select ess_private.is_notebook_admin()));
