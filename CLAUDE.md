# nrlschedulescraper Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-28

## Active Technologies

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
- 005-serverless-edge-refactor: Migrated to Cloudflare Workers with Hono, LinkedOM, in-memory caching


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
