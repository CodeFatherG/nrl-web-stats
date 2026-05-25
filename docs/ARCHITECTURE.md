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

**Fixture Artifact Store** (Cloudflare KV, spec 038):
- Replaces the per-isolate `CacheStore` (deleted alongside `CacheService` port/adapter).
- **Backend**: `KvFixtureRepository` against the `CACHE` binding under prefix `fixtures:v1:` (in-memory fallback when no binding is bound).
- **Identity**: one artifact per year; key `fixtures:v1:{year}`; metadata `{ lastScrapedAt }`.
- **Reads**: every isolate reads the same artifact (cross-isolate consistent). The `database/store.ts` accessor emits a `warn` log when `lastScrapedAt` is older than 8 days.
- **Refresh**: the Monday 6am UTC cron publishes one `scrape-draw` job per active year onto the queue; the queue consumer runs `ScrapeDrawUseCase` which writes through `FixtureRepository.save`. The manual `POST /api/scrape/draw` endpoint returns 202 with a job ack (it does not scrape inline). Quota-exhausted writes throw `FixtureStoreQuotaExhaustedError` and are classified terminal by `HandleScrapeJobUseCase`.

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
- Owns the static teams registry (17 NRL teams initialised from constants).
- Fixture accessors (`getFixturesByYear`, `getFixturesByYearTeam`) delegate to the injected `FixtureRepository` (KV-backed in production). After spec 038 there is no per-isolate fixture index here — every read goes through the durable artifact.

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

**Player Movements Cache** (`src/analytics/player-movements-cache.ts`):
- **Type**: In-memory Map singleton, instantiated once in `src/worker.ts` and shared across requests within the same isolate
- **Keys**: `"year:round"` string (e.g. `"2025:10"`)
- **Values**: `PlayerMovementsResult` — a fully-computed record including all five movement arrays (dropped, benched, promoted, returning from injury, position changed)
- **Invalidation trigger**: `ComputePlayerMovementsUseCase.execute()` calls `cache.invalidate(year, round)` at the start of each run, ensuring stale data is not served during recomputation
- **Computation trigger**: After every team-list scrape (`POST /api/team-list`) and in the scheduled cron handler, `ComputePlayerMovementsUseCase.execute(year, round)` is called. The use case computes results only when all playing teams for the round have submitted their lists — the expected team set is derived from match fixture data (`matchRepo.findByYearAndRound`), not a hardcoded constant
- **Cold-start behaviour**: On a fresh isolate start, the cache is empty. The `GET /api/player-movements` handler returns `{ pending: true }` until the next computation completes (triggered by the next team-list scrape or cron cycle — at most ~1 hour delay)
- **Round 1 edge case**: When `round === 1`, the use case stores a result with `noPreviousRound: true` and all movement arrays empty, since there is no prior round to compare against
- **Relationship to other caches**: Follows the same in-memory singleton pattern as `ResultCacheStore`, but has no TTL — entries remain until explicitly invalidated, since player movements for a given round are immutable once team lists are finalised. (`AnalyticsCache` was removed by spec 037 — see "Analytics Precomputed Artifacts" below.)

## Scheduled Tasks

| Cron | Timing (UTC) | Timing (AEST) | Action |
|------|-------------|---------------|--------|
| `0 6 * * MON` | Monday 6am | Monday 4pm | Invalidate all fixture cache entries |
| `*/30 7-12 * 3-10 THU,FRI,SAT,SUN` | Every 30min, 7am–12pm, Thu–Sun, Mar–Oct | Every 30min, 5pm–10pm | Scrape match results and player stats for completed rounds |

## Precomputed Projections (spec 034)

The four SuperCoach projection endpoints — player projection, contextual projection, contextual profile, and team rankings — read from a precomputed projection store before falling back to live computation. The store sits behind a domain port; the production backend is Cloudflare Workers KV.

### Layering

