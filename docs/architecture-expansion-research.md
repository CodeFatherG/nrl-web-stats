# Architecture Expansion Research: Multi-Source NRL Data Platform

**Date:** 2026-02-28
**Scope:** Expanding nrlschedulescraper from a single-source schedule scraper to a multi-source NRL data aggregation platform with persistent storage and trend analysis.

**Target expansion:**
- Scrape nrl.com for match results (status, scores, scheduled times)
- Scrape player statistics and team statistics from nrl.com
- Persist historic player data to a database (local or remote)
- Aggregate data across sources to provide trend insights and future predictions

---

## Part 1: Identified Expandability Issues

### 1.1 Monolithic Scraper Pipeline (Critical)

The entire scraper layer is a single hardcoded pipeline with no abstraction boundaries.

**`src/scraper/fetcher.ts:9`** — The source URL is a module-level constant:
```typescript
const BASE_URL = 'https://www.nrlsupercoachstats.com/drawV2.php';
```

**`src/scraper/parser.ts:123-274`** — `parseScheduleHtml()` is a 150-line function whose logic is entirely specific to the HTML table structure of one page on nrlsupercoachstats.com. It searches for `<table>` elements containing header cells matching `/^Rd\d+$/i`, extracts team codes from `<img>` elements via URL pattern matching, and parses cell text with regex patterns like `/^([A-Z]{3})(\(A\))?\s*(-?\d+)/i`.

**`src/scraper/index.ts:18-47`** — `scrapeAndLoadSchedule()` chains `fetchScheduleHtml` → `parseScheduleHtml` → `loadFixtures` with no extension point. Adding a second source means duplicating this entire pipeline.

**Impact:** There is no concept of a "data source" in the system. To add nrl.com scraping, you would need to write an entirely parallel pipeline (fetcher, parser, loader) with zero shared infrastructure, then manually wire it into the handler layer.

### 1.2 Single Entity Type (Critical)

The system has one domain entity: `Fixture` (`src/models/fixture.ts:5-22`). It represents a team's schedule entry for a round with a strength rating. It has no concept of:

- **Match results** — scores, winner, margin, completion status
- **Player statistics** — tries, tackles, run metres, fantasy points
- **Team statistics** — aggregate season performance, for/against, ladder position
- **Data provenance** — which source provided which data point

The `CompactMatch` type in `src/models/types.ts:129-140` has `homeScore`, `awayScore`, `scheduledTime`, and `isComplete` fields, but these are always hardcoded to `null`/`false` in handlers (`src/api/handlers.ts:507-509`). The shape exists but there is no pathway to populate it.

### 1.3 Global Mutable Singleton Store (High)

**`src/database/store.ts:28`** — The database is a module-level `let db: DatabaseState | null = null` singleton. The `DatabaseState` interface (`src/database/store.ts:11-25`) has a single `fixtures: Fixture[]` array with four index Maps.

**Problems for multi-source expansion:**
- **Single entity storage:** Adding match results or player stats would require adding new arrays and indexes to this one monolithic state object, growing it unboundedly.
- **Replace-on-load semantics:** `loadFixtures()` (`src/database/store.ts:69-95`) removes all fixtures for a year and replaces them. If two sources contribute data to the same year, the second load overwrites the first.
- **Full index rebuild:** Every `loadFixtures()` call triggers `rebuildIndexes()` which iterates every fixture across all years. This scales poorly as data volume grows.
- **No persistence:** All data lives in-memory within a Cloudflare Worker isolate. Player statistics described as "historic never changing data" cannot survive isolate recycling without a persistence layer.

### 1.4 Hardcoded Team Identity (Medium)

**`src/models/team.ts:13-31`** — Team codes and names are compile-time constants (`TEAM_NAMES` record, `VALID_TEAM_CODES` array). These are used directly in validation schemas, handler logic, and parser image mapping.

Different sources use different identifiers for the same team. nrl.com uses numeric IDs and full slug names (`brisbane-broncos`), while supercoachstats uses 3-letter codes and image URL fragments. There is no identity mapping layer to normalize across sources.

### 1.5 Business Logic in HTTP Handlers (High)

**`src/api/handlers.ts`** — All 13 handlers contain inline business logic:
- `getTeamSchedule` (lines 107-172) — queries fixtures, computes round rankings, calculates totals, determines thresholds, and shapes the response all in one function.
- `getRoundDetails` (lines 256-300) — groups fixtures into matches and byes with inline Map manipulation.
- `getSeasonSummary` (lines 465-534) — builds 27-round data structures with inline fixture processing.

