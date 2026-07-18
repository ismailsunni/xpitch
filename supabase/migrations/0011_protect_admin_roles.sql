-- Roles are database-backed. Existing administrators remain unchanged; new
-- deployments bootstrap the first one manually, then manage roles in-app.
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.level = 'admin'
    and (tg_op = 'DELETE' or new.level <> 'admin')
    and not exists (
      select 1 from public.user_privileges
      where level = 'admin' and user_id <> old.user_id
    ) then
    raise exception 'At least one administrator is required.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists t_user_privileges_keep_admin on public.user_privileges;
create trigger t_user_privileges_keep_admin
  before update or delete on public.user_privileges
  for each row execute function public.prevent_last_admin_removal();
