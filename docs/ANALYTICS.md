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
