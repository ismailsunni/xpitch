alter table public.matches
  add column if not exists break_files jsonb not null default '[]'::jsonb;
