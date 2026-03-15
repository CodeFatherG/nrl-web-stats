# Supercoach Data Acquisition Guide — Manual Validation

This guide provides step-by-step instructions for manually acquiring the 8 missing Supercoach statistics from each of the three identified sources. Use this to validate the data is accessible and accurate before building automated adapters.

---

## Quick Reference — The 8 Missing Stats

These stats are **not available** (or only partially available) from the nrl.com match centre API:

| Stat | SC Points | Why Missing from nrl.com |
|------|-----------|------------------------|
| Try Contribution / Last Touch | +4 | Not in match centre JSON |
| Missed Goal | -2 | Only missed conversions derivable, not missed penalty goals |
| Missed Field Goal | -1 | Only successful FGs tracked, not attempts |
| Offload to Hand (Effective) | +4 | Only combined `offloads` field |
| Offload to Ground (Ineffective) | +2 | Only combined `offloads` field |
| Runs 8m+ | +2 | Only aggregate `allRuns` and `allRunMetres` |
| Runs <8m | +1 | Only aggregate `allRuns` and `allRunMetres` |
| Try Saves | +3 | Not tracked at all |

---

## Source 1: nrlsupercoachstats.com (Recommended)

### What it provides

All 8 missing stats, plus all 17 primary stats — a complete Supercoach breakdown per player per round.

### Method A: Stats Table (all players, one round)

This is the best approach for bulk data. The stats page uses a jqGrid that loads data via a server-side JSON endpoint.

#### Step 1 — Open the stats table in your browser

```
https://www.nrlsupercoachstats.com/stats.php?year=2026
```

#### Step 2 — Filter to a specific round

Use the **Round** dropdown at the top of the page. Select a round number (e.g. `01`) to filter the grid to that round's data.

#### Step 3 — Locate the missing stat columns

