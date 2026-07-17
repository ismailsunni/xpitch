# DB schema review and planned additions

Date: 2026-07-17

This note captures the current schema review and proposed database changes for:

- private match notes
- user admin/privilege levels
- Strava integration
- match photos/media
- possible cleanup of unused columns

## Current schema findings

### Keep `matches.primary_field_id`

`matches.primary_field_id` is the correct match → pitch relationship and is actively used by the app.

Current app usage includes:

- saving/updating match pitch selection
- loading match detail pitch
- feed pitch status
- field detail pages
- historical analysis filters

Do not remove this column.

### `sessions.field_id` appears unused

`sessions.field_id` exists in `supabase/migrations/0001_init.sql`, but app code does not currently reference it.

Current model treats pitch as match-level:

```text
matches.primary_field_id -> fields.id
```

This is enough for current behavior because all sessions in one match use the same pitch. Session-specific pitch would only be needed if one match could contain sessions played on different pitches, which is not currently supported.

Recommendation:

1. Check whether any production rows have `sessions.field_id is not null`.
2. If empty, drop the column in a cleanup migration.
3. If not empty, decide whether to migrate those values to `matches.primary_field_id`.

Suggested check:

```sql
select count(*) as sessions_with_field
from public.sessions
where field_id is not null;
```

### `sessions.storage_path` appears unused

The app uploads raw `.fit` files to:

```text
fits/{user_id}/{match_short_id}/{filename}
```

The match stores file names in:

```text
matches.file_names
```

Current app code does not populate or query `sessions.storage_path`.

Recommendation:

1. Check whether any rows have `storage_path is not null`.
2. If empty, drop it in a cleanup migration.

Suggested check:

```sql
select count(*) as sessions_with_storage_path
from public.sessions
where storage_path is not null;
```

### `matches.ended_at` appears unused

`matches.ended_at` exists but the current app does not populate or use it.

Recommendation:

- Either start populating it from the latest session end time, or drop it.
- Keeping it is reasonable if we want faster match duration/date-range queries later.

Suggested check:

```sql
select count(*) as matches_with_ended_at
from public.matches
where ended_at is not null;
```

### `matches.notes` is not safe for private notes

`matches.notes` exists in the initial schema, but it is on the `matches` row.

Current match select policy is row-level:

```sql
create policy matches_select_visible on public.matches for select
  using (owner_id = auth.uid() or visibility in ('public','unlisted'));
```

That means public/unlisted matches expose the whole row to non-owners. PostgreSQL RLS does not hide individual columns.

So if `matches.notes` contains private notes, a non-owner could query:

```sql
select title, notes
from public.matches
where short_id = '...';
```

If the match is public/unlisted, the query is allowed.

Recommendation:

- Do not use `matches.notes` for private notes.
- Use a separate owner-only table: `match_private_notes`.
- Optionally keep `matches.notes` only for public/shareable notes, or drop it after confirming it has no data.

Suggested check:

```sql
select count(*) as matches_with_notes
from public.matches
where notes is not null and btrim(notes) <> '';
```

## Proposed additions

## 1. Private match notes

Use a separate table so private notes are not exposed with public/unlisted match rows.

```sql
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
```

Recommended RLS:

```sql
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
    select 1 from public.matches m
    where m.id = match_id and m.owner_id = auth.uid()
  )
);

drop policy if exists match_private_notes_update_own on public.match_private_notes;
create policy match_private_notes_update_own
on public.match_private_notes for update
using (owner_id = auth.uid() or public.is_xpitch_admin())
with check (owner_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists match_private_notes_delete_own on public.match_private_notes;
create policy match_private_notes_delete_own
on public.match_private_notes for delete
using (owner_id = auth.uid() or public.is_xpitch_admin());
```

## 2. User admin / privilege level

Current admin check is hardcoded to one email in:

- `src/lib/auth.ts`
- `supabase/migrations/0006_admin_policies.sql`

Recommended replacement: separate privilege table.

Do not put privilege level directly on `profiles` unless profile update RLS is changed first. The current profile policy allows users to update their own profile row, which would make self-escalation possible if privilege level were stored there.

```sql
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
```

Recommended admin function:

```sql
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
```

Recommended RLS:

```sql
drop policy if exists user_privileges_select_self_or_admin on public.user_privileges;
create policy user_privileges_select_self_or_admin
on public.user_privileges for select
using (user_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists user_privileges_admin_all on public.user_privileges;
create policy user_privileges_admin_all
on public.user_privileges for all
using (public.is_xpitch_admin())
with check (public.is_xpitch_admin());
```

Bootstrap one admin manually:

```sql
insert into public.user_privileges (user_id, level)
select id, 'admin'
from auth.users
where lower(email) = 'imajimatika@gmail.com'
on conflict (user_id) do update set level = excluded.level;
```

After this, update frontend `isAdmin()` to use `auth.profile`/privilege data or query the privilege row.

## 3. Strava integration

Strava should be handled with Supabase Edge Functions, not directly in the browser, because refresh tokens must not be exposed.