| Layer | File | Purpose |
|---|---|---|
| Domain port | `src/domain/repositories/projection-repository.ts` | `ProjectionRepository` interface + `ProjectionStoreQuotaExhaustedError`. Domain vocabulary only — no "cache", "TTL", "key", or backend names. |
| KV adapter | `src/infrastructure/cache/kv-projection-repository.ts` | Cloudflare KV implementation. Internal key format, JSON envelope, quota-exhausted detection all live here. |
| In-memory adapter | `src/infrastructure/cache/in-memory-projection-repository.ts` | Unit-test default + local-dev fallback when `env.CACHE` is unset. |
| Watermark service | `src/application/services/current-watermark.ts` | Shared `currentWatermark(year)` used by both the read-path staleness check and the discovery trigger predicate. |
| Precompute use case | `src/application/use-cases/precompute-projections.ts` | Writes every player aggregate, every (team, mode) rankings aggregate, and the precompute status record (written last for monotonic advancement). |
| Read-path use cases | `src/application/use-cases/get-{player-projection,team-projection-rankings,contextual-projection,contextual-profile}.ts` | All four: try repo, fall back to live on miss/stale, never write. |
| Composition root | `src/worker.ts` | The only file that names a concrete adapter. Swapping KV → Upstash requires editing only this file. |

### Trigger: a job, not a cron

The precompute fires via a new `precompute-projections` variant of the `ScrapeJob` discriminated union. `EnqueueDueScrapesUseCase` evaluates a watermark predicate every discovery tick: when `currentWatermark(year) > status.asOfRound` (or no status exists), it publishes one job. The job is consumed by `HandleScrapeJobUseCase`, which dispatches to `PrecomputeProjectionsUseCase`. There is no separate cron entry, no fan-in counter, and no delayed delivery — the existing discovery cadence is the trigger cadence.

### Watermark definition (single source of truth)

A round `R` for year `Y` is "complete" iff **every** scheduled fixture in `R` has: a match result row, player stats rows for both teams, and supplementary stats for the round. The watermark is `max{R : R complete}`; 0 when no round qualifies. This same function gates both the trigger and the read-path staleness check — they cannot drift.

### Failure handling

| Failure | Behaviour |
|---|---|
| Read-side: miss / stale aggregate | Fall through to live computation (transparent to user) |
| Read-side: store unavailable | Logged, fall through to live (SC-008) |
| Write-side: any error mid-run | Precompute throws, queue retry/DLQ applies |
| Write-side: KV daily-write quota exhausted | Wrapped in `ProjectionStoreQuotaExhaustedError`; `classifyError` in the dispatcher classifies as **terminal** → straight to DLQ (no retry, since the budget cannot replenish until the daily reset). The next discovery tick after reset republishes the job automatically. |

### Schema evolution

The wire envelope carries a `schemaVersion` field. On schema-version mismatch, the adapter returns `null` (treated as a miss). To roll out an aggregate-shape change, bump `CURRENT_SCHEMA_VERSION` in `src/infrastructure/cache/projection-envelope.ts` and deploy — old artifacts read as misses, the next precompute overwrites them.

### Wrangler bindings

```jsonc
"kv_namespaces": [
  { "binding": "CACHE", "id": "<staging-or-production-namespace-id>" }
]
```

## Precomputed Player Movements (spec 035)

The `GET /api/player-movements` endpoint reads from a durable artifact store written by a `compute-player-movements` queue job. This replaces the per-isolate `Map<string, PlayerMovementsResult>` that previously held the result. The store sits behind a domain port; the production backend is the same Cloudflare KV namespace used for projections (spec 034), but under a different prefix so the two artifact families coexist.

### Layering

| Layer | File | Purpose |
|---|---|---|
| Domain port | `src/domain/repositories/player-movements-repository.ts` | `PlayerMovementsRepository` interface + `PlayerMovementsStoreQuotaExhaustedError`. Domain vocabulary only — no "cache", "TTL", "KV". |
| KV adapter | `src/infrastructure/persistence/kv-player-movements-repository.ts` | Keys `player-movements:v1:{year}:{round}`, listing-only `findMostRecentRound`/`listCoveredRounds`, quota-exhausted detection. |
| In-memory adapter | `src/infrastructure/persistence/in-memory-player-movements-repository.ts` | Unit-test default + local-dev fallback when `env.CACHE` is unset. |
| Wire envelope | `src/infrastructure/persistence/player-movements-envelope.ts` | `{ schemaVersion, computedAt, payload }`. Empty freshness block — round is in the key, not the envelope. |
| Compute use case | `src/application/use-cases/compute-player-movements.ts` | Refactored to write through the repository. Phase 1/2/3 algorithm unchanged. |
| Read handler | `src/api/handlers.ts` (`getPlayerMovements`) | Reads `findMostRecentRound` → `findByYearAndRound`; emits `{ available }` envelope. No live compute on the read path. |
| Composition root | `src/worker.ts` | Selects `KvPlayerMovementsRepository` when `env.CACHE` is bound, `InMemoryPlayerMovementsRepository` otherwise. |