There is no service or use-case layer. This means:
- Business logic cannot be reused outside HTTP context (CLI tools, batch jobs, data pipelines).
- Adding multi-source aggregation would require stuffing orchestration logic into handlers.
- Testing business rules requires spinning up HTTP context.

### 1.6 Single-Dimension Cache (Medium)

**`src/cache/store.ts`** — Cache entries are keyed by `year` only, with a uniform Monday 4pm AEST expiry. This assumes all data has the same freshness cadence.

Match results update after every game (multiple times per week during the season). Player stats update post-match. Draw/schedule data updates pre-season. A single expiry policy cannot serve sources with fundamentally different staleness profiles.

### 1.7 No Persistence Layer (Critical for Player Data)

The entire system is ephemeral — data exists only in the Worker isolate's memory and is re-scraped on cache miss. The user's requirement that "player data being historic never changing data would be written to a database" is completely unsupported. There is:
- No database driver or ORM
- No migration system
- No repository abstraction over storage
- No concept of persistent vs ephemeral data

---

## Part 2: DDD Patterns and Their Benefits

### 2.1 Bounded Contexts

**Pattern:** Divide the system into distinct areas of responsibility, each with its own ubiquitous language, models, and data ownership.

**Proposed contexts for NRL data platform:**

| Bounded Context | Responsibility | Data Ownership |
|---|---|---|
| **Schedule** | Draw/fixture data, bye rounds, venue assignments, strength ratings | Ephemeral (scraped, cached) |
| **Match Results** | Scores, completion status, scheduled times | Ephemeral current season; persistent historical |
| **Player Statistics** | Individual player per-match and career statistics | Persistent (database) |
| **Team Statistics** | Aggregate team stats, ladder positions, for/against | Derived from Match Results + Player Stats |
| **Analytics** | Rankings, streaks, trend analysis, predictions | Computed on-demand from other contexts |

**Benefit:** Each context evolves independently. Adding player statistics doesn't require modifying the schedule scraper. The analytics context consumes from others without knowing their implementation details.

### 2.2 Ports and Adapters (Hexagonal Architecture)

**Pattern:** Define interfaces (ports) in the domain layer. Infrastructure code (adapters) implements these interfaces. The domain never depends on infrastructure — dependencies always point inward.

**Application to scraper expansion:**

```
Domain ports (interfaces):              Infrastructure adapters:
─────────────────────────               ─────────────────────────
DrawDataSource                     →    SuperCoachStatsAdapter
MatchResultSource                  →    NrlComMatchResultAdapter
PlayerStatsSource                  →    NrlComPlayerStatsAdapter
FixtureRepository                  →    InMemoryFixtureRepository
PlayerRepository                   →    D1PlayerRepository / SQLitePlayerRepository
MatchResultRepository              →    InMemoryMatchResultRepository
```

**Benefit:** Adding nrl.com as a source means writing a new adapter that implements an existing port. No domain logic changes. No handler changes. No existing scraper modifications. Each adapter encapsulates the HTML structure, URL patterns, and data normalization for its specific source.

### 2.3 Aggregates and Entities

**Pattern:** Group related entities into aggregates with clear consistency boundaries. One entity is the aggregate root that controls access to the group.

**Current state:** A single flat `Fixture` entity represents everything.

**Proposed aggregate structure:**

```
Match (Aggregate Root)
├── fixture data (schedule, home/away, strength rating)  ← from supercoachstats
├── result (scores, completion status, scheduled time)   ← from nrl.com
└── venue assignment

Player (Aggregate Root)
├── identity (name, team, position)
├── match performances[]                                 ← from nrl.com
│   ├── tries, goals, tackles, metres
│   └── fantasy points
└── career statistics (computed)

Team (Aggregate Root)
├── identity (code, name, cross-source ID mapping)
├── season statistics (computed from matches)
└── ladder position
```

**Benefit:** The `Match` aggregate can be enriched from multiple sources. Schedule data arrives first from supercoachstats, then match results are attached from nrl.com post-game. The aggregate defines what constitutes a complete/consistent match record.

### 2.4 Value Objects

**Pattern:** Immutable objects defined by their attributes rather than identity. Used for concepts that describe characteristics of entities.

