# Supercoach Score Reconstruction — Data Source Research

## Objective

Identify which NRL Supercoach scoring stats can be obtained from the existing nrl.com match centre API, which are missing, and what alternative public sources can fill the gaps.

---

## 1. Supercoach Scoring Legend

| Stat | Points | Category |
|---|---|---|
| Try | +17 | Scoring |
| Try Assist | +12 | Create |
| Try Contribution | +4 | Create |
| Goal (conversion/penalty) | +4 | Scoring |
| Missed Goal | -2 | Scoring |
| Field Goal (1pt) | +5 | Scoring |
| 2 Point Field Goal | +10 | Scoring |
| Missed Field Goal / 2pt FG | -1 | Scoring |
| Tackle | +1 | Base |
| Missed Tackle | -1 | Base |
| Tackle Break | +2 | Evade |
| Forced Drop Out | +6 | Create |
| Offload to Hand | +4 | Evade |
| Offload to Ground | +2 | Evade |
| Line Break | +10 | Evade |
| Line Break Assist | +8 | Create |
| 40/20 & 20/40 | +10 | Create |
| All runs 8m+ | +2 | Base |
| All runs <8m | +1 | Base |
| Try Saves | +3 | Defence |
| Intercept | +5 | Evade |
| Kick Dead | -3 | Create |
| Penalty Conceded | -2 | Negative |
| Error | -2 | Negative |
| Sin Bin | -8 | Negative |
| Send Off | -16 | Negative |

> **Note:** The nrlsupercoachstats.com community uses different terminology — "Last Touch" instead of "Try Contribution", "Effective Offload" / "Ineffective Offload" instead of "Hand" / "Ground", and adds "Kick and Regather Break" (+8pts). Despite the community claiming Last Touch is +6pts, real data confirms it is +4pts (same as Try Contribution). The LT column on nrlsupercoachstats.com contains point contributions at 4pts/unit.

---

## 2. NRL.com Match Centre API — Available Fields

### API Endpoints (already implemented)

The existing adapter (`src/infrastructure/adapters/nrl-com-player-stats-adapter.ts`) fetches from:

- **Draw API:** `https://www.nrl.com/draw/data?competition=111&season={year}&round={round}`
- **Match Centre:** `https://www.nrl.com{matchCentreUrl}data`

### Field Mapping — What CAN Be Obtained

| Supercoach Stat | NRL API Field | Status |
|---|---|---|
| Try (+17) | `tries` | **Available** |
| Try Assist (+12) | `tryAssists` | **Available** |
| Goal (+4) | `conversions` + `penaltyGoals` | **Available** — sum both fields |
| Field Goal (+5) | `onePointFieldGoals` | **Available** |
| 2pt Field Goal (+10) | `twoPointFieldGoals` | **Available** |
| Tackle (+1) | `tacklesMade` | **Available** |
| Missed Tackle (-1) | `missedTackles` | **Available** |
| Tackle Break (+2) | `tackleBreaks` | **Available** |
| Forced Drop Out (+6) | `forcedDropOutKicks` | **Available** |
| Line Break (+10) | `lineBreaks` | **Available** |
| Line Break Assist (+8) | `lineBreakAssists` | **Available** |
| 40/20 (+10) | `fortyTwentyKicks` | **Available** |
| 20/40 (+10) | `twentyFortyKicks` | **Available** |
| Intercept (+5) | `intercepts` | **Available** |
| Kick Dead (-3) | `kicksDead` | **Available** |
| Penalty Conceded (-2) | `penalties` | **Available** |
| Error (-2) | `errors` | **Available** |
| Sin Bin (-8) | `sinBins` | **Available** |
| Send Off (-16) | `sendOffs` | **Available** |

**17 of 25 stats are directly available** from the nrl.com match centre API.

### Field Mapping — Partially Available

| Supercoach Stat | NRL API Fields | Issue |
|---|---|---|
| Missed Goal (-2) | `conversionAttempts`, `conversions` | Missed conversions = `conversionAttempts - conversions`. However, **penalty goal attempts are not tracked** — only successful `penaltyGoals`. Missed penalty goals cannot be derived. |
| Offloads (+4/+2) | `offloads` | **Combined total only** — not split into "to hand" (effective, +4) vs "to ground" (ineffective, +2). Using the combined value at +4 per offload would overcount. |

### Field Mapping — NOT Available

| Supercoach Stat | Issue |
|---|---|
| **Try Contribution (+4)** | Not tracked in the match centre JSON. This stat is adjudicated separately — it represents a player's involvement in build-up play leading to a try (excluding the try scorer and try assister). In 2026, NRL Stats (Stats Perform) significantly changed how try contributions are awarded, resulting in ~47% fewer try contributions than the previous Fox Sports methodology. |
| **Missed Field Goal (-1)** | Only successful field goals are tracked (`onePointFieldGoals`, `twoPointFieldGoals`). Field goal **attempts** are not available. |
| **Runs 8m+ (+2) vs <8m (+1)** | Only aggregate `allRuns` (count) and `allRunMetres` (total metres) are available. Individual run distances are not broken down. The `lineEngagedRuns` field is available and Supercoach uses the formula `allRuns - lineEngagedRuns` for total eligible runs, but the 8m threshold split requires per-run distance data. |
| **Try Saves (+3)** | Not tracked in the match centre JSON. A try save is when a defender prevents a try through a last-ditch tackle near the try line. |

