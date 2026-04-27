# Player Context Analytics Research

**Date:** 2026-04-16
**Status:** Research complete — ready for specification

## Overview

This document investigates the feasibility of three new player analytics models that adjust Supercoach performance projections based on contextual factors: venue/stadium, weather, and opponent. Each model produces an independent multiplier that can be applied singularly or in combination with the existing floor/spike projection model.

---

## Existing Data Inventory

### What Already Exists in the Schema

**`matches` table** (`migrations/0002_create_matches_table.sql`):
- `stadium` (TEXT, nullable) — raw venue string from nrl.com draw API
- `weather` (TEXT, nullable) — raw category string, **completed matches only**
- `home_team_code` / `away_team_code`
- `home_team_code` / `away_team_code` — sufficient for opponent derivation per performance

**`match_performances` table** (`migrations/0001_create_player_tables.sql`):
- 60+ player stat columns per match
- `match_id` links to match context (venue, weather, opponent derivable)
- `team_code` — player's team; opponent inferred by joining `matches`

**Domain types** (`src/domain/match.ts`, `src/domain/supercoach-score.ts`):
- `Match.stadium: string | null`
- `Match.weather: string | null`
- `PlayerMatchSupercoach.opponent` — already computed per performance

**Scoring engine** (`src/analytics/supercoach-scoring-service.ts`, `src/analytics/player-projection-service.ts`):
- Full per-game Supercoach scores are computable for all completed rounds
- `EligibleGame` objects carry `round`, `totalScore`, `floorScore`, `spikeScore`, `minutesPlayed`
- No venue, weather, or opponent context is currently attached to these game objects

---

## Model 1: Venue Effect

### Data Availability

- **Available:** `matches.stadium` — raw string from nrl.com (e.g. `"Suncorp Stadium"`, `"Lang Park"`, `"Allegiant Stadium Las Vegas"`)
- **Gap:** No normalisation — the same ground can appear under multiple name variants across seasons
- **Gap:** No stadium geolocation (latitude/longitude) — needed for weather model integration and as a fallback grouping dimension

### Approach: Relative Performance Index (RPI)

For each player × stadium pair, compute how their Supercoach score at that venue deviates from their season baseline:

```
venueRPI(player, stadium) = mean(SC scores at stadium) / mean(all SC scores)
```

A value of `1.15` = player scores 15% above their average at that venue. This becomes a **venue multiplier** on the base projection.

**Confidence gating:** Multiplier is attenuated toward `1.0` based on sample size. Below N=3 games at a venue, the multiplier is unreliable.

**Multi-season pooling:** Most players visit each ground 1–2 times per season. Pooling across years is essential for stable estimates. Data should be pooled with a recency weight (more recent seasons weighted higher).

### Required Additions

1. **Stadium normalisation map** — static config file mapping raw nrl.com strings to canonical IDs (e.g. `lang_park`, `suncorp`, `accor_stadium`). Approximately 30 NRL venues — a one-time, low-effort addition.
2. **Stadium metadata table** — canonical name and city. All NRL stadiums are open-air grass so surface and roof fields are unnecessary.

```sql
CREATE TABLE stadiums (
  id   TEXT PRIMARY KEY,   -- e.g. 'suncorp'
  name TEXT NOT NULL,      -- canonical name
  city TEXT
);
```

---

## Model 2: Weather Effect

### Data Availability

- **Available:** `matches.weather` — free-text string from nrl.com match centre JSON, populated only for completed matches (e.g. `"Clear"`, `"Cloudy"`, `"Raining"`)
- **Gap:** Weather data is only available for completed matches — no forward-looking data in scope

### Approach: NRL Category RPI

Normalise existing `matches.weather` strings into a closed set of categories. Showers are intermittent and lighter than sustained rain, so they sit between `cloudy` and `rain`:

| Raw NRL string | Category |
|---|---|
| `"Clear"`, `"Fine"`, `"Sunny"` | `clear` |
| `"Cloudy"`, `"Overcast"` | `cloudy` |
| `"Showers"` | `showers` |
| `"Raining"`, `"Light Rain"` | `rain` |
| `"Heavy Rain"` | `heavy_rain` |
| `"Windy"`, `"Strong Wind"` | `windy` |

Compute player RPI per category in the same way as venue:

```
weatherRPI(player, category) = mean(SC scores in category) / mean(all SC scores)
```

Weather data is only available for completed matches. Sample sizes per category will be small — confidence gating (N < 3 → attenuate toward 1.0) is important here.

### Required Additions

1. **Weather normalisation map** — static string → category mapping (small, one-time)

---

## Model 3: Opponent Effect

### Data Availability

- **Available:** All data needed exists in the current schema. This is the most immediately buildable model.
- `match_performances.match_id` → `matches.home_team_code` / `away_team_code` → opponent derivable per performance
- `PlayerMatchSupercoach.opponent` already computed per performance

### Sub-Model 3a: Head-to-Head Player RPI

```
h2hRPI(player, opponent) = mean(SC scores vs. opponent) / mean(all SC scores)
```

Most useful for star players in established rivalries. Same thin-sample constraint as venue — requires multi-season pooling.

### Sub-Model 3b: Opponent Defensive Profile (primary model)

For each team, compute how many Supercoach points they concede to each **position** per match, then normalise against the league average:

```
defenseProfile(opponent, position) = mean(SC points conceded to that position)

defenseFactor(opponent, position) = defenseProfile / leagueAvg(SC points for position)
```

A `defenseFactor` of `1.20` for halfbacks means that team concedes 20% more Supercoach points to halfbacks than average — a significant and actionable signal.

This is computable entirely from existing data:
1. For each completed match, compute all opposing player SC scores (already done by scoring engine)
2. Group by `(opponent_team_code, player_position)`
3. Aggregate mean per position, normalise against league mean

This is the most data-rich of the three models and requires no new scraping.

### Required Additions

No schema changes required. An analytics service computing opponent defense profiles from existing `match_performances` + `matches` data is sufficient. Results can be cached in-memory (same pattern as existing analytics cache).

---

## Combined Model: Contextual Projection

The three models produce independent multipliers. They compose multiplicatively on the base projection:

```
adjustedProjection = baseProjection
  × venueMultiplier
  × weatherMultiplier
  × opponentMultiplier
```

Each multiplier defaults to `1.0` (neutral) when data is absent, so any subset of models can be applied without breaking the others.

### Confidence-Weighted Blending

When sample size is low, the multiplier is blended toward `1.0` proportional to confidence:

```
effectiveMultiplier = lerp(1.0, rawMultiplier, confidence)

where confidence = clamp(N / minSampleSize, 0, 1)
```

This prevents a single anomalous game at a rarely-visited venue from distorting the projection.

### API Shape (proposed)

```
GET /api/supercoach/:year/player/:playerId/contextual-projection

Query params:
  ?venue=suncorp           (optional — canonical stadium ID)
  ?weather=rain            (optional — normalised category)
  ?opponent=BRI            (optional — team code)

Response:
{
  playerId, playerName, teamCode, position,
  baseProjection: { total, floor, ceiling },
  adjustedProjection: { total, floor, ceiling },
  adjustments: {
    venue:    { multiplier, confidence, gamesAtVenue, stadiumId },
    weather:  { multiplier, confidence, gamesInCondition, category },
    opponent: { multiplier, confidence, defenseFactor, position }
  }
}
```

---

## Cache Invalidation

Analytics data is computed on demand and held in the in-memory cache — it is not written to D1. The cache uses the existing `analytics-cache.ts` pattern.

**Invalidation trigger: round completion, not a calendar schedule.**

The weekly cron (Monday 6am UTC) is appropriate for fixture and ranking data that changes on a fixed schedule. Contextual analytics depend on completed match data — they should update as each round completes, not on an arbitrary weekday.