**Candidates:**
- `StrengthRating` — wraps the numeric rating with source provenance and calculation method
- `Score` — `{ home: number, away: number, margin: number }`, self-validating
- `TeamIdentity` — cross-source identity map (supercoach code, nrl.com ID, slug)
- `SeasonThresholds` — already exists conceptually, should be a proper value object
- `DateRange` — for season/round time boundaries

**Benefit:** Value objects make domain concepts explicit and self-validating. A `Score` value object can enforce that scores are non-negative. A `TeamIdentity` value object centralizes the cross-source mapping problem.

### 2.5 Domain Events

**Pattern:** Capture things that happen in the domain as first-class objects that other parts of the system can react to.

**Proposed events:**

| Event | Triggered By | Consumers |
|---|---|---|
| `DrawScraped` | Schedule source adapter | Cache invalidation, Analytics recalculation |
| `MatchResultUpdated` | Results source adapter | Match aggregate enrichment, Team stats recompute |
| `PlayerStatsRecorded` | Player stats adapter | Player aggregate update, Trend analysis |
| `SeasonDataLoaded` | Application orchestrator | All downstream consumers |

**Benefit:** Decouples scraping from processing. When nrl.com match results are scraped, a `MatchResultUpdated` event triggers the analytics context to recompute without the results adapter knowing about analytics.

### 2.6 Anti-Corruption Layer (ACL)

**Pattern:** A translation layer at the boundary between your domain and external systems that have different models.

**Critical for multi-source scraping:**
- nrlsupercoachstats.com represents teams as image URLs containing slugs like `sea-eagles`
- nrl.com may use numeric team IDs like `500014` and full names like `Manly Warringah Sea Eagles`
- Your domain uses 3-letter codes like `MNL`

The ACL sits inside each source adapter and translates external representations into domain value objects. It also handles:
- Data quality issues (missing fields, unexpected formats)
- Source-specific quirks (different round numbering, pre-season vs regular season)
- Conflict resolution when two sources disagree on the same data point

**Benefit:** The domain model stays clean. Source-specific mess is contained at the boundary. If nrl.com changes their HTML structure, only the NrlCom adapter's ACL changes.

### 2.7 Repository Pattern

**Pattern:** Provides a collection-like interface for accessing domain aggregates, abstracting the underlying storage mechanism.

**Distinct from source adapters:**
- **Source adapter** = "how to get data from an external website" (read-only, external)
- **Repository** = "how to store and query domain entities" (read-write, internal)

**Proposed repositories:**

```typescript
interface MatchRepository {
  save(match: Match): void;
  findByYearAndRound(year: number, round: number): Match[];
  findByTeam(teamCode: string, year?: number): Match[];
}

interface PlayerRepository {
  save(player: Player): void;
  findByTeam(teamCode: string, season?: number): Player[];
  findMatchPerformances(playerId: string, season: number): MatchPerformance[];
}
```

**Benefit:** Ephemeral data (current season schedule) uses `InMemoryMatchRepository`. Persistent data (historical player stats) uses `D1PlayerRepository` or `SQLitePlayerRepository`. The domain and application layers don't know or care which storage backend is used.

### 2.8 Application Services (Use Cases)

**Pattern:** Orchestrate domain operations. They know about repositories and source adapters but contain no business logic — they coordinate.

**Proposed use cases:**

```typescript
class ScrapeDrawUseCase {
  // Fetch draw from supercoachstats, store via repository
  execute(year: number): Promise<ScrapeResult>;
}

class ScrapeMatchResultsUseCase {
  // Fetch results from nrl.com, enrich existing matches
  execute(year: number, round?: number): Promise<ScrapeResult>;
}

class ScrapePlayerStatsUseCase {
  // Fetch player stats from nrl.com, persist to database
  execute(year: number, round: number): Promise<ScrapeResult>;
}

class AnalyseSeasonUseCase {
  // Compute rankings, streaks, trends from stored data
  execute(year: number): Promise<SeasonAnalysis>;
}

class PredictTrendsUseCase {
  // Use historical player/team data to project future performance
  execute(teamCode: string, year: number): Promise<TrendPrediction>;
}
```

**Benefit:** Handlers become thin wrappers that validate input and call use cases. Use cases can be composed — `ScrapeMatchResultsUseCase` can internally trigger `AnalyseSeasonUseCase` after storing new results. Business logic is testable without HTTP.

---

## Part 3: Phased Refactor Plan

