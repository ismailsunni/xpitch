import { authorizationUrl, createState, json, options, requireUser } from '../_shared/strava.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await requireUser(request);
    return json({ url: authorizationUrl(await createState(user.id)) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not start Strava connection.' }, 401);
  }
});