The round-completion re-scrape introduced in feature 027 already detects when a round's data is fully available (`isComplete = true`). The analytics cache key must include the latest complete round number so that:

- Stale projections are never served after new round data lands
- No separate cron is needed — invalidation piggybacks on the existing round-completion trigger

**Cache key design:**

```
contextual-projection:{year}:{latestCompleteRound}:{playerId}:{opponent?}:{venue?}:{weather?}
```

When a new round completes and `latestCompleteRound` increments, all prior contextual projection cache entries are naturally superseded. The opponent defensive profile map (a wider aggregation across all teams) should be keyed at the season + round level separately and reused across individual player lookups:

```
opponent-defense-profile:{year}:{latestCompleteRound}
```

---

## Build Priority & Effort

| Model | Prerequisites | Data Available | Estimated Effort |
|---|---|---|---|
| Opponent defensive profiles (3b) | None | Yes — fully existing | Low |
| Head-to-head player RPI (3a) | None | Yes — fully existing | Low |
| Venue RPI (1) | Stadium normalisation map | Yes (once normalised) | Low–Medium |
| Weather categories | Weather string normalisation | Partial (completed matches only) | Low |

**Recommended order:**
1. Opponent model (no new data, immediate value)
2. Venue model (one-time normalisation config)
3. Weather model (string normalisation of existing data)

---

## Implementation Staging

This work is split across two features. The first builds the opponent model and the shared infrastructure the second will plug into. Separating them avoids coupling a schema migration and config files to the initial API design — if the endpoint shape needs adjustment, no migration needs rolling back.

---

## speckit.specify Prompt — Feature 028

Run this command (keep it short — paste the line below, then add detail in follow-up messages if needed):

```
/speckit.specify 028-player-context-analytics-opponent — opponent context model (head-to-head RPI + defensive profile) and shared contextual projection infrastructure. See docs/player-context-analytics-research.md for full design.
```

**Detail for follow-up if speckit asks for clarification:**

- Two sub-models: (A) head-to-head player RPI = mean SC score vs. opponent / player season mean; (B) opponent defensive profile = mean SC points conceded per position normalised against league average (defenseFactor = teamMean / leagueMean)
- All data from existing `match_performances` + `matches` tables — no schema changes
- New files: `src/analytics/contextual-projection-service.ts`, `src/analytics/contextual-projection-types.ts` (ContextualMultiplier, ContextualProjectionResult), `src/application/use-cases/get-contextual-projection.ts`
- Endpoint: `GET /api/supercoach/:year/player/:playerId/contextual-projection` — `opponent` param required; `venue` and `weather` params accepted but ignored (reserved for 029)
- Cache keys include latest complete round number — invalidation tied to round completion, not weekly cron. Opponent defensive profile map cached at `(year, latestCompleteRound)` level and shared across player lookups.
- Do not modify the existing `/projection` endpoint or floor/spike model

---

## speckit.specify Prompt — Feature 029

```
/speckit.specify 029-player-context-analytics-venue-weather — extend 028's contextual projection infrastructure with venue RPI and weather category RPI models. See docs/player-context-analytics-research.md for full design.
```

**Detail for follow-up if speckit asks for clarification:**

- Venue model: player RPI per canonical stadium; requires static normalisation map (raw nrl.com strings → canonical IDs, ~30 venues) and a `stadiums` table `(id, name, city)` — all NRL grounds are open-air grass, no surface/roof fields; confidence gated on N >= 3 games at venue; multiplier = 1.0 when no data
- Weather model: normalise `matches.weather` strings → `clear, cloudy, showers, rain, heavy_rain, windy` (showers is intermittent/lighter than rain); player RPI per category; completed matches only; confidence gated on N < 3; no forecast integration
- Extend `contextual-projection-service.ts` — do not duplicate composition logic
- Add migration for `stadiums` table, stadium normalisation config to `src/config/`, weather normalisation config to `src/config/`
- Cache invalidation: same round-completion pattern as 028, no new cron
- Do not modify the opponent model or base projection endpoint
