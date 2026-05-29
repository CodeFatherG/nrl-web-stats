# UI Features

The frontend is a React 18 + Material-UI 5.x single-page application served via Cloudflare Workers Sites, built with React Router v6, TanStack Query v5 (server-state caching), and Recharts (charts).

## Navigation

The app has a responsive layout with:
- **Sidebar** (desktop/tablet): permanent 240px drawer on `lg+`, collapsed 64px icon-only on `sm–lg`, hidden on `xs`
- **Top bar**: logo, year selector (bookmarkable `?year=N` param), dark mode toggle
- **Bottom navigation** (mobile only, `xs`): 5 primary items + "More" drawer for secondary views

### Primary Navigation
| Label | Path |
|-------|------|
| Dashboard | `/` |
| Round | `/round` or `/round/{N}` |
| Teams | `/team/{CODE}` |
| Players | `/players` |
| Supercoach | `/supercoach` or `/supercoach/{N}` |

### Secondary Navigation (sidebar lower / "More" drawer on mobile)
| Label | Path |
|-------|------|
| Summary | `/summary` |
| Casualty Ward | `/casualty-ward` |
| Compare | `/compare` or `/compare/{id1,id2,...}` |
| Bye Overview | `/bye` |

## URL Routes

Every view has a shareable, bookmarkable URL. Navigating directly to any URL loads the correct view.

| URL | View | Parameters |
|-----|------|------------|
| `/` | Dashboard (season overview) | `?year=N` |
| `/round` | Round view (auto-detects current round) | `?year=N` |
| `/round/{N}` | Round N detail | `N`: round number, `?year=N` |
| `/teams` | Redirects to first team | — |
| `/team/{CODE}` | Team schedule | `CODE`: 3-letter team code |
| `/players` | Player browser | `?year=N` |
| `/player/{ID}` | Player detail | `ID`: player identifier |
| `/match/{ID}` | Match detail | `ID`: match identifier |
| `/supercoach` | Supercoach (auto-detects current round) | `?year=N` |
| `/supercoach/{N}` | Supercoach round N | `N`: round number |
| `/compare` | Player compare (empty) | — |
| `/compare/{ids}` | Compare players | `ids`: comma-separated player IDs |
| `/summary` | Player movements summary | `?year=N` |
| `/casualty-ward` | Casualty ward | — |
| `/bye` | Bye schedule overview | `?year=N` |

## Dark Mode

Toggle between light and dark themes via the button in the top bar. Preference is persisted in `localStorage` across sessions.

## Year Selection

A year selector in the top bar changes the active season. Selecting a year updates the `?year=N` URL parameter and refetches all data for that year via React Query's cache.

## Dashboard View (`/`)

**Purpose**: Season-level overview — current round status, key stats, and the compact season grid.

**Features**:
- Current round hero card (most recent incomplete or in-progress round)
- Season stat strip (rounds played, total rounds, matches played)
- Player movements alert (links to `/summary` if movements detected)
- Full season compact grid — click any round to open `/round/{N}`; click any match to open `/match/{ID}`

## Round View (`/round/{N}`)

**Purpose**: Detailed view of a single round's matches.

**Features**:
- Round stepper (prev/next round arrows)
- Grid of match cards (responsive: 1 column mobile, 2 sm, 3 md)
- Each card shows teams, score/time, strength badges, weather, and outlook label
- Bye teams listed below matches
- Auto-redirects `/round` → `/round/{current}` on load

## Team View (`/team/{CODE}`)

**Purpose**: A single team's complete season schedule with filters.

**Features**:
- Team selector chip grid (click to switch team)
- Form sparkline + classification label
- Round range and venue (H/A/All) filter controls
- Sortable schedule table: Round, Opponent, H/A, Strength, Date, Stadium, Result
- Mobile: hides stadium, date, H/A columns via `hideOnMobile`

## Match Detail View (`/match/{ID}`)

**Purpose**: Full detail for a single match.

**Features**:
- Match hero (teams, score or kickoff time, strength badges)
- Stadium, weather
- Tabs: Overview | Home Stats | Away Stats | Team Lists
- Stats tabs: sortable player stats table, card mode on mobile
- Team lists: home and away lineups with jersey numbers and positions, click player → `/player/{ID}`

## Players View (`/players`)

**Purpose**: Browse all players' season statistics.

**Features**:
- Toggle between table and card views
- Search by name, filter by team, filter by position
- Table: sortable columns (SC Avg, Games, Tries, Run Metres, etc.)
- Card mode: compact player cards showing team color accent
- Injured players flagged with InjuryStatusChip (cross-referenced with Casualty Ward)

## Player Detail View (`/player/{ID}`)

**Purpose**: Full stats and history for a single player.

