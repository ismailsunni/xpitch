-- The authenticated owner may mark their own cached Strava activity as saved.
-- Tokens remain inaccessible because strava_tokens has no browser policy.
drop policy if exists strava_activities_update_own on public.strava_activities;
create policy strava_activities_update_own
on public.strava_activities for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
