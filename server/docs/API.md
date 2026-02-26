# NRL Schedule Scraper API Documentation

**Base URL**: `http://localhost:3001/api`
**Content-Type**: `application/json`

## Overview

REST API for scraping NRL schedule data from nrlsupercoachstats.com and querying fixtures. All endpoints return JSON responses.

---

## Endpoints

### Health Check

```
GET /health
```

Check server status and loaded data summary.

**Response** `200 OK`
```json
{
  "status": "ok",
  "loadedYears": [2025, 2026],
  "totalFixtures": 864
}
```

---

### Scrape Schedule Data

```
POST /scrape
```

Scrape and load schedule data for a specific year.

**Request Body**
```json
{
  "year": 2026
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| year | number | Yes | Integer between 2010-2030 |

**Response** `200 OK`
```json
{
  "success": true,
  "year": 2026,
  "teamsLoaded": 17,
  "fixturesLoaded": 459,
  "warnings": [],
  "timestamp": "2026-02-26T10:30:00.000Z"
}
```

**Error** `400 Bad Request`
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Year must be between 2010 and 2030"
}
```

**Error** `500 Internal Server Error`
```json
{
  "error": "SCRAPE_FAILED",
  "message": "Failed to fetch schedule data: Connection refused"
}
```

---

### Get Loaded Years

```
GET /years
```

List all years that have been scraped and loaded.

**Response** `200 OK`
```json
{
  "years": [2025, 2026],
  "lastUpdated": {
    "2025": "2026-02-25T08:00:00.000Z",
    "2026": "2026-02-26T10:30:00.000Z"
  }
}
```

---

### Get All Teams

```
GET /teams
```

List all NRL teams with their codes and names.

**Response** `200 OK`
```json
{
  "teams": [
    { "code": "BRO", "name": "Brisbane Broncos" },
    { "code": "BUL", "name": "Canterbury Bulldogs" },
    { "code": "CBR", "name": "Canberra Raiders" },
    { "code": "DOL", "name": "Dolphins" },
    { "code": "GCT", "name": "Gold Coast Titans" },
    { "code": "MEL", "name": "Melbourne Storm" },
    { "code": "MNL", "name": "Manly Sea Eagles" },
    { "code": "NEW", "name": "Newcastle Knights" },
    { "code": "NQC", "name": "North Queensland Cowboys" },
    { "code": "NZL", "name": "New Zealand Warriors" },
    { "code": "PAR", "name": "Parramatta Eels" },
    { "code": "PTH", "name": "Perth Reds" },
    { "code": "SHA", "name": "Cronulla Sharks" },
    { "code": "STG", "name": "St George Illawarra Dragons" },
    { "code": "STH", "name": "South Sydney Rabbitohs" },
    { "code": "SYD", "name": "Sydney Roosters" },
    { "code": "WST", "name": "Wests Tigers" }
  ]
}
```

---

### Get Team Schedule

```
GET /teams/:code/schedule
```

Get complete schedule for a specific team with strength totals.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | 3-letter team code (e.g., MEL, BRO) |

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | No | Filter by specific year |

**Example**
```
GET /teams/MEL/schedule?year=2026
```

**Response** `200 OK`
```json
{
  "team": {
    "code": "MEL",
    "name": "Melbourne Storm"
  },
  "schedule": [
    {
      "round": 1,
      "year": 2026,
      "opponent": "PAR",
      "isHome": true,
      "isBye": false,
      "strengthRating": 313
    },
    {
      "round": 15,
      "year": 2026,
      "opponent": null,
      "isHome": false,
      "isBye": true,
      "strengthRating": -533
    }
  ],
  "totalStrength": 4250,
  "byeRounds": [15, 18, 24]
}
```