---

## 3. Alternative Public Sources for Missing Stats

### Source 1: NRL Supercoach Stats (nrlsupercoachstats.com) — RECOMMENDED

**Coverage:** All missing stats including try saves (TS), last touch/try contribution (LT), effective offloads (OL), ineffective offloads (IO), runs 8m+ (H8), runs <8m (HU), missed goals (MG), missed field goals (MF).

**How to access:**
- No public API. Data must be **web scraped** from player profile pages.
- Player profile URL pattern: `https://www.nrlsupercoachstats.com/index.php?player={LastName},+{FirstName}`
- Stats table URL: `https://www.nrlsupercoachstats.com/stats.php?year={year}`
- Per-match breakdown is shown on each player profile page with abbreviation columns.
- Rendering appears to be server-side PHP — standard HTTP requests with HTML parsing should work (no JavaScript rendering required).

**Stat abbreviations on this site:**
| Abbreviation | Stat | SC Points |
|---|---|---|
| TR | Tries | +17 |
| TS | Try Assists (or Try Saves — context-dependent) | +12 / +3 |
| LT | Last Touch Assists | +4 |
| GO | Goals | +4 |
| MG | Missed Goals | -2 |
| FG | Field Goals | +5 |
| MF | Missed Field Goals | -1 |
| TA | Tackles | +1 |
| MT | Missed Tackles | -1 |
| TB | Tackle Breaks | +2 |
| FD | Forced Drop Outs | +6 |
| OL | Effective Offloads (to hand) | +4 |
| IO | Ineffective Offloads (to ground) | +2 |
| LB | Line Breaks | +10 |
| LA | Line Break Assists | +8 |
| FT | 40/20 | +10 |
| KB | Kick & Regather Break | +8 |
| H8 | Hit-ups Over 8m | +2 |
| HU | Hit-ups Under 8m | +1 |
| PC | Penalties Conceded | -2 |
| ER | Errors | -2 |
| SS | Sin Bin / Send Off | -8 / -16 |

**Pros:** Comprehensive, free, covers all missing stats, community-maintained, updated per round.
**Cons:** No API — requires HTML scraping. May break if site layout changes. Terms of service should be checked.

---

### Source 2: Footy Statistics (footystatistics.com)

**Coverage:** Per-match player stats including offload to hand, offload to ground, try saves, and detailed Supercoach-relevant breakdowns.

**How to access:**
- Web scraping from player pages. The site provides per-match stats searchable by player, with filtering by season, opponent, position.
- Appears to track offload sub-types and try saves explicitly.
- URL structure follows standard player/season patterns.

**Pros:** Tracks offload sub-types and try saves, filterable by round/opponent.
**Cons:** No public API. May require JavaScript rendering (check if data loads dynamically). Less established than nrlsupercoachstats.com.

---

### Source 3: Official Supercoach API (supercoach.dailytelegraph.com.au)

**Coverage:** Authoritative source — the actual Supercoach scoring breakdown per player per match, including all stat categories and the computed total.

**How to access:**
- Uses **OAuth2 authentication** (resource owner password credentials grant).
- Requires a registered Supercoach account (free to create at dailytelegraph.com.au).
- Token endpoint pattern (based on AFL equivalent): `https://supercoach.dailytelegraph.com.au/{year}/api/nrl/classic/v1/access_token`
- Stats centre: `https://supercoach.dailytelegraph.com.au/nrl/draft/statscentre?access_token={token}`
- Player data is embedded in a JavaScript variable `researchGridData` in the HTML response — parse it as JSON.
- Fields include total points, round points, averages, and per-stat breakdowns.

**Pros:** Authoritative source of truth for Supercoach scores. Returns the official computed score. Includes all stats by definition.
**Cons:** Requires authentication credentials. OAuth2 flow adds complexity. Endpoint URLs may change between seasons. Rate limiting unknown. May violate terms of service if used for automated scraping at scale.

---

## 4. Handling the Missing Stats — Recommended Approach

### Strategy: NRL.com API as primary + nrlsupercoachstats.com as supplement

Use the existing nrl.com match centre adapter for the 17 directly-available stats, then supplement with scraped data from nrlsupercoachstats.com for the remaining stats.

### Per-stat resolution

