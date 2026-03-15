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

**Rate Limiting**: 2-second delay between page requests to avoid overloading the source.

**Adapter**: `NrlSupercoachStatsAdapter` in `src/infrastructure/adapters/nrl-supercoach-stats-adapter.ts`

**Data NOT Extracted from This Source**:
- Fixture schedule or match results
- Stadium/venue information
- Match dates or times
- Weather conditions
- Primary player statistics (available from NRL.com Match Centre)

## Data NOT Scraped (Any Source)

- Historical player data (pre-match career stats)
- Injury reports or team news
- Transfer/contract information
- Betting odds
- Fan data, comments, or social media
- Referee assignments
- Video referee decisions
- Substitution timing details

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
