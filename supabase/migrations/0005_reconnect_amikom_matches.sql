-- Reconnect matches around Amikom Soccer Arena to the DB-backed pitch.
-- This replaces the old in-app built-in pitch path with the seeded/public field row.

with amikom as (
  select id
  from public.fields
  where slug = 'amikom-soccer-arena'
  limit 1
),
target_matches as (
  select m.id
  from public.matches m
  cross join amikom a
  where m.primary_field_id is null
    and m.centroid_lat between -7.775 and -7.750
    and m.centroid_lon between 110.405 and 110.430
)
update public.matches m
set primary_field_id = (select id from amikom),
    updated_at = now()
where m.id in (select id from target_matches);

with amikom as (
  select id
  from public.fields
  where slug = 'amikom-soccer-arena'
  limit 1
),
target_matches as (
  select m.id
  from public.matches m
  cross join amikom a
  where m.primary_field_id = a.id
)
update public.sessions s
set field_id = (select id from amikom)
where s.field_id is null
  and s.match_id in (select id from target_matches);
