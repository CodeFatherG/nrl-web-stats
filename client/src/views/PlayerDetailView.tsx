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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { getPlayer, getPlayerInjuryHistory } from '../services/api';
import type { CasualtyWardEntry } from '../services/api';
import { buildPlayersUrl } from '../utils/routes';
import type { PlayerDetailResponse, PlayerPerformanceDetail, Team } from '../types';

interface PlayerDetailViewProps {
  playerId: string;
  onBack: () => void;
  teams: Team[];
  year: number;
}

// --- Column definitions (mirrors PlayerStatsTable but with Round/Opponent leading) ---

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
  // Context
  { key: 'round', label: 'Rd', align: 'right', group: 'Match', tip: 'Round' },
  { key: 'opponentTeamCode', label: 'Opp', align: 'left', group: 'Match', tip: 'Opponent' },
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

  // Supercoach supplementary stats (Price & BE first for visibility)
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

// Stat keys that can be summed for totals/averages (excludes round, opponent, rates)
const SUMMABLE_KEYS = COLUMNS
  .filter(c => c.key !== 'round' && c.key !== 'opponentTeamCode' &&
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

// Summary card stat definition
interface SummaryStat {
  label: string;
  key: string;
  format?: (v: number) => string;
}

const SUMMARY_STATS: SummaryStat[] = [
  { label: 'Tries', key: 'tries' },
  { label: 'Try Assists', key: 'tryAssists' },
  { label: 'Points', key: 'points' },
  { label: 'Run Metres', key: 'allRunMetres', format: fmt0 },
  { label: 'Runs', key: 'allRuns' },
  { label: 'Line Breaks', key: 'lineBreaks' },
  { label: 'Tackle Breaks', key: 'tackleBreaks' },
  { label: 'Tackles', key: 'tacklesMade' },
  { label: 'Missed Tackles', key: 'missedTackles' },
  { label: 'Offloads', key: 'offloads' },
  { label: 'Kicks', key: 'kicks' },
  { label: 'Kick Metres', key: 'kickMetres', format: fmt0 },
  { label: 'Errors', key: 'errors' },
  { label: 'Penalties', key: 'penalties' },
  { label: 'Mins Played', key: 'minutesPlayed' },
];

export function PlayerDetailView({ playerId, onBack, teams, year }: PlayerDetailViewProps) {
  const [player, setPlayer] = useState<PlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [injuries, setInjuries] = useState<CasualtyWardEntry[]>([]);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) {
      map.set(t.code, t.name);
    }
    return map;
  }, [teams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    Promise.all([
      getPlayer(playerId),
      getPlayerInjuryHistory(playerId).catch(() => ({ entries: [] as CasualtyWardEntry[] })),
    ])
      .then(([data, injuryData]) => {
        if (!cancelled) {
          setPlayer(data);
          setInjuries(injuryData.entries);
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
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [playerId]);

  // Compute totals and averages across all performances
  const { totals, averages, performances, seasonData, gamesPlayed } = useMemo(() => {
    if (!player) return { totals: {} as Record<string, number>, averages: {} as Record<string, number>, performances: [] as PlayerPerformanceDetail[], seasonData: null, gamesPlayed: 0 };
    const sd = player.seasons[String(year)];
    const perfs = sd?.performances ?? [];
    const gp = perfs.length;

    const t: Record<string, number> = {};
    for (const key of SUMMABLE_KEYS) {
      t[key] = 0;
    }
    for (const perf of perfs) {
      for (const key of SUMMABLE_KEYS) {
        const val = (perf as unknown as Record<string, number>)[key];
        if (typeof val === 'number') {
          t[key] = (t[key] ?? 0) + val;
        }
      }
    }

    const avg: Record<string, number> = {};
    for (const key of SUMMABLE_KEYS) {
      avg[key] = gp > 0 ? (t[key] ?? 0) / gp : 0;
    }

    return { totals: t, averages: avg, performances: perfs, seasonData: sd, gamesPlayed: gp };
  }, [player, year]);

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
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Player not found
        </Typography>
        <Link component="button" onClick={() => { window.location.pathname = buildPlayersUrl(); }}>
          Back to Players
        </Link>
      </Box>
    );
  }

  if (error || !player) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
          Back
        </Button>
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
    return (perf as unknown as Record<string, string | number | null>)[key] ?? null;
  };

  const formatValue = (val: string | number | null, col: ColumnDef): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'string') return val;
    return col.format ? col.format(val) : String(val);
  };

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
        Back
      </Button>

      {/* Player Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h2">
          {player.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
          <Chip label={teamName} size="small" color="primary" variant="outlined" />
          <Chip label={player.position} size="small" variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            {year} Season — {gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''}
          </Typography>
        </Box>
      </Box>

      {/* Current Price & Break Even */}
      {performances.length > 0 && (() => {
        const latest = performances[performances.length - 1]!;
        const latestPrice = latest.price;
        const latestBE = latest.breakEven;
        if (latestPrice == null && latestBE == null) return null;
        return (
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 3, alignItems: 'center', bgcolor: '#f3e5f5' }}>
            {latestPrice != null && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Price (Rd {latest.round})
                </Typography>
                <Typography variant="h5" fontWeight={700} color="primary.dark">
                  ${latestPrice.toLocaleString()}
                </Typography>
              </Box>
            )}
            {latestBE != null && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Break Even (Rd {latest.round})
                </Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: latestBE < 0 ? 'success.main' : latestBE > 0 ? 'error.main' : 'text.primary' }}>
                  {latestBE}
                </Typography>
              </Box>
            )}
          </Paper>
        );
      })()}

      {/* Summary Cards */}
      {seasonData && gamesPlayed > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Season Summary
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1.5 }}>
            {SUMMARY_STATS.filter(stat => (totals[stat.key] ?? 0) !== 0).map(stat => {
              const total = totals[stat.key] ?? 0;
              const avg = averages[stat.key] ?? 0;
              const fmtFn = stat.format ?? fmt0;
              return (
                <Box key={stat.key} sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {stat.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={700} fontSize="1.1rem">
                    {fmtFn(total)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt1(avg)}/game
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* Round-by-round full stats table */}
      {performances.length === 0 ? (
        <Typography variant="body1" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No match performances recorded for {year}.
        </Typography>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
            Round-by-Round Performance
          </Typography>
          <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 480px)' }}>
            <Table size="small" sx={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }} stickyHeader>
              <TableHead>
                {/* Group header row */}
                <TableRow>
                  {GROUP_HEADERS.map((g, i) => (
                    <TableCell
                      key={`${g.label}-${i}`}
                      colSpan={g.span}
                      align="center"
                      sx={{
                        ...headerCellSx,
                        bgcolor: 'primary.dark',
                        borderRight: '1px solid rgba(255,255,255,0.15)',
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {g.label}
                    </TableCell>
                  ))}
                  <TableCell
                    align="center"
                    sx={{
                      ...headerCellSx,
                      bgcolor: 'primary.dark',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  />
                </TableRow>
                {/* Column header row */}
                <TableRow>
                  {COLUMNS.map(col => (
                    <Tooltip key={col.key} title={col.tip || ''} placement="top" arrow>
                      <TableCell
                        align={col.align ?? 'right'}
                        sx={{
                          ...headerCellSx,
                          bgcolor: 'primary.main',
                          ...(col.key === 'round' && { position: 'sticky', left: 0, zIndex: 3 }),
                        }}
                      >
                        {col.label}
                      </TableCell>
                    </Tooltip>
                  ))}
                  <TableCell align="center" sx={{ ...headerCellSx, bgcolor: 'primary.main' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {performances.map((perf, idx) => (
                  <TableRow
                    key={perf.matchId}
                    sx={{
                      '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' },
                      ...(perf.isComplete ? {} : { opacity: 0.6 }),
                    }}
                  >
                    {COLUMNS.map(col => {
                      const val = getCellValue(perf, col.key);
                      if (col.key === 'round') {
                        return (
                          <TableCell key={col.key} align="right" sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: idx % 2 === 0 ? '#f5f5f5' : '#fff', zIndex: 1, fontWeight: 600 }}>
                            {val}
                          </TableCell>
                        );
                      }
                      if (col.key === 'opponentTeamCode') {
                        return (
                          <TableCell key={col.key} sx={cellSx}>
                            <Typography variant="body2" fontSize="0.75rem" noWrap>
                              {val}
                            </Typography>
                          </TableCell>
                        );
                      }
                      if (val === null || val === undefined) {
                        return (
                          <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>
                            —
                          </TableCell>
                        );
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
                    if (col.key === 'round') {
                      return <TableCell key={col.key} align="right" sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: '#e3f2fd', zIndex: 1, fontWeight: 600 }}>Tot</TableCell>;
                    }
                    if (col.key === 'opponentTeamCode') {
                      return <TableCell key={col.key} sx={cellSx} />;
                    }
                    const val = totals[col.key];
                    if (val === undefined || !SUMMABLE_KEYS.includes(col.key)) {
                      return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                    }
                    return (
                      <TableCell key={col.key} align="right" sx={cellSx}>
                        {col.format ? col.format(val) : fmt0(val)}
                      </TableCell>
                    );
                  })}
                  <TableCell />
                </TableRow>

                {/* Averages row */}
                <TableRow sx={{ bgcolor: '#e8f5e9', '& td': { fontWeight: 600, fontStyle: 'italic' } }}>
                  {COLUMNS.map(col => {
                    if (col.key === 'round') {
                      return <TableCell key={col.key} align="right" sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: '#e8f5e9', zIndex: 1, fontWeight: 600, fontStyle: 'italic' }}>Avg</TableCell>;
                    }
                    if (col.key === 'opponentTeamCode') {
                      return <TableCell key={col.key} sx={cellSx} />;
                    }
                    const val = averages[col.key];
                    if (val === undefined || !SUMMABLE_KEYS.includes(col.key)) {
                      return <TableCell key={col.key} align="right" sx={{ ...cellSx, color: 'text.disabled' }}>—</TableCell>;
                    }
                    return (
                      <TableCell key={col.key} align="right" sx={cellSx}>
                        {col.format ? col.format(val) : fmt1(val)}
                      </TableCell>
                    );
                  })}
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Injury History */}
      {injuries.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Injury History
          </Typography>
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
                {injuries.map((entry) => (
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
        </Box>
      )}
    </Box>
  );
}