**Features**:
- Profile header with team, position, SC average chips
- "Compare" button pre-fills `/compare/{id}` with this player
- Stat snapshot grid (SC average, total, games, projected/floor/ceiling)
- Tabs: Supercoach | Projections | Injury History
  - **Supercoach**: score bar chart + per-round table
  - **Projections**: floor/ceiling/projected cards, spike band chart
  - **Injury History**: table of historical casualty ward entries

## Supercoach View (`/supercoach/{N}`)

**Purpose**: Supercoach scores for a given round, filterable by team.

**Features**:
- Round stepper (prev/next)
- Team filter chips (horizontal scrollable)
- Incomplete round warning if round not yet finished
- Sortable table: Player, Team, SC total, category breakdown (Scoring, Create, Evade, Base, Defence, Negative)
- Click player row → `/player/{ID}`
- Auto-redirects `/supercoach` → `/supercoach/{current}` on load

## Compare View (`/compare/{ids}`)

**Purpose**: Side-by-side comparison of up to 4 players.

**Features**:
- Player search autocomplete (excludes already-selected players)
- Player chips with remove button
- Stat card strip (SC average per player)
- Tabs: Overview (Radar chart for 6-axis stat comparison) | Scores (SC trend bar charts) | Projections (floor/ceiling/projected)
- URL encodes player IDs as comma-separated: `/compare/123,456`
- Add/remove updates URL with `navigate()`

## Summary View (`/summary`)

**Purpose**: Weekly Supercoach decision dashboard for the current round — at-a-glance Game Strength Ratings, top/bottom break-evens, contextual top scorers and top captains, plus the existing player movements between the last two rounds.

**Features**:
- **Round matches card** — compact `MatchCard` grid showing every match in the current round with home/away GSR badges colourised by the `GSRBadge` palette (dark green → dark red across `normalizedOverallGSR`). Clicking a card opens `/match/{ID}`. Sourced from `useRoundQuery` + `useGameStrengthQuery`.
- **Dashboard tiles** — responsive 2×2 grid (`Grid xs={12} md={6}`):
  - Top 10 Projected Scorers (contextual: opponent + venue applied via the precomputed contextual profile)
  - Top 10 Projected Captains (same context, captaincy-mode candidate pool)
  - Top 10 Break Evens (highest BE — the players that need the biggest score to hold or grow)
  - Bottom 10 Break Evens (lowest BE — typical trade targets)
  - Rows are team-coloured via `getTeamBackground` and link to `/player/{ID}`. Sourced from `useRoundDashboardQuery` → `GET /api/supercoach/:year/round/:round/dashboard`. While the artifact is computing, the section shows a "being computed — check back shortly" alert.
- **Player Movements section** (below the tiles, unchanged): Injured, Dropped to Reserve, Benched (Starter→Interchange), Returning from Injury, Covering Injury, Promoted, Position Changed.
  - Mobile: chip list per section; desktop: DataTable per section
  - "Hide interchange promotions" checkbox in the Promoted section
  - Branches on `data.available` from the discriminated `/api/player-movements` response (spec 035).

## Casualty Ward (`/casualty-ward`)

**Purpose**: All currently injured players grouped by expected return timeline.

**Features**:
- Groups ordered numerically (Round N → TBC → Indefinite → Next Season → Other)
- Table per group: player name (links to `/player/{ID}`), team chip, injury, since date
- Total count in page header

## Bye Overview (`/bye`)

**Purpose**: Visualise bye week distribution across all teams.

**Features**:
- Toggle between grid view (full team × round matrix) and list view (per-round bye teams)
- Round range slider to filter visible rounds
- Grid: click team row or round column to highlight; bye concentration colour-coded
- List: shows each round's bye teams as chips
- Significant bye stats below (rounds with >2 byes)

## Shared Components

| Component | Purpose |
|-----------|---------|
| `PageHeader` | Title, subtitle, actions slot |
| `SectionCard` | Paper container with optional title/divider/actions |
| `StatCard` | Key metric display (label, value, optional trend) |
| `DataTable<T>` | Generic responsive table: sticky col, group headers, sort, card mode |
| `SkeletonPage` | Loading skeletons: `table`, `cards`, `match-list`, `player-header` |
| `MatchCard` | Match summary card with team accent, score, badges |
| `PlayerCard` | Player grid card for Players view |
| `TeamListPanel` | Two-column home/away team lists |
| `InjuryStatusChip` | Injured/recovering/available chip |
| `ScoreBarChart` | Recharts bar chart of SC scores per round + average line |
| `RadarChart` | Recharts radar chart for multi-player stat comparison |
| `SpikeBandChart` | CSS flex stacked band chart for spike distributions |
| `StrengthBadge` | Coloured chip for legacy strength rating (low/medium/high) |
| `GSRBadge` | Coloured chip for Game Strength Rating (1.0 = league avg). Displayed beside `StrengthBadge` in Round View, Match Detail View, and Team View for side-by-side comparison during the transition from legacy strength ratings. |