### Trigger: a job with two enqueue paths

The `compute-player-movements` variant of `ScrapeJob` is fired by either of:
1. **Cron discovery** (`EnqueueDueScrapesUseCase`) — gap-set predicate. Each tick, query `TeamListRepository.findRoundsWithCompleteTeamLists(year)` and `PlayerMovementsRepository.listCoveredRounds(year)`; publish one job per round in the difference.
2. **Post-scrape signal** (`ScrapeTeamListsUseCase`) — after a successful round scrape, if `expectedTeams === presentTeams`, publish a job directly.

Both paths can fire for the same `(year, round)`. Double-runs are tolerated; writes are idempotent under last-write-wins.

### Freshness model

`(year, round)` is the artifact's identity. There is no staleness check on the read path — the store either has the artifact (correct) or it does not (return `{ available: false }`). Freshness is maintained on the write path: any subsequent team-list update for the round re-triggers the precompute via the post-scrape signal or the next cron tick, and the new artifact overwrites the old under last-write-wins.

### Failure handling

| Failure | Behaviour |
|---|---|
| Read-side: artifact missing | Handler returns HTTP 200 `{ "available": false }`. No live computation. |
| Read-side: schema-version mismatch | Adapter returns `null` → handler emits `{ "available": false }`. Next precompute overwrites. |
| Write-side: precondition fails (`expectedTeams > presentTeams`) | Use case logs a warning and returns without writing. Job is acked. The next discovery tick will retry. |
| Write-side: KV quota exhausted | Wrapped in `PlayerMovementsStoreQuotaExhaustedError`; `classifyError` classifies as **terminal** → DLQ (no retry). The next tick after daily reset republishes. |
| `env.CACHE` absent | Composition root selects `InMemoryPlayerMovementsRepository`. Reads + writes both work; contents do not survive isolate recycling. |

## Game Strength Ratings (spec 036)

The `GET /api/supercoach/:year/game-strength/:round` endpoint reads from a unified `GameStrengthRepository` port whose composite adapter routes internally to two backing stores:

| Store | Backend | Holds | Stability |
|-------|---------|-------|-----------|
| Locked | D1 (`game_strength_ratings` table) | The canonical, immutable rating for each round once supplementary stats for the previous round are scraped. INSERT OR IGNORE. | Permanent — never overwritten. |
| Provisional | Cloudflare KV (`gsr-provisional:v1:{year}:{round}`) OR in-memory Map (no `CACHE` binding) | Best-current rating for future rounds, recomputed every time a round locks. | Last-write-wins; deleted by year on each recompute cycle. |

This replaces the per-isolate `gameStrengthCache` Map that previously held provisional ratings (deleted by spec 036). Cold isolates and warm isolates now see the same provisional values.

### Layering

| Layer | File | Purpose |
|---|---|---|
| Domain port | `src/domain/repositories/game-strength-repository.ts` | `GameStrengthRepository` interface + `GameStrengthArtifact` read return type + `GameStrengthStoreQuotaExhaustedError`. Domain vocabulary only — no "cache", "TTL", "KV", "D1". |
| Composite adapter | `src/infrastructure/persistence/composite-game-strength-repository.ts` | Routes `read` D1-first then KV; routes write operations to the appropriate backend; re-wraps sub-adapter quota errors as the port's named error. |
| D1 sub-adapter | `src/infrastructure/persistence/d1-game-strength-repository.ts` | INSERT OR IGNORE; surfaces `locked_at` on reads. |
| KV sub-adapter | `src/infrastructure/persistence/kv-provisional-game-strength-repository.ts` | Keys `gsr-provisional:v1:{year}:{round}`; listing-only `listProvisionalRounds`; quota-exhausted detection. |
| In-memory sub-adapter | `src/infrastructure/persistence/in-memory-provisional-game-strength-repository.ts` | Unit-test default + local-dev fallback when `env.CACHE` is unset. |
| Wire envelope (KV-only) | `src/infrastructure/persistence/provisional-game-strength-envelope.ts` | `{ schemaVersion, computedAt, payload: RoundGSR }`. Empty metadata field. |
| Use cases | `src/application/use-cases/get-game-strength.ts`, `lock-game-strength-ratings.ts` | Take ONE `GameStrengthRepository` constructor arg. |
| Read handler | `src/api/handlers.ts` (`getGameStrengthRatings`) | Returns the bare `RoundGSR` on hit, `{ "available": false }` on miss (default half-life only). |
| Composition root | `src/worker.ts` | Builds the composite per-request (D1 sub-adapter is request-scoped). |

