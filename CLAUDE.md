# nrlschedulescraper Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-28

## Active Technologies
- TypeScript 5.x with strict mode + Hono (HTTP), LinkedOM (parsing), Zod (validation), React 18, MUI 5.x (006-team-streak-analysis)
- In-memory (computed on-demand from existing fixture/ranking data) (006-team-streak-analysis)
- TypeScript 5.x with strict mode + Zod (validation at boundaries — reuses existing dependency). No new dependencies. (007-core-domain-model)
- N/A (interfaces only — no concrete implementations in this phase) (007-core-domain-model)
- TypeScript 5.x with strict mode + Hono (HTTP framework — handlers only), Zod (validation — handlers only), LinkedOM (scraper), Vitest (testing) (008-application-service-layer)
- In-memory singleton store (`src/database/store.ts`) with indexed Maps (008-application-service-layer)
- TypeScript 5.x with strict mode + Hono (HTTP), LinkedOM (HTML parsing), Zod (validation), Vitest (testing) (009-scraper-adapters)
- In-memory Maps within worker isolate (no persistent storage) (009-scraper-adapters)
- TypeScript 5.x with strict mode + Hono (HTTP framework), Zod (validation), Vitest (testing). No new dependencies — nrl.com returns JSON, so LinkedOM/HTML parsing is not needed for this adapter. (010-nrl-match-results)
- In-memory Maps within worker isolate (`InMemoryMatchRepository`), no persistent storage (010-nrl-match-results)
- TypeScript 5.x with strict mode + Hono (HTTP), Zod (validation), D1 (database) (011-player-stats-persistence)
- Cloudflare D1 (SQLite-based, native Workers binding) (011-player-stats-persistence)
- TypeScript 5.x with strict mode + Hono (HTTP framework), Zod (validation), React 18, MUI 5.x (frontend) (012-analytics-engine)
- Computed on-demand from existing repositories (MatchRepository in-memory, PlayerRepository on D1, FixtureRepository in-memory). Analytics results cached in-memory. (012-analytics-engine)
- TypeScript 5.x with strict mode + Hono (HTTP), Zod (validation), Vitest (testing) (013-match-persistence)
- Cloudflare D1 (SQLite-based, native Workers binding) — same DB as player stats (013-match-persistence)
- TypeScript 5.x with strict mode + Hono (HTTP), Wrangler (deployment), GitHub Actions (CI/CD) (014-staging-environment)
- Cloudflare D1 (two databases: staging + production) (014-staging-environment)
- TypeScript 5.x with strict mode + Hono (HTTP), React 18, MUI 5.x (frontend), Zod (validation), Vitest (testing) (015-match-view-details)
- Cloudflare D1 (matches, player stats) + in-memory cache (fixtures, rankings) (015-match-view-details)
- TypeScript 5.x with strict mode + Hono (HTTP), React 18, MUI 5.x, Zod (validation) (016-match-detail-view)
- Cloudflare D1 (matches + player stats), in-memory cache (fixtures, rankings, teams) (016-match-detail-view)
- Markdown (documentation only — no application code changes) + N/A (no runtime dependencies) (017-project-documentation)
- TypeScript 5.x with strict mode + React 18, MUI 5.x (existing — no new dependencies added) (018-url-routing)
- N/A (client-side routing only) (018-url-routing)

**Current Stack (Cloudflare Workers - Serverless Edge):**
- TypeScript 5.x with strict mode
- Hono (edge-native HTTP framework)
- LinkedOM (HTML parsing for Workers runtime)
- Zod (validation)
- React 18, MUI 5.x (frontend)
- Vite (frontend build)
- In-memory cache within worker isolate (no persistent storage)

## Project Structure

```text
src/
  api/          # Hono routes and handlers
    middleware/ # CORS, logging middleware
  cache/        # In-memory cache with request coalescing
  database/     # In-memory data store and queries
  models/       # Types, schemas, team data
  scraper/      # HTML fetching and parsing
  utils/        # Logger, error utilities
  worker.ts     # Cloudflare Worker entry point
client/         # React frontend (SPA)
tests/
  unit/         # Unit tests for cache, etc.
  integration/  # Miniflare integration tests
  contract/     # API contract tests
```

## Commands

```bash
npm test              # Run all tests (vitest)
npm run build         # Build worker + frontend
npm run build:worker  # Build worker only (esbuild)
npm run build:frontend # Build frontend (vite)
npm run dev           # Start wrangler dev server
npm run deploy        # Deploy to Cloudflare Workers
```

## Code Style

TypeScript 5.x strict mode: Follow standard conventions

## Key Implementation Details

- **HTML Parsing**: Uses LinkedOM instead of Cheerio (Workers-compatible)
- **Caching**: Monday 4pm AEST weekly expiry with request coalescing
- **Static Files**: Served via Cloudflare Workers Sites (ASSETS binding)
- **Scheduled Tasks**: Cron trigger for cache invalidation (Monday 6am UTC)

## Documentation Maintenance

When modifying the codebase, update the relevant file in `docs/` to keep documentation in sync:

| If you change... | Update this file |
|------------------|-----------------|
| API routes (add/modify/remove endpoints) | `docs/API.md` — document method, path, all parameters, response shape, errors |
| Scraping logic or data sources | `docs/SCRAPING.md` — document URLs, extracted fields, schedule |
| Analytics services (add/modify algorithms) | `docs/ANALYTICS.md` — document inputs, computation, outputs |
| Frontend views or components | `docs/UI.md` — document purpose, interactions, navigation |
| Caching, storage, middleware, or cron | `docs/ARCHITECTURE.md` — document the change |

Include documentation updates in the same commit or PR as the code change. See Constitution Principle VII.

## Recent Changes
- 018-url-routing: Added TypeScript 5.x with strict mode + React 18, MUI 5.x (existing — no new dependencies added)
- 017-project-documentation: Added Markdown (documentation only — no application code changes) + N/A (no runtime dependencies)
- 016-match-detail-view: Added TypeScript 5.x with strict mode + Hono (HTTP), React 18, MUI 5.x, Zod (validation)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
