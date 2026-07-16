-- Admin-only test controls for imajimatika@gmail.com.
-- The frontend also hides /admin from everyone else, but RLS is the real gate.

create or replace function public.is_xpitch_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'imajimatika@gmail.com'
$$;

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all
  using (public.is_xpitch_admin())
  with check (public.is_xpitch_admin());

drop policy if exists fields_admin_all on public.fields;
create policy fields_admin_all on public.fields for all
  using (public.is_xpitch_admin())
  with check (public.is_xpitch_admin());

drop policy if exists matches_admin_all on public.matches;
create policy matches_admin_all on public.matches for all
  using (public.is_xpitch_admin())
  with check (public.is_xpitch_admin());

drop policy if exists sessions_admin_all on public.sessions;
create policy sessions_admin_all on public.sessions for all
  using (public.is_xpitch_admin())
  with check (public.is_xpitch_admin());

drop policy if exists fits_admin_all on storage.objects;
create policy fits_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'fits' and public.is_xpitch_admin())
  with check (bucket_id = 'fits' and public.is_xpitch_admin());
