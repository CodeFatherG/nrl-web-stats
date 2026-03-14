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
