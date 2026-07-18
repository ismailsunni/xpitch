-- Private defaults for analysis. Public profile rows are readable by design,
-- so personal health settings must live in an owner-only table.
create table if not exists public.profile_analysis_defaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  max_hr smallint,
  rest_hr smallint,
  constraint profile_analysis_max_hr_range check (max_hr is null or max_hr between 120 and 230),
  constraint profile_analysis_rest_hr_range check (rest_hr is null or rest_hr between 35 and 110),
  constraint profile_analysis_rest_below_max check (max_hr is null or rest_hr is null or rest_hr < max_hr)
);

-- Move existing private birth dates out of publicly readable profiles.
insert into public.profile_analysis_defaults (user_id, birth_date)
select id, birth_date from public.profiles where birth_date is not null
on conflict (user_id) do update set birth_date = excluded.birth_date;

alter table public.profiles drop column if exists birth_date;

alter table public.profile_analysis_defaults enable row level security;
drop policy if exists profile_analysis_defaults_select_own on public.profile_analysis_defaults;
create policy profile_analysis_defaults_select_own on public.profile_analysis_defaults
  for select using (user_id = auth.uid());
drop policy if exists profile_analysis_defaults_write_own on public.profile_analysis_defaults;
create policy profile_analysis_defaults_write_own on public.profile_analysis_defaults
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
