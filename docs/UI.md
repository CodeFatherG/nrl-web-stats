# UI Features

The frontend is a React 18 + Material-UI 5.x single-page application served via Cloudflare Workers Sites.

## Navigation

The app has a top navigation bar showing "NRL Schedule Dashboard" and the loaded season years. Three main tabs control the primary view:

- **Round Overview** — view matches by round (detailed or compact mode)
- **Team Schedule** — view a single team's full season
- **Bye Overview** — grid of bye schedules across all teams

When in the Round Overview tab, toggle buttons switch between **Detailed** (single round list) and **Compact** (9×3 season grid) modes.

Clicking any match from any view opens the **Match Detail View**, which replaces the tab content with a back button to return.

## Team Schedule View

**Purpose**: View a single team's complete season schedule with difficulty ratings and streak analysis.

**How to use**:
1. Select the **Team Schedule** tab
2. Choose a team from the dropdown selector
3. The view loads the team's schedule, streak analysis, and form trajectory

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

**How to use**:
1. Select the **Round Overview** tab
2. Ensure **Detailed** mode is selected (list icon)
3. Choose a round from the dropdown (1–27)

**What you see**:
- **Round header**: "Round X — YYYY Season" with match count
- **Match cards grid** (3 columns): Each card shows date/time, stadium, home team with strength badge, "vs" divider, away team with strength badge, score (if completed), weather, and outlook badge (Easy/Competitive/Tough/Upset Alert with tooltip showing composite score)
- **Bye teams list**: All teams with byes shown as chips at the bottom

**Interactions**:
- Change round via dropdown
- Click any match card to open Match Detail View

## Compact Season View (Compact Mode)

**Purpose**: See the entire season at a glance in a 9×3 grid (27 rounds).

**How to use**:
1. Select the **Round Overview** tab
2. Switch to **Compact** mode (grid icon)

**What you see**:
- **9×3 grid**: Each cell represents one round (R1–R27)
- **Per cell**: Round number header, then compact match entries showing home strength badge, team abbreviations (e.g., "BRO v MEL"), and away strength badge
- Strength badges are colour-coded using the same green/amber/red scheme

**Interactions**:
- Click a round cell to switch to detailed view for that round
- Click a specific match within a cell to open Match Detail View

## Bye Overview View

**Purpose**: Visualise bye distribution across all teams and rounds to identify scheduling patterns.

**How to use**:
1. Select the **Bye Overview** tab
2. Optionally adjust the round range slider to focus on a specific part of the season

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

**How to access**: Click any match from Team Schedule View, Round Overview, or Compact Season View.

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
- Click "Back to overview" to return to the previous view

## Visual Language

- **Strength badges**: Green = easy, Amber = medium, Red = hard (based on p33/p67 percentile thresholds)
- **Outlook badges**: Green = Easy, Amber = Competitive, Red = Tough, Purple = Upset Alert
- **Form sparkline**: Inline SVG trend line — green (trending up), red (trending down), grey (stable)
- **Results**: Green = Win, Red = Loss, Grey = Draw
- **Streak labels**: Green background = Soft Draw (favourable stretch), Red background = Rough Patch (difficult stretch)
