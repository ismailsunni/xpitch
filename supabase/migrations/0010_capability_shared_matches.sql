-- Public listing must never expose unlisted matches. The existing random
-- short_id becomes the share capability, resolved only through this RPC.
drop policy if exists matches_select_visible on public.matches;
create policy matches_select_visible on public.matches for select
  using (owner_id = auth.uid() or visibility = 'public');

drop policy if exists sessions_select_visible on public.sessions;
create policy sessions_select_visible on public.sessions for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = sessions.match_id and m.visibility = 'public'
    )
  );

-- Returns a single public or unlisted match by its unguessable short ID.
-- This is intentionally not a listing endpoint: callers cannot enumerate
-- unlisted rows through the normal REST table API.
create or replace function public.get_shared_match(p_short_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'match', to_jsonb(m),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.seq)
      from public.sessions s
      where s.match_id = m.id
    ), '[]'::jsonb),
    'primary_field', (
      select jsonb_build_object(
        'id', f.id,
        'slug', f.slug,
        'name', f.name,
        'corners', f.corners,
        'visibility', f.visibility,
        'owner_id', f.owner_id
      )
      from public.fields f
      where f.id = m.primary_field_id
    )
  )
  from public.matches m
  where m.short_id = p_short_id
    and m.visibility in ('public', 'unlisted')
  limit 1;
$$;

grant execute on function public.get_shared_match(text) to anon, authenticated;
