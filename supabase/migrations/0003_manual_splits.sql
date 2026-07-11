-- Phase: manual splitting. Run once in the Supabase SQL editor.
-- Stores user-defined session/half break times (seconds from recording start)
-- so a manually-split match reopens the same way.
alter table public.matches add column if not exists manual_splits jsonb;
