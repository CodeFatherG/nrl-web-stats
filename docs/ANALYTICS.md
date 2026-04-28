# Analytics

Five analytics capabilities are available, all computed on-demand from existing fixture, match, and player data. No persistent analytics storage — results are cached in-memory with version-based invalidation.

## Team Form Analysis

**Endpoint**: `GET /api/analytics/form/:year/:teamCode`

**Inputs**: Completed matches for the team, fixture strength ratings, window size (default 5)

**Computation**:
1. For each completed match, compute a raw score:
   - Win: `1.0 + clamp(margin / 40, 0, 0.5)` → range [1.0, 1.5]
   - Draw: `0.5`
   - Loss: `clamp((40 - margin) / 40, 0, 0.5)` → range [0, 0.5]
2. Normalise opponent difficulty from strength rating (higher rating = easier opponent = lower difficulty factor)
3. Adjust: `formScore = rawScore × (0.5 + 0.5 × difficultyFactor)`
4. Rolling form rating = mean of last N snapshots (where N = window size)
5. Classify: >0.65 = outperforming, <0.35 = underperforming, otherwise = meeting expectations

**Output**: `FormTrajectory` with per-round snapshots, rolling form rating, classification, and sample size warning (if fewer rounds than window size)

## Match Outlook Predictions

**Endpoint**: `GET /api/analytics/outlook/:year/:round`

**Inputs**: Team form ratings, head-to-head records, strength ratings

**Computation** (composite score from 4 weighted factors):
1. **Home Form** (35%): Normalised home team form rating (higher = better for home)
2. **Away Form** (25%): Inverted normalised away form rating (worse away form = better for home)
3. **Head-to-Head** (15%): Historical home win rate between the two teams
4. **Strength Rating** (25%): Normalised fixture strength rating

Composite score = weighted sum / total weight (only factors with available data are included)

**Label Assignment**:
- Check for Upset Alert: if form-based and non-form-based factors diverge by >0.3
- Otherwise: ≥0.65 = Easy, <0.40 = Tough, else = Competitive

**Output**: Array of match outlooks with composite scores and labels, plus completed match results

## Player Performance Trends

**Endpoint**: `GET /api/analytics/trends/:year/:teamCode`

**Inputs**: Per-match player statistics, window size (default 5)

**Computation**:
- Tracks 4 stats: tries, tackles, runMetres, fantasyPoints
- For each stat: compare rolling window average to full season average
- `deviationPercent = ((windowAvg - seasonAvg) / seasonAvg) × 100`
- Direction: >20% = up, <-20% = down, else = stable
- Significance: any stat with >±20% deviation marks the player as significant
- Minimum 3 rounds played for valid analysis

**Output**: Array of player trends, each with per-stat breakdowns. Optional `significantOnly` filter.

## Team Composition Impact

**Endpoint**: `GET /api/analytics/composition/:year/:teamCode`

**Inputs**: Match results, player participation records, player fantasy points

**Computation** (two methods):

1. **Availability Method** (player missed ≥2 matches):
   - `winRateWith` = wins when player played / matches played
   - `winRateWithout` = wins when player missed / matches missed
   - `impactScore = winRateWith - winRateWithout` (range -1 to 1)

2. **Correlation Method** (player played most/all matches):
   - Pearson correlation between player's fantasy points and team win outcomes
   - `impactScore` = correlation coefficient (range -1 to 1)

Constraints: minimum 3 matches played, minimum 5 total team matches. Players ranked by absolute impact score.

**Output**: Array of player impacts with win rates, impact scores, and method used

## Streak Analysis

**Endpoint**: `GET /api/streaks/:year/:code`

**Inputs**: Team's fixture schedule with strength categories (hard/medium/easy)

**Computation** (two-pass detection):

1. **Rough Patches**: Scan for consecutive non-easy rounds containing 2+ hard games. Easy rounds break the sequence. Spans from first hard to last hard (including medium games between).

2. **Soft Draws**: In gaps between rough patches, look for 3+ consecutive easy games. A single non-easy game does not break a soft draw; 2+ consecutive non-easy games end it. Bye rounds are excluded from analysis.

**Output**: Array of streaks (type, start/end rounds, favourable/unfavourable counts) plus summary (counts and longest streaks)

## Supercoach Player Projection Model

**Endpoints**:
- `GET /api/supercoach/:year/player/:playerId/projection`
- `GET /api/supercoach/:year/team/:teamCode/rankings?mode=composite|captaincy|selection|trade`

