# API Routes

All endpoints return JSON. Error responses follow the standard format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "validOptions": ["option1", "option2"]
}
```

The `validOptions` field is optional and only present for validation errors (e.g., invalid team codes).

**Common HTTP Status Codes**: 200 (success), 400 (invalid input), 404 (not found), 500 (server error), 502 (external service failure)

**Common Data Types**:
- **Team Code**: 3-letter uppercase string — BRO, BUL, CBR, DOL, GCT, MEL, MNL, NEW, NQC, NZL, PAR, PTH, SHA, STG, STH, SYD, WST
- **Year**: Integer ≥ 1998
- **Round**: Integer 1–27 (regular season), 28–31 (finals)
- **Strength Rating**: Float 0–1 (0 = hardest schedule, 1 = easiest)
- **Category**: `"hard"` | `"medium"` | `"easy"` (based on p33/p67 percentile thresholds)

## Health & Status

### GET /api/health

Health check endpoint.

**Parameters**: None

**Response** (200):
```json
{
  "status": "ok",
  "loadedYears": [2024, 2025, 2026],
  "totalFixtures": 1234,
  "cache": { "hits": 0, "misses": 0, "pendingRequests": {} }
}
```

### GET /api/years

List available seasons with last scrape timestamps.

**Parameters**: None

**Response** (200):
```json
{
  "years": [2024, 2025, 2026],
  "lastUpdated": { "2024": "2024-03-15T10:30:00Z", "2025": "2025-03-15T10:30:00Z" }
}
```

## Teams

### GET /api/teams

List all 17 NRL teams.

**Parameters**: None

**Response** (200):
```json
{
  "teams": [
    { "code": "BRO", "name": "Brisbane Broncos" },
    { "code": "BUL", "name": "Canterbury Bulldogs" }
  ]
}
```

### GET /api/teams/:code/schedule

Get a team's full season schedule with strength ratings.

**Path Parameters**:
- `code` (string, required): Team code (3 uppercase letters)

**Query Parameters**:
- `year` (number, optional): Season year (min 1998). Defaults to current season.

**Response** (200):
```json
{
  "team": { "code": "MEL", "name": "Melbourne Storm" },
  "schedule": [
    {
      "round": 1, "year": 2026, "opponent": "BRO", "isHome": true, "isBye": false,
      "strengthRating": 0.35, "category": "hard",
      "scheduledTime": "2026-03-15T18:00:00Z", "stadium": "AAMI Park",
      "weather": "Clear, 20°C", "homeScore": null, "awayScore": null, "isComplete": false
    }
  ],
  "totalStrength": 12.5,
  "byeRounds": [5, 12],
  "thresholds": { "p33": 0.33, "p67": 0.67, "lowerFence": 0.1, "upperFence": 0.9 }
}
```

**Errors**: 400 (invalid team code), 404 (team not found)

## Fixtures

### GET /api/fixtures

Query fixtures with multiple filters. All filters are optional and combinable.

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `year` | number | Season year (min 1998) |
| `team` | string | Team code (3 uppercase letters) |
| `round` | number | Single round (1–27) |
| `roundStart` | number | Starting round for range filter (1–27) |
| `roundEnd` | number | Ending round for range filter (1–27) |
| `homeOnly` | boolean | Filter to home games only |
| `awayOnly` | boolean | Filter to away games only |
| `byesOnly` | boolean | Filter to bye weeks only |
| `opponent` | string | Opponent team code (3 uppercase letters) |

**Response** (200):
```json
[
  {
    "id": "2026-MEL-1", "year": 2026, "round": 1, "teamCode": "MEL",
    "opponentCode": "BRO", "isHome": true, "isBye": false, "strengthRating": 0.35
  }
]
```

**Errors**: 400 (invalid query parameters or team codes)

## Rounds

### GET /api/rounds/:year/:round

Get all matches and bye teams for a specific round.

**Path Parameters**:
- `year` (number, required): Season year (min 1998)
- `round` (number, required): Round number (1–27)

**Response** (200):
```json
{
  "year": 2026, "round": 1,
  "matches": [
    {
      "homeTeam": "BRO", "awayTeam": "MEL",
      "homeStrength": 0.65, "awayStrength": 0.35,
      "homeScore": null, "awayScore": null,
      "scheduledTime": "2026-03-15T18:00:00Z", "isComplete": false,
      "stadium": "AAMI Park", "weather": "Clear, 20°C",
      "hasTeamLists": true
    }
  ],
  "byeTeams": ["NZL", "PTH"]
}
```

**Errors**: 400 (invalid year/round), 404 (no data for year/round)

## Rankings

### GET /api/rankings/:year

Get all teams' season rankings sorted by schedule difficulty.

**Path Parameters**:
- `year` (number, required): Season year (min 1998)

**Response** (200):
```json
{
  "year": 2026,
  "thresholds": { "p33": 0.33, "p67": 0.67, "lowerFence": 0.1, "upperFence": 0.9 },
  "rankings": [
    {
      "team": { "code": "MEL", "name": "Melbourne Storm" },
      "totalStrength": 15.5, "averageStrength": 0.58,
      "percentile": 0.95, "category": "easy", "rank": 1
    }
  ]
}
```

**Errors**: 400 (invalid year), 404 (no data)

### GET /api/rankings/:year/:code

Get a single team's season ranking with per-round breakdown.

**Path Parameters**:
- `year` (number, required): Season year
- `code` (string, required): Team code

**Response** (200):
```json
{
  "team": { "code": "MEL", "name": "Melbourne Storm" },
  "ranking": {
    "teamCode": "MEL", "year": 2026,
    "totalStrength": 15.5, "averageStrength": 0.58,
    "matchCount": 26, "byeCount": 1,
    "percentile": 0.95, "category": "easy",
    "rounds": [
      {
        "teamCode": "MEL", "year": 2026, "round": 1,
        "strengthRating": 0.35, "percentile": 0.3, "category": "hard",
        "opponentCode": "BRO", "isHome": true, "isBye": false
      }
    ]
  }
}
```

**Errors**: 400 (invalid year/code), 404 (not found)

### GET /api/rankings/:year/:code/:round

Get a team's ranking for a specific round.

**Path Parameters**:
- `year` (number, required): Season year
- `code` (string, required): Team code
- `round` (number, required): Round number (1–27)

**Response** (200):
```json
{
  "team": { "code": "MEL", "name": "Melbourne Storm" },
  "ranking": {
    "teamCode": "MEL", "year": 2026, "round": 1,
    "strengthRating": 0.35, "percentile": 0.3, "category": "hard",
    "opponentCode": "BRO", "isHome": true, "isBye": false
  }
}
```

**Errors**: 400 (invalid parameters), 404 (not found)

## Streaks

### GET /api/streaks/:year/:code

Get streak analysis (soft draws and rough patches) for a team's season.

**Path Parameters**:
- `year` (number, required): Season year
- `code` (string, required): Team code

**Response** (200):
```json
{
  "team": { "code": "MEL", "name": "Melbourne Storm" },
  "year": 2026,
  "streaks": [
    {
      "type": "soft_draw", "startRound": 1, "endRound": 5,
      "rounds": 5, "favourableCount": 4, "unfavourableCount": 1
    }
  ],
  "summary": {
    "softDrawCount": 3, "roughPatchCount": 2,
    "longestSoftDraw": 5, "longestRoughPatch": 4
  }
}
```

**Errors**: 400 (invalid parameters), 404 (no data)

## Season Summary

### GET /api/season/:year/summary

Compact season overview with all rounds, matches, and bye teams.

**Path Parameters**:
- `year` (number, required): Season year

**Response** (200):
```json
{
  "year": 2026,
  "thresholds": { "p33": 0.33, "p67": 0.67, "lowerFence": 0.1, "upperFence": 0.9 },
  "rounds": [
    {
      "round": 1,
      "matches": [
        {
          "homeTeam": "BRO", "awayTeam": "MEL",
          "homeScore": null, "awayScore": null,
          "scheduledTime": "2026-03-15T18:00:00Z", "isComplete": false,
          "homeStrength": 0.65, "awayStrength": 0.35
        }
      ],
      "byeTeams": ["NZL"]
    }
  ]
}
```

**Errors**: 400 (invalid year), 404 (season not loaded)

## Scrape Triggers

### POST /api/scrape

Trigger a fixture/strength rating scrape for a season.

**Request Body**:
```json
{ "year": 2026, "force": false }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | number | Yes | Season year (min 1998) |
| `force` | boolean | No | Force re-scrape even if cached. Default: false |

