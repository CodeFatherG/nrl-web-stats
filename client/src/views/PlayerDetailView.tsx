import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip,
  Link,
  Tabs,
  Tab,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  getPlayer,
  getPlayerInjuryHistory,
  getPlayerSupercoachSeason,
  getPlayerSupercoachProjection,
} from '../services/api';
import type {
  CasualtyWardEntry,
  PlayerSeasonSupercoachResponse,
  PlayerMatchSupercoach,
  PlayerProjectionResponse,
  SpikeBand,
} from '../services/api';
import { buildPlayersUrl, buildCompareUrl, parseUrl } from '../utils/routes';
import type { PlayerDetailResponse, PlayerPerformanceDetail, Team } from '../types';

interface PlayerDetailViewProps {
  playerId: string;
  onBack: () => void;
  onNavigate?: (url: string) => void;
  teams: Team[];
  year: number;
}

// --- Column definitions ---

interface ColumnDef {
  key: string;
  label: string;
  align?: 'left' | 'right';
  group?: string;
  tip?: string;
  format?: (v: number) => string;
}

const fmt0 = (v: number) => Math.round(v).toString();
const fmt1 = (v: number) => v.toFixed(1);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtSecToMin = (v: number) => `${(v / 60).toFixed(1)}`;

const COLUMNS: ColumnDef[] = [
  // Context — __sc injected here so it sits next to round context
  { key: 'round', label: 'Rd', align: 'right', group: 'Match', tip: 'Round' },
  { key: 'opponentTeamCode', label: 'Opp', align: 'left', group: 'Match', tip: 'Opponent' },
  { key: '__sc', label: 'SC', align: 'right', group: 'Match', tip: 'Supercoach Score' },
  { key: 'minutesPlayed', label: 'Mins', group: 'Match' },
  { key: 'stintOne', label: 'S1', group: 'Match', tip: 'Stint One', format: fmtSecToMin },

  // Scoring
  { key: 'tries', label: 'T', group: 'Scoring', tip: 'Tries' },
  { key: 'tryAssists', label: 'TA', group: 'Scoring', tip: 'Try Assists' },
  { key: 'goals', label: 'G', group: 'Scoring', tip: 'Goals' },
  { key: 'conversions', label: 'Con', group: 'Scoring', tip: 'Conversions' },
  { key: 'conversionAttempts', label: 'CA', group: 'Scoring', tip: 'Conversion Attempts' },
  { key: 'goalConversionRate', label: 'GC%', group: 'Scoring', format: fmtPct, tip: 'Goal Conversion Rate' },
  { key: 'penaltyGoals', label: 'PG', group: 'Scoring', tip: 'Penalty Goals' },
  { key: 'fieldGoals', label: 'FG', group: 'Scoring', tip: 'Field Goals' },
  { key: 'onePointFieldGoals', label: '1FG', group: 'Scoring', tip: 'One Point Field Goals' },
  { key: 'twoPointFieldGoals', label: '2FG', group: 'Scoring', tip: 'Two Point Field Goals' },
  { key: 'points', label: 'Pts', group: 'Scoring', tip: 'Points' },

  // Running
  { key: 'allRuns', label: 'Runs', group: 'Running', tip: 'All Runs' },
  { key: 'allRunMetres', label: 'Run m', group: 'Running', format: fmt0, tip: 'All Run Metres' },
  { key: 'hitUps', label: 'HU', group: 'Running', tip: 'Hit Ups' },
  { key: 'hitUpRunMetres', label: 'HU m', group: 'Running', format: fmt0, tip: 'Hit Up Run Metres' },
  { key: 'lineEngagedRuns', label: 'LE', group: 'Running', tip: 'Line Engaged Runs' },
  { key: 'postContactMetres', label: 'PCM', group: 'Running', format: fmt0, tip: 'Post Contact Metres' },
  { key: 'lineBreaks', label: 'LB', group: 'Running', tip: 'Line Breaks' },
  { key: 'lineBreakAssists', label: 'LBA', group: 'Running', tip: 'Line Break Assists' },
  { key: 'tackleBreaks', label: 'TB', group: 'Running', tip: 'Tackle Breaks' },
  { key: 'offloads', label: 'Off', group: 'Running', tip: 'Offloads' },
  { key: 'playTheBallTotal', label: 'PTB', group: 'Running', tip: 'Play The Ball Total' },
  { key: 'playTheBallAverageSpeed', label: 'PTBs', group: 'Running', format: fmt1, tip: 'Play The Ball Average Speed' },

  // Passing
  { key: 'receipts', label: 'Rec', group: 'Passing', tip: 'Receipts' },
  { key: 'passes', label: 'Pass', group: 'Passing', tip: 'Passes' },
  { key: 'passesToRunRatio', label: 'P/R', group: 'Passing', format: fmt1, tip: 'Passes to Run Ratio' },
  { key: 'dummyHalfRuns', label: 'DHR', group: 'Passing', tip: 'Dummy Half Runs' },
  { key: 'dummyHalfRunMetres', label: 'DHm', group: 'Passing', format: fmt0, tip: 'Dummy Half Run Metres' },
  { key: 'dummyPasses', label: 'DHP', group: 'Passing', tip: 'Dummy Passes' },

  // Defence
  { key: 'tacklesMade', label: 'TK', group: 'Defence', tip: 'Tackles Made' },
  { key: 'missedTackles', label: 'MT', group: 'Defence', tip: 'Missed Tackles' },
  { key: 'ineffectiveTackles', label: 'IT', group: 'Defence', tip: 'Ineffective Tackles' },
  { key: 'tackleEfficiency', label: 'TE%', group: 'Defence', format: fmtPct, tip: 'Tackle Efficiency' },
  { key: 'intercepts', label: 'Int', group: 'Defence', tip: 'Intercepts' },
  { key: 'oneOnOneSteal', label: '1v1W', group: 'Defence', tip: 'One on One Steal' },
  { key: 'oneOnOneLost', label: '1v1L', group: 'Defence', tip: 'One on One Lost' },

  // Kicking
  { key: 'kicks', label: 'K', group: 'Kicking', tip: 'Kicks' },
  { key: 'kickMetres', label: 'Km', group: 'Kicking', format: fmt0, tip: 'Kick Metres' },
  { key: 'kickReturnMetres', label: 'KRm', group: 'Kicking', format: fmt0, tip: 'Kick Return Metres' },
  { key: 'kicksDefused', label: 'KDef', group: 'Kicking', tip: 'Kicks Defused' },
  { key: 'kicksDead', label: 'KDd', group: 'Kicking', tip: 'Kicks Dead' },
  { key: 'bombKicks', label: 'Bomb', group: 'Kicking', tip: 'Bomb Kicks' },
  { key: 'grubberKicks', label: 'Grub', group: 'Kicking', tip: 'Grubber Kicks' },
  { key: 'crossFieldKicks', label: 'XFK', group: 'Kicking', tip: 'Cross Field Kicks' },
  { key: 'forcedDropOutKicks', label: 'FDO', group: 'Kicking', tip: 'Forced Drop Out Kicks' },
  { key: 'fortyTwentyKicks', label: '40/20', group: 'Kicking', tip: '40/20 Kicks' },
  { key: 'twentyFortyKicks', label: '20/40', group: 'Kicking', tip: '20/40 Kicks' },

  // Errors & Discipline
  { key: 'errors', label: 'E', group: 'Discipline', tip: 'Errors' },
  { key: 'handlingErrors', label: 'HE', group: 'Discipline', tip: 'Handling Errors' },
  { key: 'penalties', label: 'Pen', group: 'Discipline', tip: 'Penalties' },
  { key: 'ruckInfringements', label: 'RI', group: 'Discipline', tip: 'Ruck Infringements' },
  { key: 'offsideWithinTenMetres', label: 'OS10', group: 'Discipline', tip: 'Offside Within Ten Metres' },
  { key: 'onReport', label: 'Rep', group: 'Discipline', tip: 'On Report' },
  { key: 'sinBins', label: 'SB', group: 'Discipline', tip: 'Sin Bins' },
  { key: 'sendOffs', label: 'SO', group: 'Discipline', tip: 'Send Offs' },

  // Supercoach supplementary stats
  { key: 'price', label: 'Price', group: 'Supercoach', tip: 'Player Price', format: (v: number) => `$${v.toLocaleString()}` },
  { key: 'breakEven', label: 'BE', group: 'Supercoach', tip: 'Break Even' },
  { key: 'lastTouch', label: 'LT', group: 'Supercoach', tip: 'Last Touch' },
  { key: 'missedGoals', label: 'MG', group: 'Supercoach', tip: 'Missed Goals' },
  { key: 'missedFieldGoals', label: 'MF', group: 'Supercoach', tip: 'Missed Field Goals' },
  { key: 'effectiveOffloads', label: 'eOL', group: 'Supercoach', tip: 'Effective Offloads' },
  { key: 'ineffectiveOffloads', label: 'iOL', group: 'Supercoach', tip: 'Ineffective Offloads' },
  { key: 'runsOver8m', label: 'R8+', group: 'Supercoach', tip: 'Runs Over 8m' },
  { key: 'runsUnder8m', label: 'R8-', group: 'Supercoach', tip: 'Runs Under 8m' },
  { key: 'kickRegatherBreak', label: 'KB', group: 'Supercoach', tip: 'Kick Regather Break' },
  { key: 'heldUpInGoal', label: 'HG', group: 'Supercoach', tip: 'Held Up In Goal' },
];