Current Strava API facts to account for:

- OAuth2 is required.
- Access tokens expire after 6 hours.
- Refresh tokens can rotate; always persist the latest refresh token.
- Listing activities uses `GET /athlete/activities`.
- Reading private “Only Me” activities requires `activity:read_all`.
- Activity streams are available at `GET /activities/{id}/streams` and can include `time`, `distance`, `latlng`, `velocity_smooth`, `heartrate`, etc.
- Strava API base URL changes from `https://www.strava.com/api/v3` to `https://api-v3.strava.com` starting January 4, 2027.

References:

- https://developers.strava.com/docs/authentication/
- https://developers.strava.com/docs/reference/
- https://developers.strava.com/docs/changelog/

### `strava_connections`

Stores safe, user-visible connection metadata.

```sql
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
```

### `strava_tokens`

Stores sensitive OAuth tokens. This should be service-role/Edge Function only.

```sql
create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS recommendation:

- Enable RLS.
- Do not create browser-accessible policies.
- Use Supabase Edge Functions with service role to read/write tokens.

```sql
alter table public.strava_tokens enable row level security;
```

### `strava_activities`

Caches activity summaries and links imported activities to matches.

```sql
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
```

RLS:

```sql
alter table public.strava_connections enable row level security;
alter table public.strava_activities enable row level security;

create policy strava_connections_select_own
on public.strava_connections for select
using (user_id = auth.uid());

create policy strava_connections_delete_own
on public.strava_connections for delete
using (user_id = auth.uid());

create policy strava_activities_select_own
on public.strava_activities for select
using (user_id = auth.uid());
```

Insert/update should usually happen from Edge Functions using service role.

### Strava import flow

1. User clicks “Connect Strava”.
2. Browser redirects to Strava OAuth.
3. Strava redirects back to Supabase Edge Function callback.
4. Edge Function exchanges `code` for tokens.
5. Edge Function stores connection metadata and tokens.
6. App shows Strava activities from `strava_activities`.
7. User selects an activity to import.
8. Edge Function fetches streams for that activity and converts it into xPitch records/session data.
9. App creates/saves a match from the imported stream, with `source = 'strava'` if such a column is added.

Optional useful additions to `matches`:

```sql
alter table public.matches
  add column if not exists source text not null default 'fit'
    check (source in ('fit', 'strava', 'manual'));

alter table public.matches
  add column if not exists source_activity_id text;
```

## 4. Match photos / media

Photos should be separate from `matches`.

Reasons:

- Multiple photos per match.
- Independent visibility.
- Captions and sort order.
- Safer RLS.
- Storage metadata belongs with media, not the match row.

### Table

```sql
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
```

Default visibility should be `private`. If we want photos to inherit match visibility, the UI should make that explicit.

### Storage bucket

```sql
insert into storage.buckets (id, name, public)
values ('match-media', 'match-media', false)
on conflict (id) do nothing;
```

Recommended storage path:

```text
{user_id}/{match_short_id}/{media_id}.jpg
```

### RLS for `match_media`

```sql
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
    select 1 from public.matches m
    where m.id = match_id and m.owner_id = auth.uid()
  )
);

drop policy if exists match_media_update_own on public.match_media;
create policy match_media_update_own
on public.match_media for update
using (owner_id = auth.uid() or public.is_xpitch_admin())
with check (owner_id = auth.uid() or public.is_xpitch_admin());

drop policy if exists match_media_delete_own on public.match_media;
create policy match_media_delete_own
on public.match_media for delete
using (owner_id = auth.uid() or public.is_xpitch_admin());
```

### Storage policies for `match-media`

Storage reads should check both the media row and parent match visibility.

```sql
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
```

### UI plan for photos

Match detail page:

- Add a “Photos” section/tab.
- In edit mode, owner can upload photos.
- Owner can edit caption.
- Owner can delete photos.
- Owner can set each photo visibility.

Feed:

- Later: show first visible match photo as a thumbnail.

Share image:

- Later: allow selecting a photo as background or attachment.

## Suggested migration order

1. Add `user_privileges`.
2. Bootstrap admin user.
3. Replace hardcoded admin function with DB-backed `is_xpitch_admin()`.
4. Add `match_private_notes`.
5. Add `match_media` and `match-media` storage bucket/policies.
6. Add Strava connection/token/activity tables.
7. Add optional `matches.source` and `matches.source_activity_id`.
8. Backfill/migrate `matches.notes` into `match_private_notes` if there is existing data.
9. Cleanup unused columns after checking data:
   - `sessions.field_id`
   - `sessions.storage_path`
   - `matches.notes`
   - maybe `matches.ended_at`

## Cleanup migration draft

Only run this after checking data and deciding no production values are needed.

```sql
alter table public.sessions drop column if exists field_id;
alter table public.sessions drop column if exists storage_path;
alter table public.matches drop column if exists notes;
-- optional:
-- alter table public.matches drop column if exists ended_at;
```