**Service**: `src/analytics/player-projection-service.ts`

**Purpose**: Decompose each player's Supercoach scoring history into two independent components — a predictable *floor* driven by volume stats, and a volatile *spike* driven by event stats. This separation makes the model more useful than raw averages for different Supercoach decisions: captaincy picks, trade targets, and team selection all weight floor vs. spike differently.

---

### Data sources

Only rounds where `isComplete: true` are used. This flag is set by the Supercoach scoring engine when supplementary data from nrlsupercoachstats.com was successfully matched — rounds where the match hasn't been processed or the player couldn't be linked are automatically excluded.

For each eligible round, the model joins two pieces of data by `round` number:

| Field | Source |
|-------|--------|
| `totalScore`, `categories` | Supercoach score record (`supplementary_stats` + `match_performances`) |
| `minutesPlayed` | `match_performances` table (defaults to 80 if missing) |

---

### Floor component

The floor captures stats that accumulate steadily regardless of match events — tackles, runs, and penalties. These scale roughly with time on field and are the most predictable part of a player's score.

**Floor stats** (points per unit, 2026 season):

| Stat | Points/unit |
|------|------------|
| `tacklesMade` | +1 |
| `missedTackles` | −1 |
| `runsOver8m` | +2 |
| `runsUnder8m` | +1 |
| `penalties` | −2 |
| `errors` | −2 |

**Per-game floor score** = sum of `contribution` values (rawValue × pointsPerUnit) across all categories for the above stat names only.

**Floor profile** (computed across all eligible games):

| Field | Formula |
|-------|---------|
| `floorMean` | Arithmetic mean of per-game floor scores |
| `floorStd` | Sample standard deviation (n−1 denominator); `null` when fewer than 2 games |
| `floorCv` | Coefficient of variation = `floorStd / floorMean`; `null` when `floorStd` is null; `Infinity` when `floorMean ≤ 0` (serialised as `null` in JSON) |
| `floorPerMinute` | `floorMean / avgMinutes` |
| `avgMinutes` | Mean of `minutesPlayed` across eligible games |

**What `floorCv` means**: CV (coefficient of variation) is relative variability — how large the standard deviation is compared to the mean. A CV of 0.15 means the standard deviation is 15% of the mean. Lower CV = more consistent floor. A player with floorMean=50 and floorCv=0.10 is far more reliable than one with floorMean=50 and floorCv=0.40.

---

### Spike component

The spike is the residual: `spikeScore = totalScore − floorScore` for each game. It captures tries, try assists, line breaks, line break assists, and any other event-driven scoring. Spikes are inherently unpredictable but their *distribution* carries information.

**Spike profile** (computed from the array of per-game spike scores):

