# Testing Plan

xPitch now uses a small, fast test stack:

- `npm run typecheck` validates Vue and TypeScript types.
- `npm run test:run` runs unit tests with Vitest.
- `npm run build` verifies the production Vite bundle and GitHub Pages fallback copy.
- `npm run ci` runs all three gates in order.

## Unit Tests

Unit tests live next to the code they cover as `*.test.ts`. The first coverage targets stable pure logic:

- formatting helpers
- geo transforms and distance calculations
- segmentation/manual split behavior
- chart config builders

Prioritize new unit tests for code in `src/lib/`, especially logic that is reused by multiple views or affects persisted match data.

## CI

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch. It installs with `npm ci` and runs `npm run ci`.

The existing deploy workflow still builds and deploys GitHub Pages. CI is the general quality gate; deploy remains the publishing path.