### Phase 1: Domain Model Foundation

**What:** Extract domain types and introduce aggregate boundaries without changing external behaviour.

**Actions:**
- Define `Match` aggregate that composes fixture data with (initially empty) result data
- Define `Player` and `MatchPerformance` entities
- Create `TeamIdentity` value object with cross-source mapping capability
- Extract `StrengthRating`, `Score` as value objects
- Define port interfaces: `DrawDataSource`, `MatchResultSource`, `PlayerStatsSource`
- Define repository interfaces: `MatchRepository`, `PlayerRepository`

**Why this phase first:** The domain model is the foundation everything else builds on. Getting the aggregate boundaries right before writing adapters prevents costly rework. This phase changes no runtime behaviour — it's purely structural.

**Speckit prompt:**
Completed
```
Define the core domain model for an NRL data aggregation platform. This phase creates the foundational domain types, aggregate boundaries, and port interfaces that all future data sources and features will build on. No existing behaviour changes — this is purely additive structural work.

The system currently has a single Fixture entity representing schedule data. The domain model must expand to support:

1. A Match aggregate that composes fixture/schedule data (teams, home/away, round, strength rating) with match result data (scores, completion status, scheduled time). The match aggregate must be enrichable — schedule data arrives first from one source, result data is attached later from a different source.

2. A Player aggregate with identity (name, team, position) and a collection of per-match performance records (tries, goals, tackles, run metres, fantasy points). Player data is historic and immutable once recorded.

3. A TeamIdentity value object that maps a single team across multiple external source identifiers (3-letter codes like MNL, numeric IDs, URL slugs like sea-eagles, full names). This is critical because different scraping sources use different identifiers for the same team.

4. Port interfaces (TypeScript interfaces) for data sources — DrawDataSource, MatchResultSource, PlayerStatsSource — each defining a fetch method that returns normalised domain types. These are the abstractions that future scraping adapters will implement.

5. Repository interfaces for MatchRepository and PlayerRepository, defining collection-like access patterns (save, find by year/team/round) without prescribing storage mechanism.

The existing Fixture type and all current API responses must continue to work unchanged. The new types are additive. Current code references to Fixture can remain — the Match aggregate wraps Fixture rather than replacing it.

Refer to docs/architecture-expansion-research.md sections 2.1 through 2.4 for aggregate structure, value object candidates, and bounded context boundaries.
```

---

### Phase 2: Application Service Layer

**What:** Extract business logic from HTTP handlers into application services (use cases). Introduce the service layer between handlers and data access.

**Actions:**
- Create use case classes: `GetTeamScheduleUseCase`, `GetRoundDetailsUseCase`, `GetSeasonSummaryUseCase`, `AnalyseStreaksUseCase`, `ScrapeDrawUseCase`
- Move business logic out of `src/api/handlers.ts` into use cases
- Handlers become thin: validate input → call use case → return response
- Use cases depend on repository interfaces, not concrete store functions

**Why this phase second:** With the domain model in place, the application service layer creates the orchestration point where multi-source data will be merged. Extracting logic from handlers now — while there's only one source — is far simpler than doing it after adding nrl.com scraping. It also makes every handler independently testable.

**Speckit prompt:**
Completed
```
Extract business logic from HTTP handlers into an application service layer (use cases). Handlers currently contain inline data queries, ranking calculations, fixture grouping, streak analysis, and response shaping. This phase separates orchestration from HTTP concerns.

The system has 13 API handlers in a single handlers.ts file. Each handler directly calls database query functions, ranking calculators, and streak analysers, then shapes the response inline. There is no intermediate service layer.

Create application service classes (use cases) that encapsulate the business logic:

1. GetTeamScheduleUseCase — given a team code and optional year, returns the team's schedule with round rankings, strength totals, and category thresholds. Currently this logic spans 65 lines in the handler.

2. GetRoundDetailsUseCase — given a year and round, groups fixtures into matches (pairing home/away) and identifies bye teams. Currently done inline with Map manipulation in the handler.

3. GetSeasonSummaryUseCase — builds the compact round/match structure for an entire season. Currently 70 lines of inline fixture processing in the handler.

4. AnalyseStreaksUseCase — computes streak analysis (soft draws, rough patches) for a team in a season.

5. ScrapeDrawUseCase — orchestrates the fetch-parse-store pipeline for schedule data. Currently the handler directly calls scrapeAndLoadSchedule and manages cache interaction.

Each use case must depend on repository interfaces (from Phase 1), not on concrete database store functions. Handlers should become thin wrappers: validate input with Zod, call the use case, return the response. The use case layer must be testable without HTTP context.

All existing API responses must remain identical — this is a pure refactor with no external behaviour change.

Refer to docs/architecture-expansion-research.md section 2.8 for use case design and section 1.5 for the specific handler coupling issues being resolved.
```

