# Scraping Behaviour

The system scrapes three external data sources. Both the NRL.com Draw API and SuperCoach Stats provide the fixture schedule independently — they are merged together so that schedule details (times, stadiums) come from NRL.com while strength ratings come from SuperCoach Stats.

## Data Source 1: NRL.com Draw API (Schedule & Match Results)

**URL**: `https://www.nrl.com/draw/data?competition=111&season={year}&round={round}`

**Format**: JSON (validated with Zod)

**Data Extracted**:
- Fixture schedule (which teams play each other, in which round)
- Team identification (nrl.com `teamId` mapped to 3-letter codes via internal mapping table)
- Scheduled kick-off time (ISO-8601)
- Stadium/venue name
- Round number (parsed from `roundTitle`, including finals: Week 1→28, Week 2→29, Week 3→30, Grand Final→31)
- Match scores (home and away, for completed matches)
- Match status (`FullTime`, `InProgress`, `NotStarted`)
- Weather conditions (fetched separately from match centre data page for completed matches)

**Weather Sub-Fetch**: For completed matches with a `matchCentreUrl`, the adapter fetches `https://www.nrl.com{matchCentreUrl}data` to extract weather data. Uses `Promise.allSettled()` for parallel requests; failures return null gracefully.

**Match States Handled**:
- `FullTime` → `Completed` (scores extracted)
- `InProgress` → `Scheduled` (scores set to 0)
- `NotStarted` → `Scheduled` (scores set to 0)

**Data NOT Extracted from This Source**:
- Strength of schedule ratings (comes from SuperCoach Stats)
- Player statistics (comes from Match Centre, see Data Source 3)

## Data Source 2: SuperCoach Stats (Strength Ratings)

**URL**: `https://www.nrlsupercoachstats.com/drawV2.php?year={year}`

**Format**: HTML table parsed with LinkedOM