const SUMMABLE_KEYS = COLUMNS
  .filter(c => c.key !== 'round' && c.key !== 'opponentTeamCode' && c.key !== '__sc' &&
    c.key !== 'goalConversionRate' && c.key !== 'tackleEfficiency' &&
    c.key !== 'passesToRunRatio' && c.key !== 'playTheBallAverageSpeed' &&
    c.key !== 'price' && c.key !== 'breakEven')
  .map(c => c.key);

function getGroupHeaders(): Array<{ label: string; span: number }> {
  const groups: Array<{ label: string; span: number }> = [];
  let current: string | undefined;
  for (const col of COLUMNS) {
    const g = col.group ?? '';
    const last = groups[groups.length - 1];
    if (g === current && last) {
      last.span++;
    } else {
      groups.push({ label: g, span: 1 });
      current = g;
    }
  }
  return groups;
}

const GROUP_HEADERS = getGroupHeaders();
const cellSx = { whiteSpace: 'nowrap', px: 0.75, py: 0.25, fontSize: '0.75rem' } as const;
const headerCellSx = { ...cellSx, color: 'white', fontWeight: 600 } as const;

// --- Position-aware key stats ---

interface KeyStat {
  label: string;
  key: string;
  showAvg: boolean;
  format?: (v: number) => string;
  negative?: boolean;
}