---

### Phase 3: Adapter Pattern for Existing Scraper

**What:** Wrap the existing supercoachstats scraper behind the `DrawDataSource` port interface. Implement `InMemoryMatchRepository` behind the `MatchRepository` interface.

**Actions:**
- Create `SuperCoachStatsAdapter` implementing `DrawDataSource`
- Move `src/scraper/fetcher.ts` and `src/scraper/parser.ts` logic into the adapter
- Create `InMemoryMatchRepository` implementing `MatchRepository` (replaces direct store access)
- Update `ScrapeDrawUseCase` to use adapter and repository via dependency injection
- Wire up dependency injection in `src/worker.ts`

**Why this phase third:** This phase wraps existing working code behind interfaces without changing its behaviour. Once the existing scraper is behind a port, adding a second source adapter is just implementing the same (or a parallel) interface. This is the structural seam that enables expansion.

**Speckit prompt:**
Completed

```
Wrap the existing schedule scraper behind the DrawDataSource port interface and implement InMemoryMatchRepository behind the MatchRepository interface. This phase introduces the adapter pattern to the existing scraper without changing its behaviour, creating the structural seam needed to add new data sources.

The system currently has a tightly coupled scraper pipeline: fetcher.ts (hardcoded URL to nrlsupercoachstats.com) → parser.ts (HTML parsing specific to that site's table structure) → direct store.ts function calls. There is no abstraction between "where data comes from" and "how data is stored."

1. Create a SuperCoachStatsAdapter class that implements the DrawDataSource interface (defined in Phase 1). It encapsulates fetcher.ts and parser.ts internally. The adapter's fetch method returns normalised domain types (Match aggregates), not raw Fixtures. The adapter owns the anti-corruption layer that translates supercoachstats-specific HTML patterns and team image URL mappings into domain value objects.

2. Create InMemoryMatchRepository implementing the MatchRepository interface. It replaces the current global singleton database store for match/fixture data. It provides the same indexed query capabilities (by year, team, round, year-team) but through the repository interface.

3. Update ScrapeDrawUseCase (from Phase 2) to accept DrawDataSource and MatchRepository via constructor injection instead of importing concrete modules.

4. Wire dependency injection in the worker entry point — construct the adapter and repository, inject into use cases, pass use cases to route handlers.

The existing fetcher.ts and parser.ts code should move inside the adapter — not be duplicated. All existing API responses must remain identical.

Refer to docs/architecture-expansion-research.md section 2.2 for the port/adapter pattern, section 2.6 for anti-corruption layer design, and section 1.1 for the specific coupling issues being resolved.
```

---

### Phase 4: nrl.com Match Results Scraper

**What:** Add a second data source — scrape nrl.com for match results (scores, completion status, scheduled times). Implement `NrlComMatchResultAdapter` behind the `MatchResultSource` port.

**Actions:**
- Implement `NrlComMatchResultAdapter` (fetch match results from nrl.com)
- Implement team identity mapping between nrl.com identifiers and domain team codes
- Create `ScrapeMatchResultsUseCase` that fetches results and enriches existing Match aggregates
- Add API endpoints for match result data
- Update `CompactMatch` responses to include actual scores/status when available
- Implement source-appropriate cache strategy (shorter TTL for in-season match results)

**Why this phase fourth:** With the adapter pattern in place from Phase 3, this is now "just another adapter." The domain model, use cases, repositories, and API structure are all ready to receive a second source. This phase proves the architecture works for multi-source aggregation.

