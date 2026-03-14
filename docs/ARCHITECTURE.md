# Backend Architecture

## Worker Entry Point

The application runs as a Cloudflare Worker using the Hono HTTP framework. The entry point (`src/worker.ts`) exports two handlers:

**Fetch Handler** (HTTP requests):
1. Sets debug mode based on environment
2. Lazy-initializes D1-dependent dependencies on first request
3. Hydrates the in-memory fixture store from D1 on cold start
4. Refreshes strength ratings if Monday 4pm AEST boundary has passed
5. Mounts all API routes under `/api`
6. Serves static frontend files via ASSETS binding, with SPA fallback to `index.html`

**Scheduled Handler** (Cron triggers):
1. Invalidates all fixture cache entries (Monday trigger)
2. Finds completed rounds needing result scraping
3. Finds rounds needing player stats scraping
4. Executes scrapes sequentially, avoiding duplicate work

## Middleware

**CORS** (`src/api/middleware/cors.ts`):
- Origin: `*` (permissive)
- Methods: GET, POST, OPTIONS
- Headers: Content-Type
- Max-Age: 600 seconds

**Logger** (`src/api/middleware/logger.ts`):
- Request logging: method, path on entry
- Response logging: method, path, status, duration (ms) on exit
- Error logging: catches unhandled errors, logs with full stack trace

## Caching Strategy

**Season/Fixture Cache** (in-memory):
- **Keys**: Year (integer)
- **Expiry**: Next Monday at 4pm AEST (6am UTC). Recalculated on each cache set.
- **Request Coalescing**: Multiple concurrent requests for the same year share a single upstream fetch. In-flight requests tracked in a `Map<number, Promise>`.
- **Stale-While-Revalidate**: Expired cache entries are kept and returned while background refresh occurs. If refresh fails, stale data is served with an `isStale: true` flag.

**Match Result Cache** (in-memory):
- **Keys**: `results-{year}-{round}` (string)
- **TTL**: 30 minutes for in-progress rounds, 24 hours for completed rounds
- **Request Coalescing**: Deduplicates concurrent scrape requests for the same round

**Analytics Cache** (in-memory):
- **Keys**: `{type}-{teamCode}-{year}` or `{type}-{year}-{round}`
- **TTL**: 10 minutes (safety net)
- **Version Hash**: Invalidates when repository data count changes (new matches added)

## Data Storage

**In-Memory Store** (`src/database/store.ts`):
- Singleton `DatabaseState` with indexed Maps for fast lookups
- Indexes: `byYear`, `byTeam`, `byRound`, `byYearTeam`
- 17 NRL teams initialized from constants
- Rebuilt on fixture load via `rebuildIndexes()`
- Used for fixture queries, rankings, and strength calculations

**Cloudflare D1** (SQLite-based persistent storage):

*Matches table* (`src/infrastructure/persistence/d1-match-repository.ts`):
- Columns: id, year, round, home_team_code, away_team_code, home_score, away_score, status, scheduled_time, stadium, weather, home_strength_rating, away_strength_rating, created_at, updated_at
- Status enum: Scheduled (0) → InProgress (1) → Completed (2) — forward-only transitions
- Upsert logic: completed matches freeze scores and strength ratings; only null schedule fields can be backfilled
- Indexes on year, (year, round), home_team_code, away_team_code, status

*Players table* (`src/infrastructure/persistence/d1-player-repository.ts`):
- `players`: id, name, date_of_birth, team_code, position, created_at, updated_at
- `match_performances`: player_id, match_id, season, round, team_code, 60+ stat columns, is_complete, created_at, updated_at
- Composite primary key: (player_id, match_id)
- Batch upserts in 50-statement chunks (D1 batch limit)
- Indexes on team_code, season, (team_code, season), (player_id, season), (season, round)

## Scheduled Tasks

| Cron | Timing (UTC) | Timing (AEST) | Action |
|------|-------------|---------------|--------|
| `0 6 * * MON` | Monday 6am | Monday 4pm | Invalidate all fixture cache entries |
| `*/30 7-12 * 3-10 THU,FRI,SAT,SUN` | Every 30min, 7am–12pm, Thu–Sun, Mar–Oct | Every 30min, 5pm–10pm | Scrape match results and player stats for completed rounds |
