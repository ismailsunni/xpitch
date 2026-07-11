-- Phase 4 additions. Run once in the Supabase SQL editor.

-- Birth date on profiles → derive age (and default max HR) automatically.
alter table public.profiles add column if not exists birth_date date;