**Response** (200):
```json
{
  "success": true, "year": 2026,
  "teamsLoaded": 16, "fixturesLoaded": 234,
  "warnings": [
    { "type": "MALFORMED_CELL", "message": "Could not parse cell", "context": { "round": 1 } }
  ],
  "timestamp": "2026-03-15T10:30:00Z"
}
```

**Errors**: 400 (invalid year), 500 (scrape failed)

### POST /api/scrape/players

Trigger player statistics scrape for a specific round.

**Request Body**:
```json
{ "year": 2026, "round": 1, "force": false }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | number | Yes | Season year (2020–2030) |
| `round` | number | Yes | Round number (1–31) |
| `force` | boolean | No | Force re-scrape. Default: false |

**Response** (200):
```json
{
  "success": true, "year": 2026, "round": 1,
  "playersProcessed": 234, "matchesScraped": 8,
  "created": 45, "updated": 189, "skipped": 0, "warnings": []
}
```

**Errors**: 400 (invalid parameters or round already complete without force), 502 (scrape failed)

### POST /api/scrape/supercoach

Trigger supplementary stats scraping from nrlsupercoachstats.com for Supercoach scoring.

**Request Body**:
```json
{ "year": 2026, "round": 1, "force": false }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | number | Yes | Season year (2020–2030) |
| `round` | number | Yes | Round number (1–27) |
| `force` | boolean | No | Force re-scrape even if data exists. Default: false |