**Error** `400 Bad Request`
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Unknown team code: XXX",
  "validOptions": ["BRO", "BUL", "CBR", "DOL", "GCT", "MEL", "MNL", "NEW", "NQC", "NZL", "PAR", "PTH", "SHA", "STG", "STH", "SYD", "WST"]
}
```

---

### Query Fixtures

```
GET /fixtures
```

Query fixtures with optional filters. Supports fluent filtering via query parameters.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | No | Filter by season year |
| team | string | No | Filter by team code (3-letter) |
| round | number | No | Filter by exact round number |
| roundStart | number | No | Filter rounds >= this value |
| roundEnd | number | No | Filter rounds <= this value |
| home | boolean | No | If true, only home games |
| away | boolean | No | If true, only away games |
| byes | boolean | No | If true, only bye weeks |
| opponent | string | No | Filter by opponent team code |

**Examples**
```
GET /fixtures?year=2026&team=MEL
GET /fixtures?year=2026&round=5
GET /fixtures?year=2026&team=MEL&roundStart=1&roundEnd=10&away=true
GET /fixtures?team=MEL&opponent=BRO
GET /fixtures?year=2026&byes=true
```

**Response** `200 OK`
```json
{
  "fixtures": [
    {
      "id": "2026-MEL-1",
      "year": 2026,
      "round": 1,
      "teamCode": "MEL",
      "opponentCode": "PAR",
      "isHome": true,
      "isBye": false,
      "strengthRating": 313
    },
    {
      "id": "2026-MEL-2",
      "year": 2026,
      "round": 2,
      "teamCode": "MEL",
      "opponentCode": "STG",
      "isHome": false,
      "isBye": false,
      "strengthRating": 330
    }
  ],
  "count": 2,
  "filters": {
    "year": 2026,
    "team": "MEL"
  }
}
```

**Empty Result** (valid query, no matches)
```json
{
  "fixtures": [],
  "count": 0,
  "filters": {
    "team": "MEL",
    "opponent": "XXX"
  }
}
```

**Error** `400 Bad Request`
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Unknown team code: XXX",
  "validOptions": ["BRO", "BUL", "CBR", "DOL", "GCT", "MEL", "MNL", "NEW", "NQC", "NZL", "PAR", "PTH", "SHA", "STG", "STH", "SYD", "WST"]
}
```

---

### Get Round Details

```
GET /rounds/:year/:round
```

Get all matches and bye teams for a specific round.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| year | number | Season year (2010-2030) |
| round | number | Round number (1-27) |

**Example**
```
GET /rounds/2026/5
```

**Response** `200 OK`
```json
{
  "year": 2026,
  "round": 5,
  "matches": [
    {
      "homeTeam": "MEL",
      "awayTeam": "PTH",
      "homeStrength": 327,
      "awayStrength": 345
    },
    {
      "homeTeam": "BRO",
      "awayTeam": "GCT",
      "homeStrength": 405,
      "awayStrength": 190
    }
  ],
  "byeTeams": ["NQC", "DOL"]
}
```

**Error** `400 Bad Request`
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Round must be between 1 and 27",
  "validOptions": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
}
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "validOptions": ["optional", "array", "of", "valid", "values"]
}
```

| HTTP Status | Error Code | When |
|-------------|------------|------|
| 400 | INVALID_PARAMETER | Invalid request parameter |
| 404 | NOT_FOUND | Resource not found |
| 500 | SCRAPE_FAILED | External scrape operation failed |
| 500 | INTERNAL_ERROR | Unexpected server error |

---

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
npm run dev
```

Server runs at `http://localhost:3001`

### 2. Load Schedule Data

```bash
curl -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"year": 2026}'
```

### 3. Query Data

```bash
# Get Melbourne Storm's schedule
curl "http://localhost:3001/api/fixtures?year=2026&team=MEL"

# Get Round 5 matchups
curl "http://localhost:3001/api/rounds/2026/5"

# Get team schedule with totals
curl "http://localhost:3001/api/teams/MEL/schedule?year=2026"

# Complex query: MEL away games in rounds 1-10
curl "http://localhost:3001/api/fixtures?year=2026&team=MEL&roundStart=1&roundEnd=10&away=true"
```

---

## CORS Configuration

The server allows requests from:
- `http://localhost:3000` (Create React App default)
- `http://localhost:5173` (Vite default)

---

## Data Model

### Fixture

```typescript
interface Fixture {
  id: string;           // Format: "year-teamCode-round"
  year: number;         // Season year
  round: number;        // Round number (1-27)
  teamCode: string;     // 3-letter team code
  opponentCode: string | null;  // null for bye weeks
  isHome: boolean;      // true if home game
  isBye: boolean;       // true if bye week
  strengthRating: number;  // Strength of schedule rating
}
```

### Team

```typescript
interface Team {
  code: string;  // 3-letter code
  name: string;  // Full team name
}
```
