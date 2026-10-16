-- Deployed additively to the existing ESS Supabase project.
-- Only a verified ESS notebook admin may read this minimal client roster.
-- Do NOT grant direct SELECT on ess.clients to authenticated users for this feature.
create or replace function public.admin_notebook_clients()
returns table(id uuid, first_name text, last_initial text, full_name text)
language sql stable security definer
set search_path = ''
as $function$
  select c.id, c.first_name, c.last_initial, c.full_name
  from ess.clients c
  where (select ess_private.is_notebook_admin())
  order by c.created_at, c.id;
$function$;

revoke all on function public.admin_notebook_clients() from public, anon;
grant execute on function public.admin_notebook_clients() to authenticated;
