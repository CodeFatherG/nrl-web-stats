# UI Features

The frontend is a React 18 + Material-UI 5.x single-page application served via Cloudflare Workers Sites.

## Navigation

The app has a top navigation bar showing "NRL Schedule Dashboard" and the loaded season years. Five main tabs control the primary view:

- **Round Overview** — view matches by round (detailed or compact mode)
- **Team Schedule** — view a single team's full season
- **Bye Overview** — grid of bye schedules across all teams
- **Players** — browse all players' season statistics with sortable, searchable summary table
- **Supercoach** — view computed Supercoach scores per round

When in the Round Overview tab, toggle buttons switch between **Detailed** (single round list) and **Compact** (9×3 season grid) modes.

Clicking any match from any view opens the **Match Detail View**, which replaces the tab content with a back button to return.

## URL Routes

Every view has a shareable, bookmarkable URL. Navigating directly to any URL loads the correct view with all data.

| URL | View | Parameters |
|-----|------|------------|
| `/` | Season Overview (compact round grid) | None |
| `/round/{N}` | Round Overview (detailed mode) | `N`: round number, integer 1–27 |
| `/team/{CODE}` | Team Schedule | `CODE`: 3-letter team code (case-insensitive), e.g., `BRO`, `MEL`, `SYD` |
| `/bye` | Bye Overview | None |
| `/match/{ID}` | Match Detail | `ID`: match identifier string |
| `/players` | Players Season Summary | None |
| `/player/{ID}` | Player Detail | `ID`: player identifier string |
| `/supercoach` | Supercoach Scores (latest round) | None |
| `/supercoach/{N}` | Supercoach Scores for round N | `N`: round number, integer 1–27 |

**URL synchronisation**: All navigation actions (clicking tabs, selecting a team or round, opening a match) update the browser URL. Browser back/forward buttons navigate through view history correctly.

**Invalid URLs**: Unrecognised paths show an inline error with a link to the Season Overview. Specific errors are shown for invalid team codes (with a list of valid codes) and out-of-range round numbers.

## Team Schedule View

**Purpose**: View a single team's complete season schedule with difficulty ratings and streak analysis.

**How to access**: Select the **Team Schedule** tab, or navigate directly to `/team/{CODE}` (e.g., `/team/BRO` for Brisbane Broncos).

**How to use**:
1. Select a team from the dropdown selector (or use a direct URL)
2. The view loads the team's schedule, streak analysis, and form trajectory

**What you see**:
- **Summary card**: Team name with inline form sparkline (trend line), total fixtures, bye count, total schedule strength, average strength per match, rank among all teams (e.g., "Rank: 5/16"), strength category badge, and bye round chips
- **Filter controls**: Round range slider (1–27) and venue toggle (All/Home/Away)
- **Fixture table**: Round, date, opponent, venue (Home/Away badge), stadium, strength rating badge (colour-coded: green=easy, amber=medium, red=hard), result (W/L/D with score), weather. Streak column shows "Soft Draw" (green) or "Rough Patch" (red) labels spanning multiple rows

**Interactions**:
- Filter by round range or venue type
- Click any non-bye match row to open Match Detail View
- Bye rows shown with reduced opacity and no click action

## Round Overview View (Detailed Mode)

**Purpose**: View all matches in a single round with outlook predictions.

**How to access**: Select the **Round Overview** tab in Detailed mode, or navigate directly to `/round/{N}` (e.g., `/round/5`).

**How to use**:
1. Choose a round from the dropdown (1–27), or use a direct URL
2. Ensure **Detailed** mode is selected (list icon)

**What you see**:
- **Round header**: "Round X — YYYY Season" with match count
- **Match cards grid** (3 columns): Each card shows date/time, stadium, home team with strength badge, "vs" divider, away team with strength badge, score (if completed), weather, and outlook badge (Easy/Competitive/Tough/Upset Alert with tooltip showing composite score)
- **Bye teams list**: All teams with byes shown as chips at the bottom

**Interactions**:
- Change round via dropdown
- Click any match card to open Match Detail View

## Compact Season View (Compact Mode)

**Purpose**: See the entire season at a glance in a 9×3 grid (27 rounds).

