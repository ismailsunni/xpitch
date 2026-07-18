-- An unlisted URL needs a separate secret for media/FIT access. The short ID
-- identifies a match; this token authorizes its private Storage objects.
alter table public.matches
  add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists matches_share_token_idx on public.matches(share_token);

create or replace function public.xpitch_share_token()
returns uuid language sql stable as $$
  select nullif(current_setting('request.headers', true)::jsonb ->> 'x-xpitch-share', '')::uuid
$$;

create or replace function public.rotate_unlisted_share_token()
returns trigger language plpgsql as $$
begin
  if new.visibility = 'unlisted' and old.visibility is distinct from 'unlisted' then
    new.share_token = gen_random_uuid();
  end if;
  return new;
end;
$$;
drop trigger if exists t_matches_rotate_share_token on public.matches;
create trigger t_matches_rotate_share_token
  before update of visibility on public.matches
  for each row execute function public.rotate_unlisted_share_token();

drop policy if exists match_media_select_visible on public.match_media;
create policy match_media_select_visible on public.match_media for select using (
  owner_id = auth.uid() or public.is_xpitch_admin()
  or (visibility = 'public' and exists (
    select 1 from public.matches m where m.id = match_media.match_id and m.visibility = 'public'
  ))
  or (visibility in ('public', 'unlisted') and exists (
    select 1 from public.matches m
    where m.id = match_media.match_id and m.visibility = 'unlisted'
      and m.share_token = public.xpitch_share_token()
  ))
);

drop policy if exists fits_select_shared on storage.objects;
create policy fits_select_shared on storage.objects for select using (
  bucket_id = 'fits' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_xpitch_admin()
    or exists (select 1 from public.matches m where m.short_id = (storage.foldername(name))[2] and m.visibility = 'public')
    or exists (select 1 from public.matches m where m.short_id = (storage.foldername(name))[2]
      and m.visibility = 'unlisted' and m.share_token = public.xpitch_share_token())
  )
);

drop policy if exists match_media_storage_select_visible on storage.objects;
create policy match_media_storage_select_visible on storage.objects for select using (
  bucket_id = 'match-media' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_xpitch_admin()
    or exists (select 1 from public.match_media mm join public.matches m on m.id = mm.match_id
      where mm.storage_path = storage.objects.name and mm.visibility = 'public' and m.visibility = 'public')
    or exists (select 1 from public.match_media mm join public.matches m on m.id = mm.match_id
      where mm.storage_path = storage.objects.name and mm.visibility in ('public','unlisted')
        and m.visibility = 'unlisted' and m.share_token = public.xpitch_share_token())
  )
);

drop function if exists public.get_shared_match(text);
create function public.get_shared_match(p_short_id text, p_share_token uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('match', to_jsonb(m), 'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.seq) from public.sessions s where s.match_id = m.id), '[]'::jsonb),
    'primary_field', (select jsonb_build_object('id',f.id,'slug',f.slug,'name',f.name,'corners',f.corners,'visibility',f.visibility,'owner_id',f.owner_id) from public.fields f where f.id=m.primary_field_id))
  from public.matches m where m.short_id=p_short_id and (m.visibility='public' or (m.visibility='unlisted' and m.share_token=p_share_token)) limit 1;
$$;
grant execute on function public.get_shared_match(text, uuid) to anon, authenticated;