### Trigger: `recompute-game-strength` queue job

The `recompute-game-strength` variant of `ScrapeJob` (renamed from `lock-game-strength-ratings` by spec 036) is fired by either of:
1. **Cron discovery** (`EnqueueDueScrapesUseCase`) — gap-set predicate. Each tick, compute `(allRounds in year) ∖ (listLockedRounds(year) ∪ listProvisionalRounds(year))`; publish ONE job per year per tick when the gap is non-empty AND at least one round has supp-stats cached (for the `completedRound` parameter).
2. **Post-scrape signal** (`ScrapeSupplementaryStatsUseCase`) — after a successful supp-stats scrape, publish a job with `completedRound = round-just-scraped`. Constructor takes optional `JobProducer`; failure to publish is logged but does not fail the scrape.

Both paths converge on the same idempotent handler (`LockGameStrengthRatingsUseCase`). Redundant invocations are tolerated (D1 INSERT OR IGNORE; KV last-write-wins).

### Failure handling

| Failure | Behaviour |
|---|---|
| Read-side: neither store has the artifact | Handler returns HTTP 200 `{ "available": false }`. No live computation (for default half-life). |
| Read-side: schema-version mismatch in KV | KV sub-adapter returns `null` → composite falls back to provisional miss → handler emits `{ "available": false }`. Next recompute overwrites. |
| Write-side: D1 INSERT OR IGNORE no-ops on conflict | Benign — round was already locked. Job continues with provisional writes. |
| Write-side: KV provisional quota exhausted | Wrapped in `GameStrengthStoreQuotaExhaustedError`; `classifyError` classifies as **terminal** → DLQ. The D1 lock from earlier in the same batch is NOT rolled back. Next tick after daily reset republishes. |
| Write-side: KV `deleteProvisional` fails after a successful lock | Logged, tolerated (FR-012). The stale provisional is shadowed by the locked D1 row on the read path. Next recompute retries the delete. |
| `env.CACHE` absent | Composite uses `InMemoryProvisionalGameStrengthRepository`. D1 half is unaffected. Provisional state is per-isolate and not durable. |

### Custom half-life path

Custom half-life requests (`?halfLife=N` for any `N ≠ DEFAULT_HALF_LIFE`) bypass the repository entirely and compute on demand. The stored artifacts are keyed by `(year, round)` only — half-life is a computation parameter, not part of the artifact's identity.

Both `env.staging` and `env.production` declare the binding with the same `"CACHE"` name; the namespace IDs differ.

### On-demand precompute (operator runbook, FR-008)

There is **no in-app HTTP trigger or admin endpoint**. On-demand precompute is an operator action, supported in two ways:

**Production / staging** — publish a job directly to the queue:

```bash
wrangler queues producer send nrl-scrape-queue-staging \
  --body '{"type":"precompute-projections","version":1,"year":2026,"asOfRound":12}' \
  --env staging
wrangler tail --env staging  # watch the consumer
```

Swap the queue name and `--env` for production. Use cases: backfill after a manual data fix, recovery from a DLQed run, forcing a refresh outside the normal discovery cadence.

**Local dev** — invoke `PrecomputeProjectionsUseCase.execute()` directly with the in-memory adapter (no KV needed). See `specs/034-precomputed-projections/quickstart.md` §3a for the snippet.

### Swapping the backend (FR-013 / SC-006)

To replace Cloudflare KV with a different store (e.g. Upstash Redis):
1. Implement `ProjectionRepository` in `src/infrastructure/cache/<your>-projection-repository.ts`.
2. Edit `src/worker.ts` — replace the single `new KvProjectionRepository(env.CACHE)` line with the new adapter constructor.
3. Update `wrangler.jsonc` to add the new binding(s) and remove `kv_namespaces`.

No use case, handler, domain type, or production test should require changes.

### Budget