**Speckit prompt:**
Completed
```
Add nrl.com as a second data source for match results (scores, completion status, scheduled kick-off times). This phase implements a new source adapter behind the existing MatchResultSource port interface and enriches Match aggregates with result data.

The system currently scrapes schedule/draw data from one source (supercoachstats) via the DrawDataSource adapter (Phase 3). Match result fields in API responses (homeScore, awayScore, scheduledTime, isComplete) are always null/false because no results source exists.

1. Implement NrlComMatchResultAdapter that scrapes match results from nrl.com. The adapter must handle nrl.com's specific HTML or API structure, extract match scores, completion status (upcoming, in-progress, completed), and scheduled kick-off times. The adapter implements the MatchResultSource port interface.

2. Build the team identity mapping within the adapter's anti-corruption layer. nrl.com uses different team identifiers than the system's 3-letter codes. The adapter must translate between them using the TeamIdentity value object (from Phase 1).

3. Create ScrapeMatchResultsUseCase that fetches results from the adapter and enriches existing Match aggregates stored in the MatchRepository. If a match already has schedule data from supercoachstats, the result data is attached to it. If no schedule data exists yet, a partial match record is created.

4. Update existing season summary and round detail API responses to include actual scores and completion status when match result data is available. No new endpoints required if existing response shapes already accommodate the data (CompactMatch already has score and status fields).

5. Implement a cache strategy appropriate for match results — results change during game day and should have a shorter TTL than weekly schedule data. Consider different staleness windows for in-season vs off-season.

Refer to docs/architecture-expansion-research.md section 2.2 for adapter design, section 2.6 for anti-corruption layer and team identity mapping, and section 1.2 for the existing empty result fields that this phase populates.
```

---

### Phase 5: Persistence Layer for Player Statistics

**What:** Add a database persistence layer for historic player data. Implement `PlayerRepository` with a real database backend. Build the player statistics scraper.

**Actions:**
- Choose and configure database (Cloudflare D1 for edge, or SQLite for local dev)
- Define database schema for players and match performances
- Implement `D1PlayerRepository` (or `SQLitePlayerRepository`) behind `PlayerRepository` interface
- Implement `NrlComPlayerStatsAdapter` behind `PlayerStatsSource` port
- Create `ScrapePlayerStatsUseCase`
- Add API endpoints for player statistics
- Build database migration system

**Why this phase fifth:** This is the first phase requiring persistent storage, which is a significant infrastructure change. By this point, the repository pattern is already proven with in-memory implementations (Phases 3-4). Swapping to a real database is just providing a new repository implementation — the use cases and domain model don't change.

**Speckit prompt:**
Completed
```
Add a persistence layer for historic player statistics and implement the player data scraper from nrl.com. Player statistics are immutable historical records that must survive application restarts, unlike the ephemeral schedule and result data.

The system currently has no persistent storage — all data lives in-memory within Cloudflare Worker isolates. The PlayerRepository interface exists (Phase 1) but has no implementation.

1. Implement a persistent PlayerRepository using a database backend suitable for the deployment target. The repository stores Player aggregates (identity, team, position) and their MatchPerformance records (per-match statistics: tries, goals, tackles, run metres, fantasy points, season, round). The database schema should support efficient queries by team, season, and player.

2. Implement NrlComPlayerStatsAdapter behind the PlayerStatsSource port interface. The adapter scrapes individual player match statistics from nrl.com, normalises them through its anti-corruption layer, and returns domain Player and MatchPerformance entities.

3. Create ScrapePlayerStatsUseCase that orchestrates fetching player data from the adapter and persisting it via the PlayerRepository. It must handle idempotent writes — re-scraping the same round should update existing records, not duplicate them. Player identity must be stable across scrapes (same player, same record).

4. Add API endpoints for player statistics — query by team, season, and individual player. Include per-match breakdowns and season aggregates.

5. Implement a database migration system for schema versioning. The first migration creates the player and match_performance tables.

Historic data is immutable once a match is completed — the system should not re-scrape completed match statistics unless explicitly forced. Current-round data may be partial and should be re-scrapeable.

Refer to docs/architecture-expansion-research.md section 2.7 for repository pattern design, section 1.7 for the persistence gap being addressed, and section 1.3 for why the current in-memory singleton is insufficient.
```

---

### Phase 6: Analytics and Trend Analysis

**What:** Build the analytics bounded context that consumes data from Schedule, Match Results, and Player Statistics to provide trend insights and future predictions.

**Actions:**
- Create analytics domain services that consume from multiple repositories
- Build trend analysis: team form trajectories, player performance curves
- Build prediction models: strength-of-schedule vs actual results correlation
- Integrate player statistics with draw difficulty for composite team outlook
- Add analytics API endpoints
- Update frontend with trend visualisation components