**Response** (200):
```json
{
  "success": true, "year": 2026, "round": 1,
  "matchedPlayers": 210, "unmatchedPlayers": 5,
  "warnings": [
    { "type": "UNMATCHED_PLAYER", "message": "Could not match player to primary stats", "context": { "playerName": "..." } }
  ],
  "timestamp": "2026-03-15T10:30:00Z"
}
```

**Errors**: 400 (invalid parameters), 502 (scrape failed)

### POST /api/scrape/team-lists

Trigger team list (lineup) scraping for a season/round.

**Request Body**:
```json
{ "year": 2026, "round": 5 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | number | Yes | Season year (2020–2030) |
| `round` | number | No | Round number (1–31). If omitted, scrapes all rounds for the year |

**Response** (200):
```json
{
  "success": true, "year": 2026, "round": 5,
  "scrapedCount": 16, "skippedCount": 0, "backfilledCount": 0,
  "warnings": [
    { "type": "EMPTY_TEAM_LIST", "message": "No players in home team roster for 2026-R5-BRO-MEL", "context": {} }
  ]
}
```

**Errors**: 400 (invalid year or round)

## Matches

### GET /api/matches/:matchId

Get full match detail including player statistics for both teams.

**Path Parameters**:
- `matchId` (string, required): Match ID in format `{year}-R{round}-{teamA}-{teamB}` (e.g., `2026-R1-BRO-MEL`)

**Response** (200):
```json
{
  "matchId": "2026-R1-BRO-MEL", "year": 2026, "round": 1,
  "homeTeamCode": "BRO", "awayTeamCode": "MEL",
  "homeTeamName": "Brisbane Broncos", "awayTeamName": "Melbourne Storm",
  "homeScore": 24, "awayScore": 20,
  "status": "Completed",
  "homeStrengthRating": 0.65, "awayStrengthRating": 0.35,
  "scheduledTime": "2026-03-15T18:00:00Z",
  "stadium": "Suncorp Stadium", "weather": "Clear, 22°C",
  "homeTeamList": {
    "teamCode": "BRO",
    "scrapedAt": "2026-03-15T06:00:00Z",
    "members": [
      { "jerseyNumber": 1, "playerName": "Reece Walsh", "position": "Fullback", "playerId": 100001 }
    ]
  },
  "awayTeamList": null,
  "homePlayerStats": [
    {
      "playerId": "502490",
      "playerName": "Player Name", "position": "Five-Eighth",
      "tries": 0, "goals": 2, "tackles": 12, "runMetres": 250,
      "fantasyPoints": 85, "minutesPlayed": 80
    }
  ],
  "awayPlayerStats": []
}
```

Player stats arrays contain 60+ fields per player (see [Scraping Behaviour — Data Source 3](SCRAPING.md#data-source-3-nrlcom-match-centre-player-statistics) for full field list).

Team list fields (`homeTeamList`, `awayTeamList`) are `null` when no team list data is available. When present, `members` are ordered by jersey number (1–17), with starters (1–13) before interchange (14–17).

**Errors**: 400 (invalid match ID format), 404 (match not found)

## Players

### GET /api/players/season/:year

Get aggregated season statistics for all players in a given season. Returns a summary per player with totals and averages across all their match performances.

**Path Parameters**:
- `year` (number, required): Season year (2020–2030)

**Response** (200):
```json
{
  "season": 2026,
  "players": [
    {
      "playerId": "502490",
      "playerName": "Cameron Munster",
      "teamCode": "MEL",
      "position": "Five-Eighth",
      "gamesPlayed": 10,
      "totalTries": 2,
      "totalRunMetres": 2500,
      "totalTacklesMade": 120,
      "totalPoints": 44,
      "averageFantasyPoints": 85.5,
      "totalTackleBreaks": 15,
      "totalLineBreaks": 8
    }
  ]
}
```

**Notes**:
- Players with no match performances in the season are excluded
- `teamCode` reflects the player's most recent team in that season (handles mid-season transfers)
- Stats are aggregated from `match_performances` table via SQL GROUP BY

**Errors**: 400 (invalid year), 404 (no player data for season)

### GET /api/players/team/:teamCode

Get all players for a team with season statistics and per-match performances.

**Path Parameters**:
- `teamCode` (string, required): Team code (3 uppercase letters)

**Query Parameters**:
- `season` (number, optional): Filter by season year (2020–2030)

**Response** (200):
```json
{
  "team": "MEL", "season": 2026,
  "players": [
    {
      "id": "502490",
      "name": "Cameron Munster", "position": "Five-Eighth",
      "seasonStats": {
        "matchesPlayed": 10, "totalTries": 2, "totalGoals": 15,
        "totalTackles": 120, "totalRunMetres": 2500, "totalFantasyPoints": 850
      },
      "performances": [
        {
          "matchId": "2026-R1-BRO-MEL", "round": 1, "teamCode": "MEL",
          "tries": 0, "goals": 2, "tackles": 12, "runMetres": 250,
          "fantasyPoints": 85, "isComplete": true
        }
      ]
    }
  ]
}
```

**Errors**: 400 (invalid team code or season)

### GET /api/players/:playerId

Get a single player's profile with season-by-season breakdown.

**Path Parameters**:
- `playerId` (string, required): Player ID (NRL.com numeric player ID as a string, e.g. `"502490"`)

**Query Parameters**:
- `season` (number, optional): Filter by season year (2020–2030)

**Response** (200):
```json
{
  "id": "502490",
  "name": "Cameron Munster", "position": "Five-Eighth", "teamCode": "MEL",
  "seasons": {
    "2026": {
      "matchesPlayed": 10, "totalTries": 2, "totalGoals": 15,
      "totalTackles": 120, "totalRunMetres": 2500, "totalFantasyPoints": 850,
      "performances": []
    }
  }
}
```

Each performance object in the `performances` array includes supplementary stats from nrlsupercoachstats.com (null when unavailable), including:
- `price` (number | null): Player Supercoach price in whole dollars (e.g., 523400 for $523,400)
- `breakEven` (number | null): Break even score for the round (signed integer, can be negative)

**Errors**: 400 (missing playerId), 404 (player not found)

## Supercoach

All Supercoach endpoints share a common **match result** shape. A match result contains two team groups (home and away), each with player scores and a `teamTotal`. The `teamTotal` always equals the arithmetic sum of its `players` array `totalScore` values.

**Shared `matchConfidence` values** — how a player was linked between nrl.com and nrlsupercoachstats.com:
- `linked` — matched via persisted link database (highest confidence)
- `exact` — exact normalized name match
- `normalized` — fuzzy prefix first name match
- `team_lastname` — matched by last name + team code (unique on team)
- `override` — legacy manual override
- `unmatched` — no supplementary data linked

**Error envelope**: `{ "error": "CODE", "message": "...", "validOptions": [...] }`

---

### Shared Types

**`StatContribution`** — a single stat's contribution within a `categories` array:

```json
{
  "statName": "tries",
  "displayName": "Tries",
  "rawValue": 2,
  "pointsPerUnit": 17,
  "contribution": 34
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statName` | string | Programmatic stat key (see category tables below) |
| `displayName` | string | Human-readable label |
| `rawValue` | number | Raw count of the stat |
| `pointsPerUnit` | number | Points awarded per unit (may be negative) |
| `contribution` | number | `rawValue × pointsPerUnit` — total points from this stat |

**`categoryTotals`** — sum of all `contribution` values within each category:

```json
{ "scoring": 34, "create": 12, "evade": 4, "base": 15, "defence": 6, "negative": -4 }
```

**`categories`** — each key is a `ScoringCategory` containing an array of `StatContribution` entries. Only stats with a non-zero `rawValue` are included. Per-category stat keys (season-specific; values shown are for 2026):

| Category | `statName` keys | Points/unit |
|----------|-----------------|-------------|
| `scoring` | `tries` | +17 |
| | `goals` | +4 |
| | `missedGoals` | −2 |
| | `onePointFieldGoals` | +5 |
| | `twoPointFieldGoals` | +10 |
| | `missedFieldGoals` | −1 |
| `create` | `tryAssists` | +12 |
| | `lastTouch` | +4 |
| | `lineBreakAssists` | +8 |
| | `forcedDropOutKicks` | +6 |
| | `fortyTwentyKicks` | +10 |
| | `twentyFortyKicks` | +10 |
| | `kicksDead` | −3 |
| `evade` | `effectiveOffloads` | +4 |
| | `ineffectiveOffloads` | +2 |
| | `tackleBreaks` | +2 |
| | `lineBreaks` | +10 |
| | `intercepts` | +5 |
| | `kickRegatherBreak` | +8 |
| `base` | `tacklesMade` | +1 |
| | `missedTackles` | −1 |
| | `runsOver8m` | +2 |
| | `runsUnder8m` | +1 |
| `defence` | `trySaves` | +3 |
| | `heldUpInGoal` | +3 |
| `negative` | `penalties` | −2 |
| | `errors` | −2 |
| | `sinBins` | −8 |
| | `sendOffs` | −16 |

Stats sourced from nrlsupercoachstats.com (`lastTouch`, `effectiveOffloads`, `ineffectiveOffloads`, `kickRegatherBreak`, `runsOver8m`, `runsUnder8m`, `trySaves`, `heldUpInGoal`, `missedGoals`, `missedFieldGoals`) will have `rawValue: 0` and `contribution: 0` when `matchConfidence` is `unmatched`.

**`validationWarnings`** — cross-reference discrepancies between nrl.com and nrlsupercoachstats.com data:

```json
[
  {
    "type": "offload_mismatch",
    "message": "Offload count mismatch: primary=3, supplementary=2",
    "primaryValue": 3,
    "supplementaryValue": 2
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"offload_mismatch"` \| `"run_count_mismatch"` \| `"unmatched_player"` |
| `message` | string | Human-readable description |
| `primaryValue` | number \| null | Value from nrl.com |
| `supplementaryValue` | number \| null | Value from nrlsupercoachstats.com |

---

### GET /api/supercoach/:year/match/:matchId

Get Supercoach scores for a single match, grouped by team.

**Path Parameters**:
- `year` (number, required): Season year (≥ 1998)
- `matchId` (string, required): Match ID in format `{year}-R{round}-{teamA}-{teamB}` (e.g. `2026-R3-NQC-BRI`)

**Response** (200):
```json
{
  "matchId": "2026-R3-NQC-BRI",
  "year": 2026,
  "round": 3,
  "isComplete": true,
  "homeTeam": {
    "teamCode": "NQC",
    "teamName": "North Queensland Cowboys",
    "teamTotal": 612,
    "isComplete": true,
    "players": [
      {
        "playerId": "506000",
        "playerName": "Jason Taumalolo",
        "teamCode": "NQC",
        "matchId": "2026-R3-NQC-BRI",
        "year": 2026,
        "round": 3,
        "totalScore": 95,
        "isComplete": true,
        "matchConfidence": "linked",
        "categoryTotals": { "scoring": 20, "create": 10, "evade": 15, "base": 42, "defence": 12, "negative": -4 },
        "categories": {
          "scoring": [
            { "statName": "tries", "displayName": "Tries", "rawValue": 1, "pointsPerUnit": 17, "contribution": 17 },
            { "statName": "goals", "displayName": "Goals", "rawValue": 0, "pointsPerUnit": 4, "contribution": 0 }
          ],
          "create": [ "..." ],
          "evade": [ "..." ],
          "base": [ "..." ],
          "defence": [ "..." ],
          "negative": [ "..." ]
        },
        "validationWarnings": [
          { "type": "offload_mismatch", "message": "...", "primaryValue": 3, "supplementaryValue": 2 }
        ]
      }
    ]
  },
  "awayTeam": {
    "teamCode": "BRI",
    "teamName": "Brisbane Broncos",
    "teamTotal": 589,
    "isComplete": true,
    "players": []
  }
}
```

**Errors**: 400 `INVALID_YEAR`, 400 `INVALID_MATCH_ID`, 404 `MATCH_NOT_FOUND`

---

### GET /api/supercoach/:year/:round

Get Supercoach scores for all matches in a round. Each match entry uses the shared match result shape.

**⚠️ Breaking change**: Previous response was a flat `{ scores: [] }` array. Now returns `{ matches: [] }`.

**Path Parameters**:
- `year` (number, required): Season year (≥ 1998)
- `round` (number, required): Round number (1–27)

**Response** (200):
```json
{
  "year": 2026,
  "round": 3,
  "isComplete": true,
  "matchCount": 8,
  "matches": [
    {
      "matchId": "2026-R3-NQC-BRI",
      "year": 2026,
      "round": 3,
      "isComplete": true,
      "homeTeam": { "teamCode": "NQC", "teamName": "...", "teamTotal": 612, "isComplete": true, "players": [] },
      "awayTeam": { "teamCode": "BRI", "teamName": "...", "teamTotal": 589, "isComplete": true, "players": [] }
    }
  ]
}
```

Returns `{ matches: [] }` (empty array, not 404) when no data exists for the round.

**Errors**: 400 `INVALID_YEAR`, 400 `INVALID_ROUND`

---

### GET /api/supercoach/:year/team/:teamCode

Get all matches a team played in a year. Each match uses the shared match result shape and includes both teams.

**Path Parameters**:
- `year` (number, required): Season year (≥ 1998)
- `teamCode` (string, required): 3-letter team code (uppercase, e.g. `NQC`)

**Response** (200):
```json
{
  "year": 2026,
  "teamCode": "NQC",
  "teamName": "North Queensland Cowboys",
  "matches": [
    {
      "matchId": "2026-R1-NQC-BRI",
      "year": 2026,
      "round": 1,
      "isComplete": true,
      "homeTeam": { "teamCode": "NQC", "teamTotal": 590, "isComplete": true, "players": [] },
      "awayTeam": { "teamCode": "BRI", "teamTotal": 620, "isComplete": true, "players": [] }
    }
  ]
}
```

Returns `{ matches: [] }` (not 404) when team has no data for the year. Ordered by round ascending.

**Errors**: 400 `INVALID_YEAR`, 400 `INVALID_TEAM_CODE` (includes `validOptions` list)

---

### GET /api/supercoach/:year/player/:playerId

Get a player's Supercoach scores across the season, one entry per match appearance.

**⚠️ Breaking change**: Previous response had `{ rounds: [] }`. Now includes `{ matches: [] }` with per-match entries and `matchId` references.

**Path Parameters**:
- `year` (number, required): Season year (≥ 1998)
- `playerId` (string, required): Player ID

**Response** (200):
```json
{
  "playerId": "502490",
  "playerName": "Cameron Munster",
  "teamCode": "MEL",
  "year": 2026,
  "seasonTotal": 1240,
  "seasonAverage": 89,
  "matchesPlayed": 14,
  "matches": [
    {
      "matchId": "2026-R1-MEL-BRI",
      "year": 2026,
      "round": 1,
      "opponent": "BRI",
      "playerId": "502490",
      "playerName": "Cameron Munster",
      "teamCode": "MEL",
      "totalScore": 95,
      "isComplete": true,
      "matchConfidence": "linked",
      "categoryTotals": { "scoring": 20, "create": 15, "evade": 18, "base": 42, "defence": 8, "negative": -8 },
      "categories": {
        "scoring": [ "..." ],
        "create": [ "..." ],
        "evade": [ "..." ],
        "base": [ "..." ],
        "defence": [ "..." ],
        "negative": [ "..." ]
      },
      "validationWarnings": []
    }
  ]
}
```

Each `matchId` in `matches` resolves against `GET /api/supercoach/:year/match/:matchId`.

**Errors**: 400 `INVALID_YEAR`, 404 `PLAYER_NOT_FOUND`

## Casualty Ward

### GET /api/casualty-ward

Get all currently active casualty ward entries (players with open injuries).

**Parameters**: None

**Response** (200):
```json
{
  "entries": [
    {
      "id": 1,
      "firstName": "Nathan",
      "lastName": "Cleary",
      "playerName": "Nathan Cleary",
      "teamCode": "PTH",
      "injury": "Knee",
      "expectedReturn": "Round 10",
      "startDate": "2026-03-25",
      "endDate": null,
      "playerId": "100009100"
    }
  ],
  "count": 15
}
```

### GET /api/casualty-ward/player/:playerId

Get injury history for a specific player.

**Path Parameters**:
- `playerId` (string, required): Player ID

**Response** (200):
```json
{
  "playerId": "100009100",
  "entries": [
    {
      "id": 1,
      "firstName": "Nathan",
      "lastName": "Cleary",
      "playerName": "Nathan Cleary",
      "teamCode": "PTH",
      "injury": "Knee",
      "expectedReturn": "Round 10",
      "startDate": "2026-03-25",
      "endDate": "2026-05-01",
      "playerId": "100009100"
    }
  ]
}
```

**Errors**: 404 (player not found)

### POST /api/scrape/casualty-ward

Trigger casualty ward scrape from nrl.com. Uses change detection to insert new entries, close removed entries, and update changed injuries/expected returns.

**Request Body**: None required

**Response** (200):
```json
{
  "success": true,
  "newEntries": 3,
  "closedEntries": 1,
  "updatedEntries": 0,
  "totalOpen": 15,
  "warnings": []
}
```

**Errors**: 502 (nrl.com API failure)

## Analytics

### GET /api/analytics/form/:year/:teamCode

Get team form trajectory showing performance trend over recent rounds.

**Path Parameters**:
- `year` (number, required): Season year
- `teamCode` (string, required): Team code

**Query Parameters**:
- `window` (number, optional): Rolling window size (1–27). Default: 5

**Response** (200):
```json
{
  "teamCode": "MEL", "teamName": "Melbourne Storm",
  "year": 2026, "windowSize": 5,
  "snapshots": [
    {
      "round": 3, "result": "win", "margin": 12,
      "opponentCode": "BRO", "opponentStrengthRating": 0.65, "formScore": 0.85
    }
  ],
  "rollingFormRating": 0.72,
  "classification": "outperforming",
  "sampleSizeWarning": false
}
```

`classification` values: `"outperforming"` (>0.65), `"meeting"` (0.35–0.65), `"underperforming"` (<0.35)

**Errors**: 400 (invalid parameters)

### GET /api/analytics/outlook/:year/:round

Get match outlook predictions for all matches in a round.

**Path Parameters**:
- `year` (number, required): Season year
- `round` (number, required): Round number (1–27)

**Query Parameters**:
- `window` (number, optional): Rolling window size (1–27). Default: 5

**Response** (200):
```json
[
  {
    "matchId": "2026-R1-BRO-MEL",
    "homeTeamCode": "BRO", "awayTeamCode": "MEL",
    "homeFormRating": 0.7, "awayFormRating": 0.65,
    "headToHead": {
      "totalMatches": 48, "homeWins": 24, "awayWins": 22,
      "draws": 2, "homeWinRate": 0.5
    },
    "strengthRating": 0.35,
    "compositeScore": 0.6,
    "label": "Competitive",
    "factorsAvailable": 3
  }
]
```

`label` values: `"Easy"` (≥0.65), `"Competitive"` (0.40–0.65), `"Tough"` (<0.40), `"Upset Alert"` (form/non-form factor divergence >0.3)

**Errors**: 400 (invalid parameters)

### GET /api/analytics/trends/:year/:teamCode

Get player performance trends for a team, comparing recent form to season averages.

**Path Parameters**:
- `year` (number, required): Season year
- `teamCode` (string, required): Team code

**Query Parameters**:
- `window` (number, optional): Rolling window size (1–27). Default: 5
- `significantOnly` (boolean, optional): Only return players with significant trends (>±20% deviation). Default: false

**Response** (200):
```json
[
  {
    "playerId": "502490",
    "playerName": "Cameron Munster",
    "roundsPlayed": 5,
    "isSignificant": true, "sampleSizeWarning": false,
    "stats": [
      {
        "statName": "fantasyPoints",
        "seasonAverage": 85, "windowAverage": 92,
        "deviationPercent": 8.2, "direction": "up"
      }
    ]
  }
]
```

Tracked stats: `tries`, `tackles`, `runMetres`, `fantasyPoints`. Direction: `"up"` (>20%), `"down"` (<-20%), `"stable"` (within ±20%).

**Errors**: 400 (invalid parameters)

### GET /api/analytics/composition/:year/:teamCode

Get individual player impact on team win rate.

**Path Parameters**:
- `year` (number, required): Season year
- `teamCode` (string, required): Team code

**Response** (200):
```json
{
  "teamCode": "MEL", "teamName": "Melbourne Storm",
  "year": 2026, "totalMatches": 10, "sampleSizeWarning": false,
  "playerImpacts": [
    {
      "playerId": "502490",
      "playerName": "Cameron Munster",
      "matchesPlayed": 8, "matchesMissed": 2,
      "winRateWith": 0.875, "winRateWithout": 0.5,
      "impactScore": 0.375, "method": "availability"
    }
  ]
}
```

`method` values: `"availability"` (player missed ≥2 matches — compares win rate with/without), `"correlation"` (Pearson correlation between fantasy points and team wins)

**Errors**: 400 (invalid parameters)
