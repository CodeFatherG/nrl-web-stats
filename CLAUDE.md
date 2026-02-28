# nrlschedulescraper Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-28

## Active Technologies
- TypeScript 5.x with strict mode + Hono (HTTP), LinkedOM (parsing), Zod (validation), React 18, MUI 5.x (006-team-streak-analysis)
- In-memory (computed on-demand from existing fixture/ranking data) (006-team-streak-analysis)
- TypeScript 5.x with strict mode + Zod (validation at boundaries — reuses existing dependency). No new dependencies. (007-core-domain-model)
- N/A (interfaces only — no concrete implementations in this phase) (007-core-domain-model)
- TypeScript 5.x with strict mode + Hono (HTTP framework — handlers only), Zod (validation — handlers only), LinkedOM (scraper), Vitest (testing) (008-application-service-layer)
- In-memory singleton store (`src/database/store.ts`) with indexed Maps (008-application-service-layer)

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

## Recent Changes
- 008-application-service-layer: Added TypeScript 5.x with strict mode + Hono (HTTP framework — handlers only), Zod (validation — handlers only), LinkedOM (scraper), Vitest (testing)
- 007-core-domain-model: Added TypeScript 5.x with strict mode + Zod (validation at boundaries — reuses existing dependency). No new dependencies.
- 006-team-streak-analysis: Added TypeScript 5.x with strict mode + Hono (HTTP), LinkedOM (parsing), Zod (validation), React 18, MUI 5.x


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