| Missing Stat | Recommended Source | Fallback | Notes |
|---|---|---|---|
| **Try Contribution** | nrlsupercoachstats.com (LT field) | footystatistics.com | Called "Last Touch" on nrlsupercoachstats.com but confirmed +4pts (same as Try Contribution) |
| **Missed Goal** | nrlsupercoachstats.com (MG field) | Derive partial from nrl.com: `conversionAttempts - conversions` | Missing penalty goal misses from nrl.com |
| **Missed Field Goal** | nrlsupercoachstats.com (MF field) | footystatistics.com | Not derivable from nrl.com |
| **Offload to Hand** | nrlsupercoachstats.com (OL field) | footystatistics.com | nrl.com only has combined `offloads` |
| **Offload to Ground** | nrlsupercoachstats.com (IO field) | footystatistics.com | nrl.com only has combined `offloads` |
| **Runs 8m+** | nrlsupercoachstats.com (H8 field) | Not derivable from nrl.com | nrl.com lacks per-run distance data |
| **Runs <8m** | nrlsupercoachstats.com (HU field) | Not derivable from nrl.com | nrl.com lacks per-run distance data |
| **Try Saves** | nrlsupercoachstats.com | footystatistics.com | Not in nrl.com API at all |

---

## 5. Supercoach Score Formula

Using all sources combined, the Supercoach score for a player in a single match can be computed as:

```
SC_SCORE =
  // Scoring
  (tries × 17) +
  (goals × 4) +                         // conversions + penaltyGoals
  (missedGoals × -2) +
  (onePointFieldGoals × 5) +
  (twoPointFieldGoals × 10) +
  (missedFieldGoals × -1) +

  // Create
  (tryAssists × 12) +
  (tryContribution × 4) +               // "Last Touch" on nrlsupercoachstats.com, confirmed +4pts
  (lineBreakAssists × 8) +
  (forcedDropOutKicks × 6) +
  (fortyTwentyKicks × 10) +
  (twentyFortyKicks × 10) +
  (kicksDead × -3) +

  // Evade
  (offloadToHand × 4) +
  (offloadToGround × 2) +
  (tackleBreaks × 2) +
  (lineBreaks × 10) +
  (intercepts × 5) +

  // Base
  (tacklesMade × 1) +
  (missedTackles × -1) +
  (runsOver8m × 2) +
  (runsUnder8m × 1) +

  // Defence
  (trySaves × 3) +

  // Negative
  (penalties × -2) +
  (errors × -2) +
  (sinBins × -8) +
  (sendOffs × -16)
```

### Field source mapping for the formula

```
// From nrl.com match centre API (existing adapter)
tries           = stats.tries
goals           = stats.conversions + stats.penaltyGoals
onePointFG      = stats.onePointFieldGoals
twoPointFG      = stats.twoPointFieldGoals
tryAssists      = stats.tryAssists
lineBreakAssists = stats.lineBreakAssists
forcedDropOuts  = stats.forcedDropOutKicks
fortyTwenty     = stats.fortyTwentyKicks
twentyForty     = stats.twentyFortyKicks
kicksDead       = stats.kicksDead
tackleBreaks    = stats.tackleBreaks
lineBreaks      = stats.lineBreaks
intercepts      = stats.intercepts
tacklesMade     = stats.tacklesMade
missedTackles   = stats.missedTackles
penalties       = stats.penalties
errors          = stats.errors
sinBins         = stats.sinBins
sendOffs        = stats.sendOffs

// From nrlsupercoachstats.com (supplementary scrape)
tryContribution = scraped LT field
missedGoals     = scraped MG field
missedFieldGoals = scraped MF field
offloadToHand   = scraped OL field
offloadToGround = scraped IO field
runsOver8m      = scraped H8 field
runsUnder8m     = scraped HU field
trySaves        = scraped TS field (context: defence, not try assists)
```

### Validation

The nrl.com API provides `fantasyPointsTotal` — this may correspond to either NRL Fantasy points or Supercoach points. Compare your computed `SC_SCORE` against this field to validate accuracy. If they don't match, `fantasyPointsTotal` likely represents NRL Fantasy (a different scoring system) and should not be used for Supercoach validation. Instead, cross-reference against nrlsupercoachstats.com published totals.

---

## 6. Implementation Considerations

1. **Player ID matching:** The nrl.com API uses numeric `playerId`. nrlsupercoachstats.com uses player names. A name-based fuzzy matching or a maintained ID mapping table will be needed to join data from both sources.

2. **Timing:** nrlsupercoachstats.com data may not be available immediately after a match. Build scraping to handle partial data and retry.

3. **Adapter pattern:** Create a new `SupercoachStatsSource` port/adapter following the existing `PlayerStatsSource` pattern. Either extend the `PlayerMatchStats` interface with the new fields, or create a separate `SupercoachBreakdown` type.

4. **Rate limiting:** Add appropriate delays between requests to nrlsupercoachstats.com. Respect `robots.txt`.

5. **Caching:** Cache supplementary stats aggressively — once a round is complete, the data won't change.

6. **Scoring rule changes:** The Supercoach scoring table changes between seasons. The point values should be configurable, not hardcoded.