**How to access**: Navigate to `/` (home), or select the **Round Overview** tab and switch to **Compact** mode (grid icon).

**What you see**:
- **9×3 grid**: Each cell represents one round (R1–R27)
- **Per cell**: Round number header, then compact match entries showing home strength badge, team abbreviations (e.g., "BRO v MEL"), and away strength badge
- Strength badges are colour-coded using the same green/amber/red scheme

**Interactions**:
- Click a round cell to switch to detailed view for that round
- Click a specific match within a cell to open Match Detail View

## Bye Overview View

**Purpose**: Visualise bye distribution across all teams and rounds to identify scheduling patterns.

**How to access**: Select the **Bye Overview** tab, or navigate directly to `/bye`.

**How to use**:
1. Optionally adjust the round range slider to focus on a specific part of the season

**What you see**:
- **Round range filter**: Slider with markers at rounds 1, 14, 27
- **Bye grid table**: Rows = 17 teams (sorted alphabetically), Columns = rounds (filtered by slider). Bye cells show a "no entry" indicator. Column headers colour-coded by bye concentration (light to dark blue — more byes = darker). Row headers coloured by strength effect
- **Significant bye statistics**: Table showing only rounds with >2 byes. Two rows per round: "Affected Teams" (red, teams with byes) and "Unaffected Teams" (green, teams playing). Team codes shown as clickable chips

**Interactions**:
- Click a team name (row header) to highlight all their byes across the season (green highlight)
- Click a round number (column header) to highlight all byes in that round
- Highlighting is mutually exclusive — only one row OR one column highlighted at a time
- Click team chips in the statistics table to highlight across both tables
- Clear Filters resets range and clears all highlights

## Match Detail View

**Purpose**: View full match information including player statistics for both teams.

**How to access**: Click any match from Team Schedule View, Round Overview, or Compact Season View. Or navigate directly to `/match/{ID}`.

**What you see**:
- **Back button**: Returns to the previous view
- **Match header**: Round and year, outlook badge (if available), "Match In Progress" warning (if applicable)
- **Teams display**: Home team (left) and away team (right) with strength rating badges. Score displayed in centre if match is completed, or "vs" if not started
- **Match info**: Formatted date/time, stadium name, weather conditions
- **Player statistics** (only for completed/in-progress matches): Two tables (one per team) with 45+ stat columns organised into grouped categories:
  - **Player**: Name (sticky column), Position, Minutes, Stint One
  - **Scoring**: Tries, Try Assists, Goals, Conversions, Points, Field Goals
  - **Running**: All Runs, Run Metres, Hit Ups, Line Breaks, Offloads, Post-Contact Metres
  - **Passing**: Receipts, Passes, Dummy Half Runs, Pass-to-Run Ratio
  - **Defence**: Tackles, Missed Tackles, Tackle Efficiency, Intercepts, One-on-One stats
  - **Kicking**: Kicks, Kick Metres, Bombs, Grubbers, 40/20s, 20/40s
  - **Discipline**: Errors, Handling Errors, Penalties, Sin Bins, Send Offs

**Interactions**:
- Click any column header to sort the table ascending/descending (default: sorted by minutes played)
- Scroll horizontally to see all stat columns (player name column stays sticky on the left)
- Click a player name to navigate to their Player Detail page
- Click "Back to overview" to return to the previous view

## Players Summary View

**Purpose**: Browse all players' aggregated season statistics in a sortable, searchable, filterable table.

**How to access**: Select the **Players** tab in the main navigation bar, or navigate directly to `/players`.

**Components**:
- `PlayersSummaryView` in `client/src/views/PlayersSummaryView.tsx`

**What you see**:
- **Search field**: Text input to filter players by name (case-insensitive substring match)
- **Team filter**: Dropdown to show only players from a specific team ("All Teams" to clear)
- **Position filter**: Dropdown to show only players at a specific position ("All Positions" to clear), dynamically populated from the current player data
- **Player count**: Shows total number of matching players
- **Summary table**: Columns — Player Name (clickable, sticky left), Team, Position, Games Played, Tries, Run Metres, Tackles, Points, Avg Fantasy Points, Tackle Breaks, Line Breaks
- **Loading spinner**: Shown while data is being fetched
- **Empty state**: Message when no players match the current filters