const FORWARD_STATS: KeyStat[] = [
  { label: 'Run Metres', key: 'allRunMetres', showAvg: true, format: fmt0 },
  { label: 'Hit Ups', key: 'hitUps', showAvg: true, format: fmt1 },
  { label: 'Post Contact M', key: 'postContactMetres', showAvg: true, format: fmt0 },
  { label: 'Tackles', key: 'tacklesMade', showAvg: true, format: fmt1 },
  { label: 'Tackle Breaks', key: 'tackleBreaks', showAvg: false },
  { label: 'Errors', key: 'errors', showAvg: false, negative: true },
];

const HOOKER_STATS: KeyStat[] = [
  { label: 'Run Metres', key: 'allRunMetres', showAvg: true, format: fmt0 },
  { label: 'Dummy Half Runs', key: 'dummyHalfRuns', showAvg: true, format: fmt1 },
  { label: 'Try Assists', key: 'tryAssists', showAvg: false },
  { label: 'Tackles', key: 'tacklesMade', showAvg: true, format: fmt1 },
  { label: 'Passes', key: 'passes', showAvg: true, format: fmt1 },
  { label: 'Errors', key: 'errors', showAvg: false, negative: true },
];

const PLAYMAKER_STATS: KeyStat[] = [
  { label: 'Try Assists', key: 'tryAssists', showAvg: false },
  { label: 'Tries', key: 'tries', showAvg: false },
  { label: 'Line Breaks', key: 'lineBreaks', showAvg: false },
  { label: 'Kick Metres', key: 'kickMetres', showAvg: true, format: fmt0 },
  { label: 'Kicks', key: 'kicks', showAvg: true, format: fmt1 },
  { label: 'Errors', key: 'errors', showAvg: false, negative: true },
];

const BACK_STATS: KeyStat[] = [
  { label: 'Tries', key: 'tries', showAvg: false },
  { label: 'Try Assists', key: 'tryAssists', showAvg: false },
  { label: 'Run Metres', key: 'allRunMetres', showAvg: true, format: fmt0 },
  { label: 'Line Breaks', key: 'lineBreaks', showAvg: false },
  { label: 'Tackle Breaks', key: 'tackleBreaks', showAvg: false },
  { label: 'Tackles', key: 'tacklesMade', showAvg: true, format: fmt1 },
];

function getKeyStats(position: string): KeyStat[] {
  const pos = position.toLowerCase();
  if (pos.includes('hooker')) return HOOKER_STATS;
  if (pos.includes('prop') || pos.includes('lock') || pos.includes('second row')) return FORWARD_STATS;
  if (pos.includes('half') || pos.includes('five-eighth') || pos.includes('five eighth')) return PLAYMAKER_STATS;
  if (pos.includes('centre') || pos.includes('center') || pos.includes('wing') || pos.includes('fullback')) return BACK_STATS;
  return FORWARD_STATS;
}

// --- SC Sparkline ---