**Data Extracted**:
- Fixture schedule (team matchups per round — redundant with NRL.com, used for pairing)
- Home/away designation (presence of `(A)` suffix indicates away)
- **Strength of schedule ratings** (numeric values rating each matchup's difficulty)
- Bye rounds (cells containing "BYE" or starting with "-")

The primary value of this source is the **strength ratings**, which are not available from NRL.com. The fixture schedule data is also extracted but serves mainly to pair strength ratings with the correct matches.

**Parsing Logic**:
- Identifies the schedule table by looking for header cells matching `Rd1`, `Rd2`, etc. (20+ round columns)
- Extracts team codes from `<img>` tag `src` attributes in the first cell of each row
- Fixture cell patterns:
  - `CODE(A) number` or `CODE number` — opponent with strength rating
  - `number CODE(A)` or `number CODE` — alternate format
  - `CODE(A)` or `CODE` alone — opponent with missing strength (generates warning)
- Pairs each fixture with its mirror entry (team A vs B paired with team B vs A)
- Unpaired fixtures generate an `UNPAIRED_FIXTURE` warning and are skipped

**Data NOT Extracted from This Source**:
- Stadium/venue information
- Match dates or times
- Weather conditions
- Match results or scores
- Player information

## Data Source 3: NRL.com Match Centre (Player Statistics)

**URL**: Same draw API to discover match centre URLs, then `https://www.nrl.com{matchCentreUrl}data` per match

**Format**: JSON (validated with Zod)

**Two-Step Process**:
1. Fetch draw API to get `matchCentreUrl` for each match in the round
2. Fetch each match centre URL to get roster and player statistics

**Data Extracted** (60+ fields per player per match):

| Category | Fields |
|----------|--------|
| **Run/Metres** | allRunMetres, allRuns, hitUpRunMetres, kickReturnMetres, postContactMetres, kickMetres |
| **Kicking** | kicks, bombKicks, crossFieldKicks, fieldGoals, fortyTwentyKicks, grubberKicks, kicksDead, kicksDefused, onePointFieldGoals, penaltyGoals, twentyFortyKicks, conversionAttempts, conversions, goals |
| **Ball Handling** | passes, passesToRunRatio, offloads, dummyPasses, receipts, lineBreakAssists |
| **Attacking** | lineBreaks, tries, tryAssists, dummyHalfRuns, dummyHalfRunMetres, hitUps, lineEngagedRuns |
| **Defensive** | tacklesMade, missedTackles, tackleBreaks, ineffectiveTackles, tackleEfficiency, intercepts, oneOnOneLost, oneOnOneSteal |
| **Discipline** | errors, handlingErrors, penalties, sinBins, sendOffs, onReport, ruckInfringements, offsideWithinTenMetres, forcedDropOutKicks |
| **Play Metrics** | minutesPlayed, playTheBallTotal, playTheBallAverageSpeed, fantasyPointsTotal, points |

**Player Identity**: Joined from roster data (firstName, lastName, position) matched by `playerId`. Players in stats but not in roster generate a `PLAYER_NOT_IN_ROSTER` warning and are skipped.

## Data Source 4: NRL SuperCoach Stats (Supplementary Player Statistics)

**URL**: `https://www.nrlsupercoachstats.com/stats.php?year={year}&grid_id=list1`

**Format**: jqGrid JSON (paginated)

**Request Parameters**:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `_search` | `false` | Disables server-side search |
| `nd` | Unix timestamp (ms) | Cache-buster |
| `rows` | `500` | Rows per page |
| `page` | `N` | Page number (1-based) |
| `sidx` | (empty) | Sort index (unused) |
| `sord` | `asc` | Sort order |
| `Rnd` | round number | Round filter |

**Required Headers**:
- `X-Requested-With: XMLHttpRequest`
- `User-Agent: Mozilla/5.0`

**Response Structure**: jqGrid format with `colModel` array providing dynamic column definitions and `rows[].cell` array containing stat values positionally mapped to those columns.

**Column Abbreviations** (supplementary stats not available from NRL.com Match Centre):

| Abbreviation | Mapped Field | Description |
|--------------|-------------|-------------|
| `LT` | `line_engaged_runs` | Line-engaged runs |
| `MG` | `missed_goals` | Missed goals |
| `MF` | `forced_drop_outs` | Forced drop-outs |
| `OL` | `effective_offloads` | Effective offloads |
| `IO` | `ineffective_offloads` | Ineffective offloads |
| `H8` | `runs_over_8m` | Runs over 8 metres |
| `HU` | `runs_under_8m` | Runs under 8 metres |
| `TS` | `try_saves` | Try saves |
| `Price` | `price` | Player Supercoach price in whole dollars (raw integer, not a point contribution) |
| `BE` | `break_even` | Break even score — points needed to maintain current price (signed integer) |

**Additional Fields Extracted**:
- `Team` — 3-letter team code (e.g., PTH, BRO, GCT). Persisted to `supplementary_stats.team_code` for team-based player name matching.

**Rate Limiting**: 2-second delay between page requests to avoid overloading the source.

**Adapter**: `NrlSupercoachStatsAdapter` in `src/infrastructure/adapters/nrl-supercoach-stats-adapter.ts`

**Data NOT Extracted from This Source**:
- Fixture schedule or match results
- Stadium/venue information
- Match dates or times
- Weather conditions
- Primary player statistics (available from NRL.com Match Centre)

## Player Name Linking

Players can have different names across nrl.com and nrlsupercoachstats.com (e.g., "AJ Brimson" vs "Alexander Brimson"). The system uses a five-tier matching strategy to link players between sources:

1. **Persisted link** — D1 `player_name_links` table stores confirmed mappings (highest priority)
2. **Exact normalized** — Normalizes both names (lowercase, strip diacritics/apostrophes/hyphens) and compares
3. **Fuzzy prefix** — Exact last name + first name prefix matching (handles "N" → "Nathan")
4. **Team-based last name** — Exact last name + matching team code + only one candidate on that team
5. **Unmatched** — No match found

When tiers 2–4 produce a match, the link is **auto-persisted** to the `player_name_links` table. Subsequent lookups use tier 1 (the persisted link), which is stable even if new players with similar names are added later.

**Manual corrections**: Insert/update rows in `player_name_links` via `wrangler d1 execute` with `source = 'manual'`. Manual links take the same priority as auto links (tier 1).

**Matcher**: `src/config/player-name-matcher.ts`
**Link repository**: `src/infrastructure/persistence/d1-player-name-link-repo.ts`

## Data Source 5: NRL.com Match Centre (Team Lists / Lineups)

**URL**: Same draw API to discover match centre URLs, then `https://www.nrl.com{matchCentreUrl}data` per match

**Format**: JSON (validated with Zod)

**Two-Step Process** (same pattern as Data Source 3):
1. Fetch draw API to get `matchCentreUrl` for each match in the round
2. Fetch each match centre URL to extract player roster with jersey numbers

**Data Extracted**:
- Jersey number (1–17)
- Player name (first + last)
- Position
- Player ID

**Team list composition**: 17 players per team — starters (jersey 1–13) and interchange (jersey 14–17). Players outside the 1–17 range are filtered out.

**Save Behaviour**:
- Upcoming/in-progress matches: Team lists are replaced (delete + re-insert) on each scrape
- Completed matches: Team lists are only saved if no existing data — existing team lists for completed matches are never overwritten

**Scrape Modes**:
1. **Initial scrape**: Fetch team lists for all matches in the current round (triggered Tuesday 4pm AEST when team lists are released)
2. **Window-based update**: Re-fetch for matches within 24h or 90min of kickoff (catches late changes)
3. **Backfill**: Populate team lists for completed matches that are missing data

**Edge Cases**:
- Matches where nrl.com returns empty player arrays (team list not yet published) are gracefully skipped with an `EMPTY_TEAM_LIST` warning
- Source fetch failures produce `TEAM_LIST_FETCH_FAILED`, `WINDOW_SCRAPE_FAILED`, or `BACKFILL_FETCH_FAILED` warnings

**Adapter**: `NrlComTeamListAdapter` in `src/infrastructure/adapters/nrl-com-team-list-adapter.ts`

**Persistence**: `D1TeamListRepository` in `src/infrastructure/persistence/d1-team-list-repository.ts` — flattened table with one row per squad member, PK: `(match_id, team_code, jersey_number)`

## Data NOT Scraped (Any Source)

- Historical player data (pre-match career stats)
- Injury reports or team news
- Transfer/contract information
- Betting odds
- Fan data, comments, or social media
- Referee assignments
- Video referee decisions
- Substitution timing details

## Data Source 6: NRL.com Casualty Ward API (Injuries)

**URL**: `https://www.nrl.com/casualty-ward/data?competition=111`

**Format**: JSON (validated with Zod)

**Data Extracted**:
- Player first/last name
- Team nickname (resolved to 3-letter team code via `resolveTeam()`)
- Injury type (e.g., "Knee", "Shoulder", "Concussion")
- Expected return (e.g., "Round 10", "TBC", "Indefinite", "Next Season")

**Change Detection Algorithm**:
The API provides a point-in-time snapshot (no historical data). The scraper uses diff-based change detection:
1. Fetch current casualty list from API
2. Load all open records (end_date IS NULL) from D1
3. Build lookup maps keyed by `firstName|lastName|teamCode`
4. **New entries**: Players in API but not in open DB records → INSERT with today as start_date
5. **Closed entries**: Open DB records not in API → UPDATE with today as end_date
6. **Updated entries**: Matching records where injury or expectedReturn changed → UPDATE fields
7. **Source failure safety**: If API fetch fails, no records are closed (prevents false closures)

**Player ID Linkage**: After insert, attempts to match casualty ward entries to existing player records via name + team code lookup from the player repository.

**Data NOT Extracted from This Source**:
- Historical injury dates (API is snapshot-only — tracked via start/end dates in D1)
- Severity classification (only free-text injury description available)

## Scraping Schedule

Configured via cron triggers in `wrangler.jsonc`:

| Cron Expression | Timing | Purpose |
|-----------------|--------|---------|
| `0 6 * * MON` | Monday 6am UTC (4pm AEST) | Weekly cache invalidation — clears all cached fixture data to force refresh |
| `*/30 7-12 * 3-10 THU,FRI,SAT,SUN` | Every 30 min, 7am–12pm UTC, Thu–Sun, Mar–Oct | Post-game scraping — finds completed rounds and scrapes match results and player stats |

**Scheduled Handler Logic**:
1. Invalidates fixture cache on Monday
2. Identifies rounds needing result scraping (match scheduled time + 2-hour buffer has passed, status still Scheduled)
3. Identifies rounds needing player stats (all matches Completed, no player stats yet in repository)
4. Scrapes results first, then player stats for completed rounds
5. Team list scraping: initial round scrape, 24h window updates, 90min window updates, then backfill of completed matches missing team lists
6. Casualty ward scraping: fetches current snapshot, applies change detection to insert/close/update records