**Why this phase last:** Analytics is a pure consumer of other contexts' data. It adds no new scraping sources or storage mechanisms — it computes derived insights. Waiting until all data sources are in place means analytics can leverage the full dataset from day one.

**Speckit prompt:**
Completed
```
Build an analytics engine that aggregates data from schedule strength ratings, match results, and player statistics to provide trend insights and future performance predictions.

The system now has three data sources: schedule/draw data with strength ratings (supercoachstats), match results with scores (nrl.com), and player statistics (nrl.com). Each is stored via its own repository. The analytics engine consumes from all three to produce derived insights.

1. Team form analysis — track a team's actual results (wins/losses/margins) against their draw difficulty (strength ratings). Identify teams that are outperforming or underperforming their expected results based on schedule difficulty. Show form trajectory over the last N rounds.

2. Player performance trends — identify players whose per-match statistics (tries, tackles, metres, fantasy points) are trending up or down over recent rounds. Flag significant changes in player output.

3. Predictive match outlook — for upcoming (not yet played) matches, combine the home team's recent form, the away team's recent form, historical head-to-head results, and the strength rating from the draw to produce a composite difficulty/outlook assessment.

4. Team composition insights — correlate team results with player availability and performance. Identify which players most impact team outcomes.

5. API endpoints for all analytics: team form trend, player performance trend, upcoming match outlook, team composition impact.

6. Frontend components to visualise trends — form trajectory charts, player performance sparklines, match outlook indicators integrated into the existing season and round views.

The analytics engine must be a pure consumer — it reads from repositories but never writes to Schedule, Match Results, or Player Statistics contexts. It may cache computed results with appropriate invalidation when source data changes.

Refer to docs/architecture-expansion-research.md section 2.1 for bounded context boundaries (Analytics as a consumer context), section 2.5 for domain events that trigger analytics recomputation, and Part 3 for how this phase builds on all prior phases.
```

---

## Part 4: Phase Dependency Map

```
Phase 1: Domain Model Foundation
    │
    ├──→ Phase 2: Application Service Layer
    │        │
    │        └──→ Phase 3: Adapter Pattern (existing scraper)
    │                 │
    │                 ├──→ Phase 4: nrl.com Match Results
    │                 │
    │                 └──→ Phase 5: Player Statistics + Persistence
    │                          │
    └────────────────────────────→ Phase 6: Analytics & Trends
```

**Phases 4 and 5 can run in parallel** after Phase 3 is complete — they are independent data sources behind independent ports, writing to independent repositories.

**Phase 6 requires both 4 and 5** — analytics consumes match results and player statistics.

---

## Part 5: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| nrl.com blocks scraping or changes HTML frequently | High | High | Implement resilient parsing with graceful degradation; consider if nrl.com offers an API |
| Cloudflare D1 limitations for player data volume | Medium | Medium | Design repository interface to be backend-swappable; evaluate data volume early |
| Domain model overengineered for current needs | Medium | Low | Each phase delivers working functionality; validate model against real data before proceeding |
| Team identity mapping incomplete across sources | Medium | Medium | Build mapping incrementally; log unmapped teams as warnings rather than failing |
| Worker cold start latency with database connection | Low | Medium | Use connection pooling; consider read replicas; cache hot data in-memory |

---

## Appendix: Current File Reference

Files referenced in this document and their roles:

| File | Role | Key Issue |
|---|---|---|
| `src/scraper/fetcher.ts` | HTTP fetch from supercoachstats | Hardcoded URL, no source abstraction |
| `src/scraper/parser.ts` | HTML parsing | 150 lines specific to one site's table structure |
| `src/scraper/index.ts` | Pipeline orchestration | No extension points |
| `src/scraper/teams.ts` | Team image URL mapping | Brittle source-specific mapping |
| `src/database/store.ts` | In-memory singleton store | Single entity type, global mutable state |
| `src/database/query.ts` | Fluent query builder | Only queries Fixture type |
| `src/api/handlers.ts` | HTTP handlers with inline logic | Business logic not reusable outside HTTP |
| `src/models/fixture.ts` | Single domain entity | No match results, no player data |
| `src/models/types.ts` | Type definitions | CompactMatch has empty score fields |
| `src/models/team.ts` | Hardcoded team constants | No cross-source identity mapping |
| `src/cache/store.ts` | Weekly expiry cache | Single TTL policy for all data types |
| `src/worker.ts` | Cloudflare Worker entry point | No dependency injection |
