-- Cleanup after verifying production data on 2026-07-17:
-- sessions.field_id, sessions.storage_path, matches.notes, and matches.ended_at
-- contained no values. Private notes now live in match_private_notes.

alter table public.sessions drop column if exists field_id;
alter table public.sessions drop column if exists storage_path;
alter table public.matches drop column if exists notes;
alter table public.matches drop column if exists ended_at;
