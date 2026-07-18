# Improvement implementation plan

Date: 2026-07-18

Sources:

- `FEATURES_AND_IMPROVEMENTS.md`
- `UI_UX_REVIEW.md`

This plan intentionally puts Supabase policy/schema work last. Social features
and any work that depends on an external service are on hold.

## Operating rules

- Preserve the current browser-first FIT analysis flow.
- Ship each phase with focused tests and `npm run ci` passing.
- Do not add database tables, columns, migrations, or RLS changes before the
  final phase.
- Do not start social features or external integrations without a separate
  product decision.

## Phase 1: Correctness and documentation

Goal: make existing output and guidance trustworthy without changing storage.

1. Replace History's undefined `--bg-card` token with the established card
   token.
2. Reconcile sprint terminology and thresholds:
   - either count only the existing `Sprint` zone (25.2 km/h and above), or
   - rename the current 19.8 km/h counter to high-speed running.
3. Make fatigue calculations use explicit segment periods when available;
   retain the midpoint fallback for recordings with no periods.
4. Update Help instructions to match current actions and labels.
5. Derive the profile URL shown during username setup from the deployed base
   URL rather than a hardcoded domain.
6. Normalize the format/game-type wording across setup and match editing.

Acceptance:

- The speed tile and zone chart use consistent terms.
- A manually split first/second half drives the fatigue comparison.
- Help can be followed using the current UI verbatim.

## Phase 2: Accessible interaction and reliable feedback

Goal: make common flows keyboard-accessible and failures understandable.

1. Introduce a shared dialog behavior/composable:
   - `Escape` closes dismissible dialogs.
   - backdrop clicks close dismissible dialogs.
   - focus moves into the dialog, stays contained, and returns to its trigger.
   - every overlay has correct dialog semantics and labelling.
2. Replace native `alert()` and `confirm()` calls with app-styled error and
   destructive-confirmation surfaces.
3. Standardize async errors as a user-safe message plus Retry action; keep
   technical detail out of the primary message.
4. Add page-level `h1` headings and missing `aria-label`s to icon-only
   controls.
5. Add meaningful text alternatives for charts and pitch canvases.
6. Upgrade the feed carousel:
   - interactive slide controls,
   - pause on hover/focus,
   - no auto-advance under `prefers-reduced-motion`.
7. Audit small text contrast and replace hardcoded UI colors with design
   tokens.

Acceptance:

- Dialogs are usable with keyboard only.
- Deleting a match, photo, or pitch uses one consistent confirmation pattern.
- Feed cards do not auto-advance for reduced-motion users.

## Phase 3: Lower-friction analysis setup

Goal: deliver useful analysis sooner while making accuracy tradeoffs explicit.

1. Permit analysis without selecting a pitch.
2. When no pitch is selected, show a concise persistent accuracy state and
   keep the PCA/GPS fallback clearly identified as estimated positioning.
3. Reduce wizard blocking steps:
   - keep age/HR setup optional,
   - offer automatic split suggestions first,
   - defer orientation confirmation until the analysis view when possible.
4. Consolidate all manual-split entry points around the reusable session split
   editor.
5. Add a visible Analyze entry point in empty/first-use feed states.
6. Replace plain loading text on feed/history with lightweight skeletons.
7. Align responsive breakpoints and remove layout magic numbers where they
   create tablet inconsistencies.

Acceptance:

- A first-time user can reach analysis with a GPS FIT file and no saved pitch.
- The same session split editor and terminology appear in setup and match edit.

## Phase 4: Football metrics and personal progress

Goal: make metrics easier to compare and more football-specific without
external benchmarks.

1. Add per-90 equivalents for distance, high-speed running, sprinting, and
   related headline metrics.
2. Add HR reserve (Karvonen) zones when resting HR is available, with the
   current max-HR zones as a clear fallback.
3. Reword recovery output around repeated-sprint recovery and distinguish it
   from generic stationary HR drops.
4. Surface cadence as an optional running-load metric when it is present in
   the FIT file.
5. Add personal match comparison: selected match versus another saved match
   and versus the user's own historical average.
6. Add locally derived weekly load/history views only after metric definitions
   and caveats are agreed.

Acceptance:

- Comparisons use normalized per-90 values where duration differs.
- HR-zone labels always state whether they use max HR or HR reserve.

## Phase 5: Tests, types, and performance

Goal: protect analysis correctness before larger product changes.

1. Add parser fixtures/tests for valid FIT headers, records, sessions, GPS,
   heart rate, scale conversions, and malformed files.
2. Add `compute()` tests covering:
   - no GPS/no HR paths,
   - speed-zone and sprint boundaries,
   - manual periods and fatigue,
   - positional transforms and direction flips,
   - HR zones and recovery/repeated-sprint heuristics.
3. Define typed analytics/domain interfaces and remove the critical `any`
   boundaries incrementally; enable stricter checks for `src/lib` once those
   interfaces are stable.
4. Use `markRaw`/`shallowRef` for large immutable analysis results and verify
   that component consumers retain the intended reactivity.
5. Profile recomputation, then memoize field/direction-independent stages if
   profiling confirms the cost.
6. Split state orchestration and persistence concerns from `store.ts`; make
   persistence APIs accept explicit payloads rather than read global state.
7. Generate Supabase TypeScript types once the final schema phase is complete.
8. Move parse/compute into a Web Worker only after profiling demonstrates
   main-thread jank on representative full-match files.

Acceptance:

- Core FIT parsing and analytics have direct regression coverage.
- A representative 90-minute file remains responsive during setup edits.

## On hold: social and external dependencies

These are intentionally excluded from the active implementation queue.

1. Team mode, squad management, teammate/opponent comparison, team shape.
2. Kudos, comments, follows, notifications, and moderation.
3. Position benchmarks based on third-party or licensed benchmark data.
4. Strava import and any other third-party-device/service integrations.

Revisit only with a product scope, ownership model, moderation/privacy plan,
and any required external API credentials or licensing decisions.

## Final phase: Supabase policy and schema work

Start this phase only after the preceding client-side work is stable. First
inspect production data and deployed migrations; do not assume the review
documents exactly match the deployed schema.

1. Close unlisted-match enumeration by using capability-style share access or
   an RPC/token design rather than a broad `visibility = 'unlisted'` select
   policy.
2. Prevent public profile queries from exposing birth date or other private
   fields, using a public projection/view and narrow client selects.
3. Reconcile the prior database review:
   - verify private notes and media tables/policies,
   - verify admin authorization no longer depends on a hardcoded email,
   - inspect unused `sessions.field_id`, `sessions.storage_path`, and
     `matches.ended_at` before any cleanup migration.
4. Add schema support for deferred product work only when that work leaves the
   hold list and has an approved design.
5. Generate Supabase types, add policy-level tests/checks where practical,
   and document the resulting access model.

Acceptance:

- Unlisted matches are not listable or guessable through public table access.
- Birth date is never returned by public profile reads.
- Every migration has a rollback/data-preservation plan and has been tested
  against representative production-like data.
