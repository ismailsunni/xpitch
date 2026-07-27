alter table public.matches
  add column if not exists youtube_url text;

alter table public.matches
  drop constraint if exists matches_youtube_url_check;

alter table public.matches
  add constraint matches_youtube_url_check
  check (
    youtube_url is null
    or youtube_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
  );