function ScoreSparkline({ matches, average }: { matches: PlayerMatchSupercoach[]; average: number }) {
  if (matches.length < 2) return null;
  const W = 260, H = 48;
  const px = 6, py = 6;
  const scores = matches.map(m => m.totalScore);
  const minVal = Math.min(0, ...scores);
  const maxVal = Math.max(...scores, average * 1.05);
  const range = maxVal - minVal || 1;
  const toX = (i: number) => px + (i / (matches.length - 1)) * (W - px * 2);
  const toY = (v: number) => H - py - ((v - minVal) / range) * (H - py * 2);
  const pathD = matches.map((m, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(m.totalScore).toFixed(1)}`).join(' ');
  const avgY = toY(average);
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={px} y1={avgY} x2={W - px} y2={avgY} stroke="#bdbdbd" strokeWidth={1} strokeDasharray="3,2" />
      <path d={pathD} fill="none" stroke="#1976d2" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {matches.map((m, i) => (
        <circle key={i} cx={toX(i)} cy={toY(m.totalScore)} r={3}
          fill={m.totalScore >= average ? '#388e3c' : '#d32f2f'}>
          <title>Rd {m.round}: {Math.round(m.totalScore)} pts</title>
        </circle>
      ))}
    </svg>
  );
}

// --- Spike distribution band config ---

const SPIKE_BANDS: Array<{ key: SpikeBand; label: string; color: string }> = [
  { key: 'negative', label: 'Neg',  color: '#d32f2f' },
  { key: 'nil',      label: 'Nil',  color: '#f57c00' },
  { key: 'low',      label: 'Low',  color: '#fbc02d' },
  { key: 'moderate', label: 'Mod',  color: '#7cb342' },
  { key: 'high',     label: 'High', color: '#388e3c' },
  { key: 'boom',     label: 'Boom', color: '#1565c0' },
];

type ViewTab = 'overview' | 'stats' | 'supercoach' | 'injuries';

export function PlayerDetailView({ playerId, onBack, onNavigate, teams, year }: PlayerDetailViewProps) {
  const [player, setPlayer] = useState<PlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [injuries, setInjuries] = useState<CasualtyWardEntry[]>([]);
  const [scData, setScData] = useState<PlayerSeasonSupercoachResponse | null>(null);
  const [projection, setProjection] = useState<PlayerProjectionResponse | null>(null);
  const [activeView, setActiveView] = useState<ViewTab>('overview');

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.code, t.name);
    return map;
  }, [teams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setScData(null);
    setProjection(null);
    setActiveView('overview');

    Promise.all([
      getPlayer(playerId),
      getPlayerInjuryHistory(playerId).catch(() => ({ entries: [] as CasualtyWardEntry[] })),
      getPlayerSupercoachSeason(year, playerId).catch(() => null),
      getPlayerSupercoachProjection(year, playerId).catch(() => null),
    ])
      .then(([data, injuryData, sc, proj]) => {
        if (!cancelled) {
          setPlayer(data);
          setInjuries(injuryData.entries);
          setScData(sc);
          setProjection(proj);
        }
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load player';
          if (msg.includes('not found') || msg.includes('Not Found')) {
            setNotFound(true);
          } else {
            setError(msg);
          }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId, year]);

  const { totals, averages, performances, seasonData, gamesPlayed, latestPrice, latestBE, latestRound } = useMemo(() => {
    const empty = {
      totals: {} as Record<string, number>, averages: {} as Record<string, number>,
      performances: [] as PlayerPerformanceDetail[], seasonData: null, gamesPlayed: 0,
      latestPrice: null as number | null, latestBE: null as number | null, latestRound: null as number | null,
    };
    if (!player) return empty;
    const sd = player.seasons[String(year)];
    const perfs = sd?.performances ?? [];
    const gp = perfs.length;

    const t: Record<string, number> = {};
    for (const key of SUMMABLE_KEYS) t[key] = 0;
    for (const perf of perfs) {
      for (const key of SUMMABLE_KEYS) {
        const val = (perf as unknown as Record<string, number>)[key];
        if (typeof val === 'number') t[key] = (t[key] ?? 0) + val;
      }
    }

    const avg: Record<string, number> = {};
    for (const key of SUMMABLE_KEYS) avg[key] = gp > 0 ? (t[key] ?? 0) / gp : 0;

    const latest = perfs.length > 0 ? perfs[perfs.length - 1]! : null;
    return {
      totals: t, averages: avg, performances: perfs, seasonData: sd, gamesPlayed: gp,
      latestPrice: latest?.price ?? null,
      latestBE: latest?.breakEven ?? null,
      latestRound: latest?.round ?? null,
    };
  }, [player, year]);

  const scByRound = useMemo(() => {
    if (!scData) return null;
    const map = new Map<number, PlayerMatchSupercoach>();
    for (const m of scData.matches) map.set(m.round, m);
    return map;
  }, [scData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>Player not found</Typography>
        <Link component="button" onClick={() => { window.location.pathname = buildPlayersUrl(); }}>
          Back to Players
        </Link>
      </Box>
    );
  }

  if (error || !player) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">{error ?? 'Failed to load player data'}</Alert>
      </Box>
    );
  }

  const teamName = teamNameMap.get(player.teamCode) ?? player.teamCode;

  const getCellValue = (perf: PlayerPerformanceDetail, key: string): string | number | null => {
    if (key === 'opponentTeamCode') {
      const code = perf.opponentTeamCode;
      return code ? (teamNameMap.get(code) ?? code) : '—';
    }
    if (key === '__sc') return scByRound?.get(perf.round)?.totalScore ?? null;
    return (perf as unknown as Record<string, string | number | null>)[key] ?? null;
  };

  const formatValue = (val: string | number | null, col: ColumnDef): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'string') return val;
    return col.format ? col.format(val) : String(val);
  };

  const handleCompare = () => {
    if (!onNavigate) return;
    const currentRoute = parseUrl(window.location.pathname);
    const existingIds = currentRoute.type === 'compare' ? currentRoute.playerIds : [];
    const newIds = existingIds.includes(playerId)
      ? existingIds
      : [...existingIds, playerId];
    onNavigate(buildCompareUrl(newIds));
  };

  const isAlreadyComparing = (() => {
    const currentRoute = parseUrl(window.location.pathname);
    return currentRoute.type === 'compare' && currentRoute.playerIds.includes(playerId);
  })();

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Back</Button>
        {onNavigate && (
          <Button
            startIcon={<CompareArrowsIcon />}
            onClick={handleCompare}
            variant={isAlreadyComparing ? 'outlined' : 'text'}
            disabled={isAlreadyComparing}
            color="secondary"
          >
            {isAlreadyComparing ? 'Comparing' : 'Compare'}
          </Button>
        )}
      </Box>

      {/* ── Hero section ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Typography variant="h4" fontWeight={700} lineHeight={1.1} gutterBottom>
          {player.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={teamName} size="small" color="primary" variant="outlined" />
          <Chip label={player.position} size="small" variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            {year} · {gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {(scData || latestPrice != null || latestBE != null) && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {scData && (
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>
                    SC AVG
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>{scData.seasonAverage.toFixed(1)}</Typography>
                </Box>
              )}
              {latestPrice != null && (
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>
                    PRICE{latestRound != null ? ` (RD ${latestRound})` : ''}
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>${latestPrice.toLocaleString()}</Typography>
                </Box>
              )}
              {latestBE != null && (
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>
                    BREAK EVEN{latestRound != null ? ` (RD ${latestRound})` : ''}
                  </Typography>
                  <Typography variant="h5" fontWeight={700}
                    sx={{ color: latestBE < 0 ? 'success.main' : latestBE > 0 ? 'error.main' : 'text.primary' }}>
                    {latestBE}
                  </Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </Paper>

      {/* ── Tab navigation ───────────────────────────────────────── */}
      <Tabs
        value={activeView}
        onChange={(_, v: ViewTab) => setActiveView(v)}
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Overview" value="overview" />
        <Tab label="Stats" value="stats" />
        <Tab label="Supercoach" value="supercoach" />
        {injuries.length > 0 && <Tab label={`Injuries (${injuries.length})`} value="injuries" />}
      </Tabs>

      {/* ── Overview tab ─────────────────────────────────────────── */}
      {activeView === 'overview' && (
        <Box>
          {/* SC sparkline */}
          {scData && scData.matches.length >= 2 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 1 }}>
                Supercoach Score — Round by Round
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <ScoreSparkline matches={scData.matches} average={scData.seasonAverage} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Season avg</Typography>
                    <Typography variant="body1" fontWeight={700}>{scData.seasonAverage.toFixed(1)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Season total</Typography>
                    <Typography variant="body1" fontWeight={700}>{Math.round(scData.seasonTotal)}</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {/* Position-aware key stats */}
          {seasonData && gamesPlayed > 0 && (() => {
            const stats = getKeyStats(player.position).filter(s => (totals[s.key] ?? 0) !== 0);
            if (stats.length === 0) return null;
            return (
              <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
                {stats.map(stat => {
                  const total = totals[stat.key] ?? 0;
                  const avg = averages[stat.key] ?? 0;
                  const fmtFn = stat.format ?? fmt0;
                  const primaryVal = stat.showAvg ? fmtFn(avg) : fmtFn(total);
                  const secondaryLabel = stat.showAvg ? 'per game' : 'this season';
                  const secondaryVal = stat.showAvg
                    ? `${Math.round(total).toLocaleString()} total`
                    : `${fmt1(avg)} avg/gm`;
                  return (
                    <Paper key={stat.key} variant="outlined" sx={{
                      minWidth: 118, flexShrink: 0, px: 2, pt: 1.75, pb: 1.5,
                      borderTop: '3px solid',
                      borderTopColor: stat.negative ? 'error.main' : 'primary.main',
                      borderRadius: 1,
                    }}>
                      <Typography variant="overline" sx={{ fontSize: '0.6rem', lineHeight: 1, display: 'block', mb: 1, color: 'text.secondary' }}>
                        {stat.label}
                      </Typography>
                      <Typography variant="h5" fontWeight={700} lineHeight={1} sx={{ mb: 0.25 }}>
                        {primaryVal}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.4}>
                        {secondaryLabel}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" display="block" lineHeight={1.4}>
                        {secondaryVal}
                      </Typography>
                    </Paper>
                  );
                })}
              </Box>
            );
          })()}

          {performances.length === 0 && (
            <Typography variant="body1" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No match performances recorded for {year}.
            </Typography>
          )}
        </Box>
      )}

      {/* ── Stats tab ────────────────────────────────────────────── */}
      {activeView === 'stats' && (
        <>
          {performances.length === 0 ? (
            <Typography variant="body1" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No match performances recorded for {year}.
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 340px)' }}>
              <Table size="small" sx={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }} stickyHeader>
                <TableHead>
                  <TableRow>
                    {GROUP_HEADERS.map((g, i) => (
                      <TableCell key={`${g.label}-${i}`} colSpan={g.span} align="center" sx={{
                        ...headerCellSx, bgcolor: 'primary.dark',
                        borderRight: '1px solid rgba(255,255,255,0.15)',
                        fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {g.label}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ ...headerCellSx, bgcolor: 'primary.dark', fontSize: '0.65rem' }} />
                  </TableRow>
                  <TableRow>
                    {COLUMNS.map(col => (
                      <Tooltip key={col.key} title={col.tip || ''} placement="top" arrow>
                        <TableCell align={col.align ?? 'right'} sx={{
                          ...headerCellSx, bgcolor: 'primary.main',
                          ...(col.key === 'round' && { position: 'sticky', left: 0, zIndex: 3 }),
                          ...(col.key === '__sc' && { bgcolor: 'primary.dark' }),
                        }}>
                          {col.label}
                        </TableCell>
                      </Tooltip>
                    ))}
                    <TableCell align="center" sx={{ ...headerCellSx, bgcolor: 'primary.main' }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performances.map((perf, idx) => (
                    <TableRow key={perf.matchId} sx={{
                      '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' },
                      ...(perf.isComplete ? {} : { opacity: 0.6 }),
                    }}>
                      {COLUMNS.map(col => {
                        const val = getCellValue(perf, col.key);

                        if (col.key === 'round') {
                          return (
                            <TableCell key={col.key} align="right" sx={{
                              ...cellSx, position: 'sticky', left: 0, zIndex: 1, fontWeight: 600,
                              bgcolor: idx % 2 === 0 ? '#f5f5f5' : '#fff',
                            }}>
                              {val}
                            </TableCell>
                          );
                        }

                        if (col.key === 'opponentTeamCode') {
                          return (
                            <TableCell key={col.key} sx={cellSx}>
                              <Typography variant="body2" fontSize="0.75rem" noWrap>{val}</Typography>
                            </TableCell>
                          );
                        }

                        if (col.key === '__sc') {
                          if (val === null || val === undefined) {
                            return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                          }
                          const score = typeof val === 'number' ? val : 0;
                          const avg = scData?.seasonAverage ?? 0;
                          const color = avg > 0
                            ? (score >= avg * 1.1 ? 'success.main' : score <= avg * 0.9 ? 'error.main' : 'text.primary')
                            : 'text.primary';
                          return (
                            <TableCell key={col.key} align="right" sx={{ ...cellSx, fontWeight: 700, color }}>
                              {Math.round(score)}
                            </TableCell>
                          );
                        }

                        if (val === null || val === undefined) {
                          return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                        }
                        const formatted = formatValue(val, col);
                        const isZero = val === 0 || formatted === '0' || formatted === '0.0' || formatted === '0.0%';
                        return (
                          <TableCell key={col.key} align={col.align ?? 'right'} sx={{ ...cellSx, ...(isZero && { color: 'text.disabled' }) }}>
                            {formatted}
                          </TableCell>
                        );
                      })}
                      <TableCell align="center" sx={cellSx}>
                        {!perf.isComplete && (
                          <Tooltip title="Partial data — stats may be incomplete">
                            <WarningAmberIcon fontSize="small" color="warning" sx={{ fontSize: '0.9rem' }} />
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Totals row */}
                  <TableRow sx={{ bgcolor: '#e3f2fd', '& td': { fontWeight: 600 } }}>
                    {COLUMNS.map(col => {
                      if (col.key === 'round') return <TableCell key={col.key} align="right" sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: '#e3f2fd', zIndex: 1 }}>Tot</TableCell>;
                      if (col.key === 'opponentTeamCode') return <TableCell key={col.key} sx={cellSx} />;
                      if (col.key === '__sc') {
                        const v = scData ? Math.round(scData.seasonTotal) : null;
                        return <TableCell key={col.key} align="right" sx={{ ...cellSx, fontWeight: 700 }}>{v ?? '—'}</TableCell>;
                      }
                      const val = totals[col.key];
                      if (val === undefined || !SUMMABLE_KEYS.includes(col.key)) return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                      return <TableCell key={col.key} align="right" sx={cellSx}>{col.format ? col.format(val) : fmt0(val)}</TableCell>;
                    })}
                    <TableCell />
                  </TableRow>

                  {/* Averages row */}
                  <TableRow sx={{ bgcolor: '#e8f5e9', '& td': { fontWeight: 600, fontStyle: 'italic' } }}>
                    {COLUMNS.map(col => {
                      if (col.key === 'round') return <TableCell key={col.key} align="right" sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: '#e8f5e9', zIndex: 1 }}>Avg</TableCell>;
                      if (col.key === 'opponentTeamCode') return <TableCell key={col.key} sx={cellSx} />;
                      if (col.key === '__sc') {
                        const v = scData ? scData.seasonAverage.toFixed(1) : null;
                        return <TableCell key={col.key} align="right" sx={{ ...cellSx, fontWeight: 700 }}>{v ?? '—'}</TableCell>;
                      }
                      const val = averages[col.key];
                      if (val === undefined || !SUMMABLE_KEYS.includes(col.key)) return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                      return <TableCell key={col.key} align="right" sx={cellSx}>{col.format ? col.format(val) : fmt1(val)}</TableCell>;
                    })}
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Supercoach tab ───────────────────────────────────────── */}
      {activeView === 'supercoach' && (
        <Box>
          {/* Projection panel */}
          {projection && !projection.noUsableData && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Projections</Typography>
              {projection.lowSampleWarning && (
                <Alert severity="warning" sx={{ mb: 1.5, py: 0.25, fontSize: '0.8rem' }}>
                  Small sample ({projection.gamesPlayed} games) — treat projections as indicative only.
                </Alert>
              )}

              {/* Floor / Avg / Ceiling numbers */}
              <Box sx={{ display: 'flex', gap: 4, mb: 2.5 }}>
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>FLOOR</Typography>
                  <Typography variant="h5" fontWeight={700} color="warning.dark">{Math.round(projection.projectedFloor)}</Typography>
                  <Typography variant="caption" color="text.secondary">conservative</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>AVERAGE</Typography>
                  <Typography variant="h5" fontWeight={700}>{Math.round(projection.projectedTotal)}</Typography>
                  <Typography variant="caption" color="text.secondary">floor + spike</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, display: 'block', mb: 0.5 }}>CEILING</Typography>
                  <Typography variant="h5" fontWeight={700} color="success.main">{Math.round(projection.projectedCeiling)}</Typography>
                  <Typography variant="caption" color="text.secondary">P90 boom week</Typography>
                </Box>
              </Box>

              {/* Model detail — Floor + Spike components */}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                {/* Floor component */}
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', display: 'block', mb: 1 }}>
                    Floor Component
                  </Typography>
                  {([
                    { label: 'Mean', value: projection.floorMean.toFixed(1) },
                    { label: 'Std Dev', value: projection.floorStd != null ? projection.floorStd.toFixed(1) : '—' },
                    { label: 'CV', value: projection.floorCv != null ? `${(projection.floorCv * 100).toFixed(0)}%` : '—' },
                    { label: 'Per Min', value: projection.floorPerMinute.toFixed(3) },
                    { label: 'Avg Mins', value: projection.avgMinutes.toFixed(1) },
                  ] as const).map(row => (
                    <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">{row.label}</Typography>
                      <Typography variant="caption" fontWeight={600}>{row.value}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Spike component */}
                <Box>
                  <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary', display: 'block', mb: 1 }}>
                    Spike Component
                  </Typography>
                  {([
                    { label: 'Mean', value: projection.spikeMean.toFixed(1) },
                    { label: 'Std Dev', value: projection.spikeStd != null ? projection.spikeStd.toFixed(1) : '—' },
                    { label: 'CV', value: projection.spikeCv != null ? `${(projection.spikeCv * 100).toFixed(0)}%` : '—' },
                    { label: 'Per Min', value: projection.spikePerMinute.toFixed(3) },
                    { label: 'P25', value: projection.spikeP25.toFixed(1) },
                    { label: 'P50', value: projection.spikeP50.toFixed(1) },
                    { label: 'P75', value: projection.spikeP75.toFixed(1) },
                    { label: 'P90', value: projection.spikeP90.toFixed(1) },
                  ] as const).map(row => (
                    <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">{row.label}</Typography>
                      <Typography variant="caption" fontWeight={600}>{row.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {/* Spike distribution bar */}
              {(() => {
                const dist = projection.spikeDistribution;
                const hasData = SPIKE_BANDS.some(b => dist[b.key].count > 0);
                if (!hasData) return null;
                return (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                      Score distribution ({projection.gamesPlayed} games)
                    </Typography>
                    <Box sx={{ display: 'flex', borderRadius: 0.5, overflow: 'hidden', height: 20, mb: 1 }}>
                      {SPIKE_BANDS.map(b => {
                        const entry = dist[b.key];
                        if (entry.frequency === 0) return null;
                        const pct = entry.frequency * 100;
                        return (
                          <Tooltip key={b.key} title={`${b.label}: ${entry.count} game${entry.count !== 1 ? 's' : ''} (${pct.toFixed(0)}%)`} arrow>
                            <Box sx={{ width: `${pct}%`, bgcolor: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {pct >= 10 && (
                                <Typography sx={{ fontSize: '0.55rem', color: 'white', fontWeight: 700, lineHeight: 1 }}>
                                  {entry.count}
                                </Typography>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      {SPIKE_BANDS.filter(b => dist[b.key].count > 0).map(b => (
                        <Box key={b.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: b.color, flexShrink: 0 }} />
                          <Typography variant="caption" color="text.secondary">
                            {b.label} ({(dist[b.key].frequency * 100).toFixed(0)}%)
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                );
              })()}
            </Paper>
          )}

          {/* Per-round SC breakdown */}
          {scData && scData.matches.length > 0 ? (
            <>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Round-by-Round Scores</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {(['Rd', 'Opponent', 'SC', 'Scoring', 'Create', 'Evade', 'Base', 'Defence', 'Negative'] as const).map(h => (
                        <TableCell key={h} align={h === 'Rd' || h === 'Opponent' ? 'left' : 'right'}
                          sx={{ ...headerCellSx, bgcolor: 'primary.main' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scData.matches.map(m => (
                      <TableRow key={m.round} sx={{ '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' } }}>
                        <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{m.round}</TableCell>
                        <TableCell sx={cellSx}>{teamNameMap.get(m.opponent) ?? m.opponent}</TableCell>
                        <TableCell align="right" sx={{
                          ...cellSx, fontWeight: 700,
                          color: m.totalScore >= scData.seasonAverage * 1.1 ? 'success.main'
                            : m.totalScore <= scData.seasonAverage * 0.9 ? 'error.main' : 'text.primary',
                        }}>
                          {Math.round(m.totalScore)}
                        </TableCell>
                        {(['scoring', 'create', 'evade', 'base', 'defence', 'negative'] as const).map(cat => (
                          <TableCell key={cat} align="right" sx={cellSx}>
                            {Math.round(m.categoryTotals[cat])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {/* Averages row */}
                    <TableRow sx={{ bgcolor: '#e8f5e9', '& td': { fontWeight: 600, fontStyle: 'italic' } }}>
                      <TableCell sx={cellSx}>Avg</TableCell>
                      <TableCell sx={cellSx} />
                      <TableCell align="right" sx={{ ...cellSx, fontWeight: 700 }}>{scData.seasonAverage.toFixed(1)}</TableCell>
                      {(['scoring', 'create', 'evade', 'base', 'defence', 'negative'] as const).map(cat => {
                        const catAvg = scData.matches.reduce((s, m) => s + m.categoryTotals[cat], 0) / scData.matches.length;
                        return <TableCell key={cat} align="right" sx={cellSx}>{catAvg.toFixed(1)}</TableCell>;
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Alert severity="info">No Supercoach scoring data available for {year}.</Alert>
          )}
        </Box>
      )}

      {/* ── Injuries tab ─────────────────────────────────────────── */}
      {activeView === 'injuries' && injuries.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Injury</TableCell>
                <TableCell>Expected Return</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {injuries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.injury}</TableCell>
                  <TableCell>{entry.expectedReturn}</TableCell>
                  <TableCell>{entry.startDate}</TableCell>
                  <TableCell>{entry.endDate ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={entry.endDate ? 'Recovered' : 'Current'}
                      size="small"
                      color={entry.endDate ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