**Interactions**:
- Type in the search field to filter by player name
- Select a team from the dropdown to filter by team
- Select a position from the dropdown to filter by position
- All three filters combine (name AND team AND position)
- Click any column header to sort ascending/descending (default: average fantasy points, descending)
- Click a player name to navigate to their Player Detail page

## Player Detail View

**Purpose**: View a player's round-by-round performance breakdown for the current season, with totals and averages.

**How to access**: Click a player name from the Players Summary View or from the Match Detail View player stats table. Or navigate directly to `/player/{ID}`.

**Components**:
- `PlayerDetailView` in `client/src/views/PlayerDetailView.tsx`

**What you see**:
- **Back button**: Returns to the previous view
- **Player header**: Player name (h4), team name chip, position chip, season label with games played count
- **Season totals**: Summary line showing total tries, run metres, tackles, goals, and fantasy points
- **Round-by-round table**: One row per match performance with columns grouped by category — Match, Scoring, Running, Passing, Defence, Kicking, Discipline, and Supercoach. The Supercoach group includes supplementary stats (LT, MG, MF, eOL, iOL, R8+, R8-, KB, HG) plus **Price** (formatted as currency, e.g., "$523,400") and **Break Even** (signed integer). Null values display as "—".
- **Totals row** (blue background): Sums of all numeric columns (Price and Break Even excluded from totals/averages)
- **Averages row** (green background, italic): Per-game averages (totals / games played)
- **Incomplete match indicator**: Rows for incomplete matches shown with reduced opacity (0.6) and a warning icon with tooltip "Partial data — stats may be incomplete"
- **Player not found**: When navigating to a non-existent player ID, shows "Player not found" with a link back to the Players tab

**Interactions**:
- Click "Back" to return to the previous view (uses browser history, falls back to `/players`)

## Supercoach View

**Purpose**: Display computed Supercoach scores per round, showing category breakdowns and player trends.

**How to access**: Select the **Supercoach** tab in the main navigation bar, or navigate directly to `/supercoach` or `/supercoach/:round`.

**URL Routes**:

| URL | View | Parameters |
|-----|------|------------|
| `/supercoach` | Supercoach round scores (defaults to latest round) | None |
| `/supercoach/{N}` | Supercoach scores for round N | `N`: round number, integer 1–27 |

**Components**:
- `SupercoachScoreTable` in `client/src/components/`
- `CategoryBreakdown` in `client/src/components/`
- `ScoreTrendChart` in `client/src/components/`
- `SupercoachView` in `client/src/views/SupercoachView.tsx`

**How to use**:
1. Select a round from the round selector (1–27)
2. Optionally filter by team using the team filter dropdown
3. Click any player row to open the detail panel

**What you see**:
- **Round selector**: Dropdown or stepper to navigate between rounds 1–27
- **Team filter**: Dropdown to filter the score table to a single team
- **Score table** (`SupercoachScoreTable`): All players for the selected round with columns for player name, team, total Supercoach score, and per-category scores (Scoring, Create, Evade, Base, Defence, Negative). Validation warnings shown as icons next to affected player rows.

**Detail panel** (opens on player click):
- **Category breakdown** (`CategoryBreakdown`): 6 accordion sections (one per scoring category) showing individual stat contributions within each category — stat name, raw value, points-per-unit, and calculated points
- **Season trend chart** (`ScoreTrendChart`): Bar chart showing the player's total Supercoach score per round across the season, with season average line overlay
- **Validation warnings**: Any data quality warnings for this player (offload mismatch, run count mismatch, score difference vs published)

**Interactions**:
- Change round via round selector
- Filter by team via dropdown
- Click a player row to open/close the detail panel
- Expand/collapse individual category accordions in the detail panel

## Visual Language

- **Strength badges**: Green = easy, Amber = medium, Red = hard (based on p33/p67 percentile thresholds)
- **Outlook badges**: Green = Easy, Amber = Competitive, Red = Tough, Purple = Upset Alert
- **Form sparkline**: Inline SVG trend line — green (trending up), red (trending down), grey (stable)
- **Results**: Green = Win, Red = Loss, Grey = Draw
- **Streak labels**: Green background = Soft Draw (favourable stretch), Red background = Rough Patch (difficult stretch)