- Single weekly precompute: ~569 writes (one per active player + 17 teams × 4 modes + 1 status). Comfortably inside the 1,000 writes/day free-tier ceiling, with ~431 writes of headroom.
- Overlap risk: a concurrent precompute against the same watermark would consume another ~569 writes — exceeding the daily cap. Tolerated because (a) overlap is rare in practice (queue redelivery or sub-precompute-duration discovery cadence are both unusual), and (b) the second run's first write raises `ProjectionStoreQuotaExhaustedError` and routes to DLQ — operationally visible.

## Analytics Precomputed Artifacts (spec 037)

Spec 037 replaced the per-isolate `AnalyticsCache` (a `Map<string, CacheEntry<unknown>>` with version-hash + 10-minute TTL invalidation) with four typed precomputed-artifact repositories, mirroring the spec-034/035/036 pattern.

### Affected endpoints

- `GET /api/analytics/form/:year/:teamCode` — backed by `TeamFormRepository`
- `GET /api/analytics/outlook/:year/:round` — backed by `MatchOutlookRepository`
- `GET /api/analytics/trends/:year/:teamCode` — backed by `PlayerTrendsRepository`
- `GET /api/analytics/composition/:year/:teamCode` — backed by `CompositionImpactRepository`

All four endpoints now return an **AvailabilityEnvelope** (HTTP 200 in both branches):

```json
// hit
{ "available": true, "asOfRound": 8, "data": { ...existing payload... } }
// miss
{ "available": false, "asOfRound": null, "reason": "precompute-pending" }
```

### Identities and key prefixes

- Identity: `(teamCode, year)` for team-form / player-trends / composition-impact; `(year, round)` for match-outlook.
- `windowSize` and `significantOnly` are NOT part of the identity. Requests with non-default values bypass the artifact store and run live compute on the request thread.
- KV prefixes (non-colliding with spec-034/035/036):
  - `team-form:v1:{year}:{teamCode}`
  - `match-outlook:v1:{year}:{round}`
  - `player-trends:v1:{year}:{teamCode}`
  - `composition-impact:v1:{year}:{teamCode}`

### Envelope shape

`{ schemaVersion: 1, asOfRound, computedAt, payload: <identity + body> }`. KV `metadata` carries `{ asOfRound }` so cron-discovery can probe coverage via `kv.list` without value reads.

### New `ScrapeJob` variants

Added to the discriminated union in `src/application/ports/job-queue.ts`:

- `precompute-team-form { year, asOfRound, teamCode }`
- `precompute-match-outlook { year, asOfRound, round }`
- `precompute-player-trends { year, asOfRound, teamCode }`
- `precompute-composition-impact { year, asOfRound, teamCode }`

Each leaf job runs the existing analytics service for its identity and writes one envelope to the relevant repository.

### Watermark

All four artifacts use the same watermark predicate as spec-034 projections — `currentWatermark(year)` in `src/application/services/current-watermark.ts`. Round R is "complete" iff every fixture has a match result, player stats for both teams, and supplementary stats for the round.

### Discovery

`EnqueueDueScrapesUseCase` adds a new section (11) after the existing projection-precompute section. For each of the four artifact families it lists stored asOfRounds via metadata-only `kv.list`, diffs against the expected identity set for the current year, and publishes one leaf job per gap. Cost: 4 `kv.list` calls per tick (current-year-only fan-out per spec 037 FR-009).

### Contextual-profile / projection cleanup

The two contextual use cases (`get-contextual-profile`, `get-contextual-projection`) no longer reference `AnalyticsCache`. Their primary memoisations and the secondary `OpponentDefensiveProfile` sub-caches were removed. The `SPEC-034-READTHROUGH` blocks remain — projection-store durability replaces the deleted RAM layer.

### Quota

All four repositories raise typed `*StoreQuotaExhaustedError` (e.g. `TeamFormStoreQuotaExhaustedError`) which `HandleScrapeJobUseCase.classifyError` routes to terminal (DLQ). Pattern verbatim from spec 034.

### Removed

- `src/analytics/analytics-cache.ts` (class)
- `tests/unit/analytics-cache.test.ts`
- The `const analyticsCache = new AnalyticsCache()` singleton in `src/worker.ts`
- The 10-minute TTL safety net (replaced by watermark-driven invalidation)

## Precomputed Team-Strength Rankings (spec 039)