Scroll right in the table to find these columns (they're towards the right end):

| Column Header | Full Name | SC Points |
|---------------|-----------|-----------|
| **LT** | Last Touch Assists | +4 |
| **MG** | Missed Goals | -2 |
| **MF** | Missed Field Goals | -1 |
| **OL** | Effective Offloads (to hand) | +4 |
| **IO** | Ineffective Offloads (to ground) | +2 |
| **H8** | Hit-ups Over 8m | +2 |
| **HU** | Hit-ups Under 8m | +1 |
| **TS** | Try Assists (column label) — but in context may also be Try Saves | +3 |

Additional columns you may see:
| Column Header | Full Name | SC Points |
|---------------|-----------|-----------|
| **HG** | Held up in Goal | +3 |
| **IT** | Intercept | +5 |
| **KD** | Kicks Dead | -3 |
| **KB** | Kick & Regather Break | +8 |

#### Step 4 — Export or inspect the raw JSON data

The grid fetches its data from this endpoint:

```
https://www.nrlsupercoachstats.com/stats.php?year=2026&grid_id=list1
```

To see the raw JSON:

1. Open browser DevTools (F12 or Ctrl+Shift+I)
2. Go to the **Network** tab
3. Reload the page or change the round filter
4. Look for the XHR/Fetch request to `stats.php?year=2026&grid_id=list1`
5. The request will include jqGrid pagination parameters:
   - `jqgrid_page` — page number
   - `rows` — rows per page (increase this to get all players in one request)
   - `sidx` — sort column
   - `sord` — sort order (asc/desc)
   - Additional filter parameters for round, team, position

6. Click the request and view the **Response** tab to see the JSON structure

The JSON response contains a `rows` array where each row has a `cell` array with values in column order, or an object with named fields matching the column model: `TR, TS, LT, GO, MG, FG, MF, TA, MT, TB, FD, OL, IO, LB, LA, FT, KB, H8, HU, HG, IT, KD, PC, ER, SS`.

#### Step 5 — Validate with curl

```bash
# Fetch round 1 data (adjust parameters as needed based on what you observe in DevTools)
curl -s "https://www.nrlsupercoachstats.com/stats.php?year=2026&grid_id=list1&jqgrid_page=1&rows=500&sidx=Score&sord=desc" \
  -H "User-Agent: Mozilla/5.0" \
  -H "X-Requested-With: XMLHttpRequest" | python3 -m json.tool | head -100
```

> **Note:** The `X-Requested-With: XMLHttpRequest` header is often required for jqGrid endpoints to return JSON instead of HTML. If you get HTML back, add this header.

### Method B: Player Profile Page (one player, all rounds)

#### Step 1 — Navigate to a player profile

```
https://www.nrlsupercoachstats.com/index.php?player=Cleary,+Nathan
```

URL format: `index.php?player={LastName},+{FirstName}`

For players with special characters:
- Apostrophes: `O'Sullivan` → `O%27Sullivan`
- Hyphens: `Harris-Tavita` → `Harris-Tavita` (no encoding needed)

#### Step 2 — Find the detailed stats chart

The player profile uses Highcharts to render stats visually. The per-round detailed breakdown is loaded via AJAX from:

```
https://www.nrlsupercoachstats.com/highcharts/data-detailedstats.php
```

#### Step 3 — Capture the data endpoint

1. Open browser DevTools → Network tab
2. Load the player profile page
3. Filter network requests by `data-detailedstats`
4. The request URL will include query parameters for the player and year
5. The response is JSON with a `data` array containing 22 values per round, corresponding to the stat columns: `TR, TS, LT, GO, MG, FG, MF, TA, MT, TB, FD, OL, IO, LB, LA, FT, KB, H8, HU, PC, ER, SS`

#### Step 4 — Validate with curl

```bash
# Capture the exact URL from DevTools (parameters may vary)
curl -s "https://www.nrlsupercoachstats.com/highcharts/data-detailedstats.php?player=Cleary,+Nathan&year=2026" \
  -H "User-Agent: Mozilla/5.0" | python3 -m json.tool
```

### What to verify

- [ ] The jqGrid JSON endpoint returns data with the stat columns `LT, MG, MF, OL, IO, H8, HU`
- [ ] Filtering by round works and returns per-round data
- [ ] Player names match (or are close enough to) the nrl.com player names
- [ ] The `Score` column total matches the sum you get by applying the scoring formula to all individual stat columns
- [ ] Compare a few players' totals against the official Supercoach app to confirm accuracy

---

## Source 2: footystatistics.com

### What it provides

Per-player per-match stats including offload to hand (OFH), offload to ground (OFG), try saves (TS), and other Supercoach-relevant breakdowns. Has a public JSON API.

### Step 1 — Search for a player

The site has a REST API for player search:

```bash
curl -s "https://footystatistics.com/api/players/search?q=Nathan+Cleary" \
  -H "User-Agent: Mozilla/5.0" | python3 -m json.tool
```

This returns a JSON array of matching players with their `id`, `name`, `team`, `cost`, and `positions`.

Note the `player_id` from the response — you'll need it for the next step.

### Step 2 — Fetch player stats

```bash
curl -s "https://footystatistics.com/api/player-stats?player_id={PLAYER_ID}" \
  -H "User-Agent: Mozilla/5.0" | python3 -m json.tool
```

Replace `{PLAYER_ID}` with the ID from step 1.

The response contains per-match stats with these relevant fields:

| API Field | Full Name | SC Points |
|-----------|-----------|-----------|
| **OFH** | Offload to Hand | +4 |
| **OFG** | Offload to Ground | +2 |
| **TS** | Try Saves | +3 |
| **T** | Tries | +17 |
| **G** | Goals | +4 |
| **FG** | Field Goals | +5 |
| **TA** | Try Assists | +12 |
| **LB** | Line Breaks | +10 |
| **LBA** | Line Break Assists | +8 |
| **TCK** | Tackles | +1 |
| **MT** | Missed Tackles | -1 |
| **TB** | Tackle Breaks | +2 |
| **MG** | Metres Gained | (not directly SC-relevant) |
| **FDO** | Forced Drop Out | +6 |
| **FT** | Forty Twenty | +10 |
| **ER** | Errors | -2 |
| **PC** | Penalties Conceded | -2 |
| **SB** | Sin Bin | -8 |
| **SO** | Send Off | -16 |

### Step 3 — Browse via the web UI

You can also view stats in the browser:

```
https://footystatistics.com/{team-code}/{player-slug}
```

Team codes: `can`, `tig`, `mel`, `new`, `bro`, `pen`, `sti`, `dol`, `cow`, `nzw`, `par`, `rab`, `cro`, `syd`, `man`, `gld`

Example: `https://footystatistics.com/pen/nathan-cleary`

### Limitations

- **Missing stats:** This source does NOT appear to track: runs 8m+ / <8m split, missed goals, missed field goals, try contribution / last touch, or kick & regather break. It primarily adds offload hand/ground split and try saves.
- **Premium features:** Advanced filtering (by opponent, round range, etc.) may require authentication.
- **Player IDs:** Uses its own internal player IDs — you'll need the search step first.

### What to verify

- [ ] The `/api/players/search` endpoint works without authentication for basic queries
- [ ] The `/api/player-stats` endpoint returns per-match breakdowns with OFH and OFG columns
- [ ] Try Saves (TS) are present in the response
- [ ] Compare OFH + OFG totals against the combined `offloads` field from nrl.com to confirm they add up

---

## Source 3: Official Supercoach API (supercoach.dailytelegraph.com.au)

### What it provides

The authoritative source of truth — official Supercoach scores and all stat breakdowns as used by the actual Supercoach game.

### Prerequisites

You need a free Supercoach account:
1. Go to `https://supercoach.dailytelegraph.com.au`
2. Register a free account (email + password)
3. Note your username and password — you'll need them for OAuth2 token exchange

### Step 1 — Obtain an access token

The API uses OAuth2 Resource Owner Password Credentials grant. You need the client ID and client secret, which are typically embedded in the Supercoach web app's JavaScript.

To find them:
1. Open `https://supercoach.dailytelegraph.com.au` in your browser
2. Open DevTools → Network tab
3. Log in with your account
4. Watch for a POST request to an `access_token` endpoint
5. Note the `client_id` and `client_secret` from the request body
6. Note the full token URL

The token endpoint pattern (based on the AFL equivalent) is:
```
POST https://supercoach.dailytelegraph.com.au/2026/api/nrl/classic/v1/access_token
```

Request body (form-encoded):
```
grant_type=password
client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}
username={YOUR_EMAIL}
password={YOUR_PASSWORD}
```

```bash
curl -s -X POST "https://supercoach.dailytelegraph.com.au/2026/api/nrl/classic/v1/access_token" \
  -d "grant_type=password" \
  -d "client_id={CLIENT_ID}" \
  -d "client_secret={CLIENT_SECRET}" \
  -d "username={YOUR_EMAIL}" \
  -d "password={YOUR_PASSWORD}" | python3 -m json.tool
```

The response contains an `access_token` value.

### Step 2 — Access the stats centre

```bash
curl -s "https://supercoach.dailytelegraph.com.au/nrl/draft/statscentre?access_token={TOKEN}" \
  -H "User-Agent: Mozilla/5.0" > statscentre.html
```

### Step 3 — Extract player data from the response

The stats centre page embeds player data in a JavaScript variable called `researchGridData`. Extract it:

```bash
# Extract the JSON data from the JavaScript variable
grep -o 'researchGridData = \[.*\];' statscentre.html | \
  sed 's/researchGridData = //' | \
  sed 's/;$//' | \
  python3 -m json.tool | head -100
```

The `researchGridData` array contains player objects with fields including:
- `fn` — first name
- `ln` — last name
- `pos` — primary position
- `pos2` — secondary position
- `team` — team
- `tpts` — total points
- `rds` — rounds played
- `pts` — round points (array)
- `avg` — average
- `avg3` — 3-round average
- `avg5` — 5-round average

### Step 4 — Find the detailed per-round breakdown

From the stats centre, look for additional AJAX endpoints in DevTools:
1. Open the stats centre page in your browser (with the access token)
2. Open DevTools → Network tab
3. Click on individual players or navigate to round views
4. Watch for XHR requests that return per-round stat breakdowns
5. These should contain the full Supercoach scoring breakdown per stat category

### Limitations

- **Authentication required:** Must have a Supercoach account and obtain OAuth2 tokens
- **Client credentials:** The `client_id` and `client_secret` are embedded in the web app JavaScript and may change between seasons
- **Rate limiting:** Unknown — be conservative with request frequency
- **Terms of service:** Automated access may violate ToS. Use for personal validation only
- **Token expiry:** Access tokens expire — you'll need to refresh them periodically
- **URL instability:** The exact endpoint paths may change between NRL seasons (note the `2026` in the URL)

### What to verify

- [ ] You can successfully obtain an OAuth2 access token
- [ ] The stats centre page loads with your token
- [ ] `researchGridData` contains player data with per-round scoring breakdowns
- [ ] The official score matches what you compute from nrlsupercoachstats.com data using the scoring formula

---

## Validation Workflow — Putting It All Together

### Step 1: Pick a test player and round

Choose a well-known player with varied stats (e.g. a halfback who kicks goals, makes tackles, and has try involvements). Example: Nathan Cleary, Round 1 2026.

### Step 2: Collect primary stats from nrl.com

Your existing adapter already does this. Get the raw stats for the test player from the nrl.com match centre:

```bash
# Fetch the match centre data for a specific match
curl -s "https://www.nrl.com/draw/data?competition=111&season=2026&round=1" \
  -H "User-Agent: NRL-Schedule-Scraper/1.0" | python3 -m json.tool
```

Then fetch the match centre detail for the specific match URL returned above, appending `data`:

```bash
curl -s "https://www.nrl.com{matchCentreUrl}data" \
  -H "User-Agent: NRL-Schedule-Scraper/1.0" | python3 -m json.tool
```

Record these 17 values from the response for your test player:
- `tries`, `tryAssists`, `conversions`, `penaltyGoals`, `conversionAttempts`
- `onePointFieldGoals`, `twoPointFieldGoals`
- `tacklesMade`, `missedTackles`, `tackleBreaks`
- `forcedDropOutKicks`, `lineBreaks`, `lineBreakAssists`
- `fortyTwentyKicks`, `twentyFortyKicks`
- `intercepts`, `kicksDead`, `penalties`, `errors`, `sinBins`, `sendOffs`
- `offloads` (combined — note this for cross-reference)
- `allRuns`, `allRunMetres` (combined — note for cross-reference)

### Step 3: Collect supplementary stats from nrlsupercoachstats.com

Using the stats table approach from Source 1 above:

1. Open `https://www.nrlsupercoachstats.com/stats.php?year=2026`
2. Filter to Round 1
3. Find your test player
4. Record: `LT, MG, MF, OL, IO, H8, HU` and note the `TS` value

### Step 4: Cross-reference offloads

Verify: `OL + IO` from nrlsupercoachstats.com should equal `offloads` from nrl.com.
If they don't match exactly, document the discrepancy — it may indicate different stat providers.

### Step 5: Cross-reference runs

Verify: `H8 + HU` from nrlsupercoachstats.com should be close to `allRuns - lineEngagedRuns` from nrl.com (the Supercoach-eligible run formula).
If they don't match, document the difference.

### Step 6: Compute the Supercoach score

Apply the formula using values from both sources:

```
SC_SCORE =
  (tries × 17) +
  (conversions + penaltyGoals) × 4 +
  (MG × -2) +
  (onePointFieldGoals × 5) +
  (twoPointFieldGoals × 10) +
  (MF × -1) +
  (tryAssists × 12) +
  (LT × 4) +                              # Last Touch / Try Contribution
  (lineBreakAssists × 8) +
  (forcedDropOutKicks × 6) +
  (fortyTwentyKicks × 10) +
  (twentyFortyKicks × 10) +
  (kicksDead × -3) +
  (OL × 4) +
  (IO × 2) +
  (tackleBreaks × 2) +
  (lineBreaks × 10) +
  (intercepts × 5) +
  (tacklesMade × 1) +
  (missedTackles × -1) +
  (H8 × 2) +
  (HU × 1) +
  (trySaves × 3) +
  (penalties × -2) +
  (errors × -2) +
  (sinBins × -8) +
  (sendOffs × -16)
```

### Step 7: Compare against published score

Compare your computed score against:
1. The `Score` column in nrlsupercoachstats.com for that player/round
2. (Optionally) The official Supercoach app score from Source 3

### Step 8: Document findings

Record any discrepancies and their likely causes:
- **Small differences (1-3 pts):** Likely due to the Try Contribution/Last Touch point value ambiguity, or additional stats like Held up in Goal (HG) or Kick & Regather Break (KB) not being in the original scoring legend
- **Large differences (5+ pts):** May indicate a missing stat category or incorrect field mapping
- **Exact match:** Confirms the formula and data sources are correct

---

## Troubleshooting

### nrlsupercoachstats.com returns HTML instead of JSON
Add the `X-Requested-With: XMLHttpRequest` header to your request. jqGrid endpoints typically check for this header to decide whether to return JSON or HTML.

### footystatistics.com API returns 403 or empty response
The API may require a `Referer` header or session cookie. Try adding:
```bash
-H "Referer: https://footystatistics.com/"
```

### Player name doesn't match across sources
Common variations to handle:
- First name abbreviation: "Nathan" vs "N."
- Middle names: "Reece Walsh" vs "Reece Adam Walsh"
- Hyphens: "Harris-Tavita" vs "Harris Tavita"
- Apostrophes: "O'Sullivan" — ensure URL encoding as `O%27Sullivan`
- Diacritics: Rare in NRL but check for Polynesian/Maori names

### Data not available for a recent round
nrlsupercoachstats.com typically updates within 24-48 hours after match completion. If stats are missing, check back later. The Score column will show 0 or be empty for unavailable rounds.
