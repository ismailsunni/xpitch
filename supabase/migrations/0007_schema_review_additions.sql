-- Schema additions from docs/db-schema-review.md.
-- Additive only: destructive cleanup of unused columns should happen after
-- production data checks.

-- ========================= User privileges / admin =========================
create table if not exists public.user_privileges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default 'user'
    check (level in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists t_user_privileges_touch on public.user_privileges;
create trigger t_user_privileges_touch
  before update on public.user_privileges
  for each row execute function public.touch_updated_at();

alter table public.user_privileges enable row level security;

create or replace function public.is_xpitch_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_privileges up
    where up.user_id = auth.uid()
      and up.level = 'admin'
  )
$$;

drop policy if exists user_privileges_select_self_or_admin on public.user_privileges;
create policy user_privileges_select_self_or_admin
on public.user_privileges for select
using (user_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists user_privileges_admin_all on public.user_privileges;
create policy user_privileges_admin_all
on public.user_privileges for all
using (public.is_xpitch_admin())
with check (public.is_xpitch_admin());

-- Bootstrap the first admin manually through the SQL console or Supabase CLI.
-- Do not couple authorization to an email address in application migrations.

-- ========================= Private match notes =========================
create table if not exists public.match_private_notes (
  match_id uuid primary key references public.matches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_private_notes_owner_idx
  on public.match_private_notes(owner_id);

drop trigger if exists t_match_private_notes_touch on public.match_private_notes;
create trigger t_match_private_notes_touch
  before update on public.match_private_notes
  for each row execute function public.touch_updated_at();

alter table public.match_private_notes enable row level security;

drop policy if exists match_private_notes_select_own on public.match_private_notes;
create policy match_private_notes_select_own
on public.match_private_notes for select
using (owner_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists match_private_notes_insert_own on public.match_private_notes;
create policy match_private_notes_insert_own
on public.match_private_notes for insert
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists match_private_notes_update_own on public.match_private_notes;
create policy match_private_notes_update_own
on public.match_private_notes for update
using (owner_id = auth.uid() or public.is_xpitch_admin())
with check (
  public.is_xpitch_admin()
  or (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.matches m
      where m.id = match_id
        and m.owner_id = auth.uid()
    )
  )
);

drop policy if exists match_private_notes_delete_own on public.match_private_notes;
create policy match_private_notes_delete_own
on public.match_private_notes for delete
using (owner_id = auth.uid() or public.is_xpitch_admin());

insert into public.match_private_notes (match_id, owner_id, note)
select id, owner_id, notes
from public.matches
where notes is not null
  and btrim(notes) <> ''
on conflict (match_id) do update
set note = excluded.note,
    updated_at = now();

-- ========================= Strava integration =========================
create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_username text,
  athlete_firstname text,
  athlete_lastname text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strava_activity_id bigint not null,
  name text,
  sport_type text,
  start_date timestamptz,
  timezone text,
  distance_m double precision,
  moving_time_s int,
  elapsed_time_s int,
  average_speed_mps double precision,
  max_speed_mps double precision,
  average_heartrate double precision,
  max_heartrate double precision,
  has_heartrate boolean,
  map_summary_polyline text,
  raw_summary jsonb,
  imported_match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, strava_activity_id)
);

create index if not exists strava_activities_user_start_idx
  on public.strava_activities(user_id, start_date desc);

drop trigger if exists t_strava_connections_touch on public.strava_connections;
create trigger t_strava_connections_touch
  before update on public.strava_connections
  for each row execute function public.touch_updated_at();

drop trigger if exists t_strava_tokens_touch on public.strava_tokens;
create trigger t_strava_tokens_touch
  before update on public.strava_tokens
  for each row execute function public.touch_updated_at();

drop trigger if exists t_strava_activities_touch on public.strava_activities;
create trigger t_strava_activities_touch
  before update on public.strava_activities
  for each row execute function public.touch_updated_at();

alter table public.strava_connections enable row level security;
alter table public.strava_tokens enable row level security;
alter table public.strava_activities enable row level security;

drop policy if exists strava_connections_select_own on public.strava_connections;
create policy strava_connections_select_own
on public.strava_connections for select
using (user_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists strava_connections_delete_own on public.strava_connections;
create policy strava_connections_delete_own
on public.strava_connections for delete
using (user_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists strava_activities_select_own on public.strava_activities;
create policy strava_activities_select_own
on public.strava_activities for select
using (user_id = auth.uid() or public.is_xpitch_admin());

-- strava_tokens intentionally has no browser-accessible policies.
-- Edge Functions should read/write it with the service role.

alter table public.matches
  add column if not exists source text not null default 'fit'
    check (source in ('fit', 'strava', 'manual'));

alter table public.matches
  add column if not exists source_activity_id text;

create index if not exists matches_source_activity_idx
  on public.matches(source, source_activity_id)
  where source_activity_id is not null;

-- ========================= Match media =========================
create table if not exists public.match_media (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null default 'photo'
    check (media_type in ('photo')),
  mime_type text,
  width int,
  height int,
  caption text,
  visibility visibility not null default 'private',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_media_match_idx
  on public.match_media(match_id, sort_order, created_at);

create index if not exists match_media_owner_idx
  on public.match_media(owner_id);

drop trigger if exists t_match_media_touch on public.match_media;
create trigger t_match_media_touch
  before update on public.match_media
  for each row execute function public.touch_updated_at();

alter table public.match_media enable row level security;

drop policy if exists match_media_select_visible on public.match_media;
create policy match_media_select_visible
on public.match_media for select
using (
  owner_id = auth.uid()
  or public.is_xpitch_admin()
  or (
    visibility in ('public','unlisted')
    and exists (
      select 1
      from public.matches m
      where m.id = match_media.match_id
        and m.visibility in ('public','unlisted')
    )
  )
);

drop policy if exists match_media_insert_own on public.match_media;
create policy match_media_insert_own
on public.match_media for insert
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists match_media_update_own on public.match_media;
create policy match_media_update_own
on public.match_media for update
using (owner_id = auth.uid() or public.is_xpitch_admin())
with check (
  public.is_xpitch_admin()
  or (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.matches m
      where m.id = match_id
        and m.owner_id = auth.uid()
    )
  )
);

drop policy if exists match_media_delete_own on public.match_media;
create policy match_media_delete_own
on public.match_media for delete
using (owner_id = auth.uid() or public.is_xpitch_admin());

insert into storage.buckets (id, name, public)
values ('match-media', 'match-media', false)
on conflict (id) do nothing;

drop policy if exists match_media_storage_write_own on storage.objects;
create policy match_media_storage_write_own
on storage.objects for all to authenticated
using (
  bucket_id = 'match-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'match-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists match_media_storage_select_visible on storage.objects;
create policy match_media_storage_select_visible
on storage.objects for select
using (
  bucket_id = 'match-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_xpitch_admin()
    or exists (
      select 1
      from public.match_media mm
      join public.matches m on m.id = mm.match_id
      where mm.storage_path = storage.objects.name
        and mm.visibility in ('public','unlisted')
        and m.visibility in ('public','unlisted')
    )
  )
);