The team-strength-rankings artifact — the schedule-difficulty classifier
behind the `/api/rankings/...` endpoints — is now KV-backed under the
same precomputed-artifact pattern (it is the ninth concrete instance).
Three sub-artifacts per year are stored under the `team-strength-rankings:v1:`
KV prefix:

- `team-strength-rankings:v1:{year}:thresholds`
- `team-strength-rankings:v1:{year}:season`
- `team-strength-rankings:v1:{year}:round:{round}`

Each sub-artifact carries `{ asOfRound }` KV metadata so the discovery
predicate can probe coverage via `kv.list` keys-only.

| Component | Location | Notes |
|---|---|---|
| Domain port | `src/domain/repositories/team-strength-rankings-repository.ts` | `TeamStrengthRankingsRepository` interface + `TeamStrengthRankingsStoreQuotaExhaustedError` + `RankingsYearPayload`. Batched `saveYear(year, asOfRound, payload)` writes thresholds → season → rounds (ascending). |
| KV adapter | `src/infrastructure/persistence/kv-team-strength-rankings-repository.ts` | Cloudflare KV implementation. Quota wrapping via the spec-037 regex; partial-write tolerance (failed mid-batch writes leave a "stale" sub-artifact that the discovery predicate detects via `?? -1`). |
| In-memory adapter | `src/infrastructure/persistence/in-memory-team-strength-rankings-repository.ts` | Unit-test default + local-dev fallback when `env.CACHE` is unset. |
| Envelope codec | `src/infrastructure/persistence/team-strength-rankings-envelope.ts` | Zod-validated `schemaVersion: 1` envelopes per sub-artifact subtype; Map↔tuple-array serialisation for season + round payloads. |
| Pure-fn module | `src/domain/team-strength-rankings.ts` | `getCategoryFromThresholds`, `getCategoryFromPercentile` — moved here from the deleted `src/database/rankings.ts`. |
| Compute use case | `src/application/use-cases/compute-team-strength-rankings.ts` | One fixture-scan per year, all three sub-artifacts derived from the same snapshot, then `saveYear` writes them under a single watermark. Cold-start (no fixtures) logs at warn and returns successfully (non-terminal — re-enqueued by the next discovery tick). |
| Read use case | `src/application/use-cases/get-team-strength-rankings.ts` | Four read methods: `getSeasonThresholds`, `getSeasonRanking`, `getRoundRanking`, `getAllSeasonRankings`. Each consults the repository AND `watermarkFn(year)`; returns `null` on miss or watermark mismatch. NO live-compute fallback. |
| New queue variant | `src/application/ports/job-queue.ts` | `precompute-team-strength-rankings { year, asOfRound }`. Distinct from the pre-existing `precompute-team-rankings` (player-projection leaf). |
| Dispatch arm | `src/application/use-cases/handle-scrape-job.ts` | Routes the new job to `ComputeTeamStrengthRankingsUseCase`; `TeamStrengthRankingsStoreQuotaExhaustedError` is classified terminal. |
| Discovery | `src/application/use-cases/enqueue-due-scrapes.ts` | Per-tick gap-set probe: one batched job per active year whose stored `asOfRound` lags the watermark or whose round-rankings keys are partially missing. |
| Post-scrape signal | `src/application/use-cases/scrape-supplementary-stats.ts` | On every successful supp-stats scrape, publishes a `precompute-team-strength-rankings` job alongside the existing `recompute-game-strength` signal. |

### API wire format

The three rankings endpoints return the standard availability envelope on
cold-start or watermark-mismatch (HTTP 200 in both branches):

```json
{ "available": false, "asOfRound": null, "reason": "precompute-pending" }
```

### Removed

- `src/database/rankings.ts` (module-level `Map`-based caches + `clearRankingsCache`)
- `setRankingsCacheClearFn` from `src/database/store.ts` (cross-cutting registration hook — no remaining consumers)
- `src/application/ports/ranking-service.ts`
- `src/application/adapters/ranking-service-adapter.ts` (single consumer of the deleted `database/rankings.ts` free functions)
- `tests/unit/database/rankings-fixture-reads.test.ts` (asserted coalescing of the deleted in-process Map)
- `tests/unit/season-thresholds.test.ts` (math half migrated into the compute use-case test; pure-utility half lives at `tests/unit/domain/team-strength-rankings.test.ts`)
