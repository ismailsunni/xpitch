-- Keep persisted match formats aligned with the client-side analytics options.
alter table public.matches drop constraint if exists matches_format_check;
alter table public.matches
  add constraint matches_format_check
  check (format in ('auto', 'futsal', 'mini', 'nine', 'full'));