| Field | Formula |
|-------|---------|
| `spikeMean` | Arithmetic mean of per-game spike scores |
| `spikeStd` | Sample standard deviation (n−1); `null` when fewer than 2 games |
| `spikeCv` | `spikeStd / spikeMean`; `Infinity` when `spikeMean ≤ 0`; serialised as `null` in JSON |
| `spikePerMinute` | `spikeMean / avgMinutes` |
| `spikeP25/50/75/90` | Linear-interpolation percentiles (same algorithm as numpy's default) |

**Percentile calculation**: Uses linear interpolation — `i = p/100 × (n−1)`, then interpolates between `sorted[floor(i)]` and `sorted[ceil(i)]`. Example: for 7 games with spike scores sorted `[21, 28, 30, 34, 34, 37, 46]`, p25 = `28 + 0.5×(30−28) = 29`.

**Spike distribution bands**:

| Band | Range | Meaning |
|------|-------|---------|
| `negative` | < 0 | Penalty-heavy game dragged score below floor |
| `nil` | 0–5 | No meaningful event scoring |
| `low` | 6–15 | Minor contribution (1 try assist or 1 line break) |
| `moderate` | 16–30 | Solid event game (1 try or multiple assists) |
| `high` | 31–50 | Strong event game (multiple tries or assists) |
| `boom` | 51+ | Elite event game |

Each band entry has `count` (number of games in that band) and `frequency` (count / total games, rounded to 4 decimal places). Frequencies sum to 1.0 ± 0.001.

**How to read the distribution**: A player with 60% of games in `nil` and 20% in `boom` is a high-variance pick — great captaincy upside but unreliable for selection. A player with 70% in `moderate` and 20% in `high` is consistent and safe.

---

### Combined projections

| Field | Formula | Meaning |
|-------|---------|---------|
| `projectedTotal` | `floorMean + spikeMean` | Expected score in a typical game |
| `projectedFloor` | `floorMean + spikeP25` | Score in a quiet game (1-in-4 chance of going lower) |
| `projectedCeiling` | `floorMean + spikeP90` | Score in a boom game (1-in-10 chance of exceeding this) |

---

### Sample metadata

| Field | Threshold | Meaning |
|-------|-----------|---------|
| `gamesPlayed` | — | Number of eligible (isComplete=true) rounds used |
| `lowSampleWarning` | `gamesPlayed < 6` | Projections are directionally useful but not statistically reliable |
| `noUsableData` | `gamesPlayed === 0` | No eligible rounds exist — all fields are zero |

---

### Composite ranking score

Used to rank players within a team. Only computed when `floorCv` is non-null (requires ≥ 2 eligible games).

```
compositeScore = w_floor × floorMean
              + w_spike × spikeMean
              + w_consistency × (1 − floorCv)
              + w_reliableSpike × spikeP25
```

The `(1 − floorCv)` term rewards consistency — a player with floorCv=0.10 contributes `0.90 × w_consistency`, while one with floorCv=0.40 contributes only `0.60 × w_consistency`.

Players with `noUsableData` or null `compositeScore` (< 2 eligible games) are excluded from `rankedPlayers` and counted in `excludedCount`.

---

### Ranking modes

Each mode shifts the composite weights to emphasise a different Supercoach decision:

| Mode | `w_floor` | `w_spike` | `w_consistency` | `w_reliableSpike` | Best for |
|------|-----------|-----------|-----------------|-------------------|---------|
| `composite` | 1.0 | 0.8 | 10.0 | 0.5 | General weekly value |
| `captaincy` | 0.5 | 1.5 | 5.0 | 1.0 | Double-score pick — maximise ceiling |
| `selection` | 1.5 | 0.5 | 15.0 | 0.3 | Team selection — maximise floor reliability |
| `trade` | 1.0 | 0.8 | 10.0 | 0.5 | Same weights as composite, but excludes players with `spikeCv ≥ 1.0` or Infinity (removes high-variance trade targets) |

**Captaincy**: Weights spike heavily and reduces the consistency penalty. A boom-or-bust player scores higher here than in composite — that is intentional.

**Selection**: The consistency weight (15.0) dominates. A player with floorCv=0.10 vs 0.30 gets `10 × (0.30 − 0.10) = 2.0` extra points just from consistency, independent of mean score. Use this to find the player least likely to post a low score.

**Trade**: Same formula as composite but applies a hard filter — any player with `spikeCv ≥ 1.0` or undefined (`Infinity`, i.e. spikeMean ≤ 0) is excluded entirely. This surfaces consistent scorers whose price is likely to rise predictably, rather than boom-bust players who are harder to time.

---

### How to use the stats

**Finding a captain**: Use `mode=captaincy` and look at `projectedCeiling` (floorMean + spikeP90). Also check `spikeDistribution.boom.frequency` — a player appearing in the top 5 by captaincy score but with 0% boom games may not be the right pick.

**Safe selection pick**: Use `mode=selection`. Sort by `compositeScore`. Cross-check `floorCv` directly — two players with the same composite score but different `floorCv` (e.g. 0.10 vs 0.25) have meaningfully different risk profiles.

**Trade target**: Use `mode=trade`. These players have been filtered to exclude high-volatility scorers. Look for players with `lowSampleWarning: false` (≥ 6 games) and rising `floorPerMinute` as indicators of sustained improvement.

**Reading `projectedFloor` vs `projectedTotal`**: The gap between these two (`spikeMean − spikeP25`) tells you how much event scoring the player typically contributes even in quiet games. A large gap means the player often contributes event scoring; a small gap means they are a reliable floor scorer.

**Warning flags**:
- `lowSampleWarning: true` — treat all values as directional only; standard deviations and CVs can be misleading with fewer than 6 games
- `floorCv > 0.35` — floor is volatile; the player's base output varies significantly week to week (injury risk, role changes, opponent quality)
- `spikeCv` serialised as `null` — spike mean is zero or negative; the player scores at or below their floor in most games

---

## Supercoach Scoring Engine

**Endpoint**: `GET /api/supercoach/:year/:round`

**Service**: `computePlayerScore()` in `src/analytics/supercoach-scoring-service.ts`

**Inputs**:
- Primary stats (17 fields from NRL.com Match Centre — tries, goals, tackles, run metres, etc.)
- Supplementary stats (8 fields from nrlsupercoachstats.com — line_engaged_runs, missed_goals, forced_drop_outs, effective_offloads, ineffective_offloads, runs_over_8m, runs_under_8m, try_saves)
- Scoring configuration (JSON per season, loaded from `src/config/scoring-tables/{year}.json`)

**Computation**:
1. Load the season's scoring configuration, which maps each stat to a points-per-unit value and a category
2. For each stat entry in the config, multiply the player's raw stat value by the configured points-per-unit
3. Group calculated points into 6 categories:
   - **Scoring**: Points from tries, goals, field goals, conversions
   - **Create**: Points from try assists, line breaks, line break assists, offloads
   - **Evade**: Points from tackle breaks, run metres thresholds, post-contact metres
   - **Base**: Points from base runs, receipts, tackles, minutes played
   - **Defence**: Points from forced drop-outs, intercepts, try saves, one-on-one steals
   - **Negative**: Penalty points from errors, missed tackles, penalties, ineffective offloads
4. Sum all category totals for the player's overall Supercoach score

**Configurable Point Values**: Each season has its own scoring table at `src/config/scoring-tables/{year}.json`. Point values can change between seasons without code changes. The config maps stat names to `{ pointsPerUnit: number, category: string }`.

**Validation** (post-computation checks):
- **Offload mismatch**: Compares effective offloads (OL) + ineffective offloads (IO) from supplementary data against total offloads from primary stats. Flags a warning if they diverge.
- **Run count mismatch**: Compares runs_over_8m (H8) + runs_under_8m (HU) against total runs from primary stats. Flags a warning if the difference exceeds a threshold of 5.
- **Score difference**: Compares the computed Supercoach score against the published `fantasyPointsTotal` from NRL.com. Flags a warning if the difference exceeds 3 points.

**Output**: `RoundSupercoachSummary` with per-player scores (total + 6 category breakdowns), validation summary (total players, players with warnings, warning details), and `isComplete` flag indicating whether all matches in the round have been processed

---

## Contextual Projection Model (Features 028, 029)

**Service**: `src/analytics/contextual-projection-service.ts`

**Endpoint**: `GET /api/supercoach/:year/player/:playerId/contextual-projection`

Adjusts the floor/spike base projection by a combined multiplier composed of independent context sub-models. All context dimensions (opponent, venue, weather) are optional. `adjustedProjection = baseProjection × opponentMultiplier × venueMultiplier`. The weather multiplier is computed and returned in `adjustments.weather` but is **not** applied to `adjustedProjection` (no forecast source is available for future games).

### Sub-Model 1: Opponent Defensive Profile

Measures how many SC points a team concedes to each position per game, normalised against the league average.

**Inputs**: All players' completed SC game scores from all loaded seasons.

**Computation**:
1. For each completed game, attribute the SC score to the opposing team (the defender)
2. Group by `(opponentTeamCode, position)` — compute mean SC points conceded per group
3. Compute league average per position as the mean of ALL individual game scores at that position
4. `defenseFactor = teamMean / leagueMean` — values > 1.0 indicate soft defence, < 1.0 indicate hard defence
5. `defenseConfidence = clamp(gamesCount / 3, 0, 1)` — attenuates factor toward neutral with fewer games

**Multi-season pooling**: Games from all loaded seasons are included. More recent seasons receive higher recency weight: `weight = 1 + (season - minSeason) / max(maxSeason - minSeason, 1)` (linear range [1, 2]).

### Sub-Model 2: Head-to-Head RPI

Measures the player's personal historical performance against a specific opponent, relative to their own average.

**Inputs**: The requesting player's completed SC game scores across all loaded seasons.

**Computation**:
1. Compute weighted overall mean: `sum(score × weight) / sum(weight)`
2. Filter to games where `opponent === opponentCode`
3. Compute weighted h2h mean from those games
4. `rawRpi = h2hMean / overallMean` — values > 1.0 indicate the player scores above their average vs this opponent
5. `h2hConfidence = clamp(h2hGameCount / 3, 0, 1)` — 0 when no h2h games, 1 when ≥ 3 games

### Combined Opponent Multiplier

Both sub-models are confidence-gated via linear interpolation before being combined:

```
effectiveH2h = lerp(1.0, rawRpi,       h2hConfidence)
effectiveDef = lerp(1.0, defenseFactor, defenseConfidence)
multiplier   = effectiveH2h × effectiveDef
```

Where `lerp(a, b, t) = a + (b - a) × t` and `MIN_SAMPLE_N = 3`.

When confidence is 0, the lerp returns 1.0 (neutral — no adjustment). When confidence is 1, the full raw value is applied. Intermediate values attenuate the signal proportionally.

### Sub-Model 3: Venue RPI

Measures the player's historical SC score at a specific stadium relative to their overall mean.

**Inputs**: The requesting player's completed SC game scores with stadium context from all loaded seasons.

**Stadium normalisation**: Raw nrl.com stadium strings are mapped to canonical IDs via `src/config/venue-normalisation.ts`. Games with unrecognised or null stadium strings are excluded from the venue **numerator** only — they still count in the denominator. This keeps all three sub-models on a shared baseline (`mean(ALL games)`). The normalisation map covers all current NRL venues and common historic name variants (e.g. `"Lang Park"` → `suncorp`, `"Stadium Australia"` → `accor_stadium`).

**Computation**:
1. Compute weighted overall mean across **ALL** `playerGames` (shared baseline)
2. Filter to games at `stadiumId` with a recognised venue string → compute weighted venue mean
3. `rawVenueRpi = venueMean / overallMean`
4. `venueConfidence = clamp(venueGames / 3, 0, 1)`
5. `venueMultiplier = lerp(1.0, rawVenueRpi, venueConfidence)`

**Applied to projection**: `venueMultiplier` is multiplied into `adjustedProjection` alongside the opponent multiplier.

### Sub-Model 4: Weather Category RPI

Measures the player's historical SC score in a given weather category relative to their overall mean.

**Inputs**: The requesting player's completed SC game scores with weather context from all loaded seasons.

**Weather normalisation**: Raw nrl.com weather strings are mapped to six canonical categories via `src/config/weather-normalisation.ts`:

| Category | Raw string examples |
|----------|---------------------|
| `clear` | `"Clear"`, `"Fine"`, `"Sunny"` |
| `cloudy` | `"Cloudy"`, `"Overcast"` |
| `showers` | `"Showers"`, `"Passing Showers"` |
| `rain` | `"Raining"`, `"Light Rain"` |
| `heavy_rain` | `"Heavy Rain"`, `"Storms"` |
| `windy` | `"Windy"`, `"Strong Wind"` |

Games with null or unrecognised weather strings are excluded from the weather **numerator** only — they still count in the denominator. This keeps all three sub-models on a shared baseline (`mean(ALL games)`).

**Computation**:
1. Compute weighted overall mean across **ALL** `playerGames` (shared baseline)
2. Filter to games matching `category` with a recognised weather string → compute weighted category mean
3. `rawWeatherRpi = categoryMean / overallMean`
4. `weatherConfidence = clamp(categoryGames / 3, 0, 1)`
5. `weatherMultiplier = lerp(1.0, rawWeatherRpi, weatherConfidence)`

**Informational only**: `weatherMultiplier` is returned in `adjustments.weather` but is **not** applied to `adjustedProjection`. Weather for future games cannot be forecasted at scrape time.

### Applying Multipliers

`applyMultipliers(base, multipliers[])` in `contextual-projection-service.ts` reduces all active multipliers into a single combined factor and scales `total`, `floor`, and `ceiling` uniformly:

```
combined = multipliers.reduce((acc, m) => acc * m, 1.0)
adjustedProjection = { total: base.total * combined, floor: base.floor * combined, ceiling: base.ceiling * combined }
```

Only opponent and venue multipliers are included in the `multipliers[]` array. Weather is excluded.

### Cache Key Strategy

- Defensive profile: `opponent-defense-profile:${year}` with version `${year}:${latestCompleteRound}`
- Per-player result: `contextual-projection:${playerId}:${opponent??'none'}:${venue??'none'}:${weather??'none'}:${year}` with same version
- Cache invalidates naturally when `latestCompleteRound` increases (a new round completes)
- 10-minute TTL safety net via `AnalyticsCache`

### Extensibility

The `adjustments` object in the response uses named optional keys (`opponent`, `venue`, `weather`). New context dimensions can be added as additional multipliers in `applyMultipliers` without changing the base projection or existing sub-models.
