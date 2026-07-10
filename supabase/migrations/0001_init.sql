-- xPitch backend — initial schema, RLS, storage, auth trigger, seed.
-- Run once in the Supabase SQL editor (or via the Supabase CLI).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where practical.

-- ========================= Extensions & enum =========================
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;      -- case-insensitive username

do $$ begin
  create type visibility as enum ('private', 'unlisted', 'public');
exception when duplicate_object then null; end $$;

-- ========================= updated_at helper =========================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ========================= profiles =========================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique
                 check (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'),
  display_name text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ========================= fields (reusable pitches) =========================
create table if not exists public.fields (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                          -- /xpitch/field/{slug}
  owner_id     uuid references auth.users(id) on delete cascade,  -- NULL = predefined/system
  name         text not null,
  corners      jsonb not null,                                -- [{lat,lon} x4]
  centroid_lat double precision,
  centroid_lon double precision,
  visibility   visibility not null default 'unlisted',        -- predefined seeded 'public'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint corners_is_4 check (jsonb_typeof(corners) = 'array'
                                 and jsonb_array_length(corners) = 4)
);
create index if not exists fields_owner_idx    on public.fields(owner_id);
create index if not exists fields_centroid_idx on public.fields(centroid_lat, centroid_lon);

-- ========================= matches (a group of sessions) =========================
create table if not exists public.matches (
  id               uuid primary key default gen_random_uuid(),
  short_id         text not null unique,                      -- /xpitch/match/{short_id}
  owner_id         uuid not null references auth.users(id) on delete cascade,
  title            text,
  sport            text,
  format           text check (format in ('auto','futsal','mini','full')),
  group_gap_min    int not null default 10,                   -- for deterministic re-segmentation
  started_at       timestamptz,
  ended_at         timestamptz,
  location_label   text,
  centroid_lat     double precision,
  centroid_lon     double precision,
  primary_field_id uuid references public.fields(id) on delete set null,
  file_names       jsonb,
  visibility       visibility not null default 'unlisted',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists matches_owner_started_idx on public.matches(owner_id, started_at desc);
create index if not exists matches_public_idx on public.matches(started_at desc) where visibility = 'public';

-- ========================= sessions (one recording/segment) =========================
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references public.matches(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS
  seq              int  not null,                             -- 1-based; /match/{short_id}/{seq}
  label            text,
  kind             text,
  start_time       timestamptz,
  end_time         timestamptz,
  field_id         uuid references public.fields(id) on delete set null,
  attacking_dir    smallint not null default 1 check (attacking_dir in (-1, 1)),
  side_dir         smallint not null default 1 check (side_dir in (-1, 1)),
  flips            jsonb,        -- per-period overrides { attack:{i:±1}, side:{i:±1} }
  periods          jsonb,        -- cached halves [{index,label,startTime,endTime}]
  duration_s       double precision,
  sample_count     int,
  storage_path     text unique,  -- {user_id}/{short_id}/{filename}.fit
  summary          jsonb,        -- cached MatchAnalytics.summary + meta subset
  analysis_options jsonb,        -- echoed options {age,maxHR,sprintKmh,highIntensityKmh,format}
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (match_id, seq)
);
create index if not exists sessions_match_idx on public.sessions(match_id);
create index if not exists sessions_owner_idx on public.sessions(owner_id);

-- ========================= updated_at triggers =========================
drop trigger if exists t_profiles_touch on public.profiles;
create trigger t_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists t_fields_touch on public.fields;
create trigger t_fields_touch before update on public.fields
  for each row execute function public.touch_updated_at();
drop trigger if exists t_matches_touch on public.matches;
create trigger t_matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();
drop trigger if exists t_sessions_touch on public.sessions;
create trigger t_sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

-- ========================= RLS =========================
alter table public.profiles enable row level security;
alter table public.fields   enable row level security;
alter table public.matches  enable row level security;
alter table public.sessions enable row level security;

-- profiles: public read, self write
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles for select using (true);
drop policy if exists profiles_write_self on public.profiles;
create policy profiles_write_self on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- fields: visible if shareable or owned; write own
drop policy if exists fields_select_visible on public.fields;
create policy fields_select_visible on public.fields for select
  using (visibility in ('public','unlisted') or owner_id = auth.uid());
drop policy if exists fields_write_own on public.fields;
create policy fields_write_own on public.fields for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- matches: visible if owned or shareable; write own
drop policy if exists matches_select_visible on public.matches;
create policy matches_select_visible on public.matches for select
  using (owner_id = auth.uid() or visibility in ('public','unlisted'));
drop policy if exists matches_write_own on public.matches;
create policy matches_write_own on public.matches for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- sessions: visible if owned or parent match shareable; write own (parent owned)
drop policy if exists sessions_select_visible on public.sessions;
create policy sessions_select_visible on public.sessions for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.matches m
               where m.id = sessions.match_id and m.visibility in ('public','unlisted'))
  );
drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );
drop policy if exists sessions_modify_own on public.sessions;
create policy sessions_modify_own on public.sessions for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own on public.sessions for delete using (owner_id = auth.uid());

-- ========================= Storage bucket + policies =========================
insert into storage.buckets (id, name, public)
values ('fits', 'fits', false)
on conflict (id) do nothing;

drop policy if exists fits_write_own on storage.objects;
create policy fits_write_own on storage.objects for all to authenticated
  using (bucket_id = 'fits' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fits' and (storage.foldername(name))[1] = auth.uid()::text);

-- Files live at {user_id}/{match short_id}/{filename}.fit — authorize reads by
-- the owning match's visibility, matched on the short_id path segment.
drop policy if exists fits_select_shared on storage.objects;
create policy fits_select_shared on storage.objects for select
  using (
    bucket_id = 'fits'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.matches m
        where m.short_id = (storage.foldername(name))[2]
          and m.visibility in ('public','unlisted')
      )
    )
  );

-- ========================= Profile on signup =========================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========================= Seed predefined pitch (Amikom Soccer Arena) =========================
insert into public.fields (slug, owner_id, name, corners, centroid_lat, centroid_lon, visibility)
values (
  'amikom-soccer-arena', null, 'Amikom Soccer Arena',
  '[{"lat":-7.7623279322076115,"lon":110.41793171866435},
    {"lat":-7.762382229525912,"lon":110.41824325775242},
    {"lat":-7.761906796671553,"lon":110.41834754980765},
    {"lat":-7.7618485263125905,"lon":110.4180279882538}]'::jsonb,
  -7.7621163711794165, 110.41813762861955, 'public'
)
on conflict (slug) do nothing;
