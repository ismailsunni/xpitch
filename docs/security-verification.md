# Security verification

Run RLS checks only against a disposable local Supabase stack:

```bash
npx supabase start
npx supabase db reset
psql "$SUPABASE_DB_URL" -f supabase/tests/policy-regression.sql
```

The script records the required invariants for public, private, and capability
shared matches. It must be expanded with disposable Auth users and Storage
fixtures before an automated CI database job is introduced.

Production safeguards currently in place:

- Normal `matches` and `sessions` reads expose public rows only, except to an
  owner or administrator.
- An unlisted route needs both its random short ID and `share` token.
- The token is scoped to a temporary client used only for that shared page.
- Unlisted FIT and media Storage policies require the same request token.
- Switching a match into unlisted visibility rotates its token.
- The final admin role cannot be removed.
