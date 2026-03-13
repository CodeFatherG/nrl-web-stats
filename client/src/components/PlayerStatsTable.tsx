import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Typography,
  Box,
  Tooltip,
} from '@mui/material';
import type { PlayerMatchStats } from '../types';

type SortKey = keyof PlayerMatchStats;
type SortDirection = 'asc' | 'desc';

interface PlayerStatsTableProps {
  players: PlayerMatchStats[];
  teamName: string;
  teamCode: string;
}

interface ColumnDef {
  key: SortKey;
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
  // Identity
  { key: 'playerName', label: 'Player', align: 'left', group: 'Player' },
  { key: 'position', label: 'Pos', align: 'left', group: 'Player' },
  { key: 'minutesPlayed', label: 'Mins', group: 'Player' },
  { key: 'stintOne', label: 'S1', group: 'Player', tip: 'Stint One', format: fmtSecToMin },

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
];

// Compute group header spans
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

function compareValues(a: string | number, b: string | number, direction: SortDirection): number {
  if (typeof a === 'string' && typeof b === 'string') {
    return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  }
  const numA = Number(a);
  const numB = Number(b);
  return direction === 'asc' ? numA - numB : numB - numA;
}

const cellSx = { whiteSpace: 'nowrap', px: 0.75, py: 0.25, fontSize: '0.75rem' } as const;
const headerCellSx = { ...cellSx, color: 'white', fontWeight: 600 } as const;

export function PlayerStatsTable({ players, teamName, teamCode }: PlayerStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('minutesPlayed');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'playerName' || key === 'position' ? 'asc' : 'desc');
    }
  };

  const sorted = [...players].sort((a, b) =>
    compareValues(a[sortKey], b[sortKey], sortDirection)
  );

  if (players.length === 0) {
    return (
      <Box mb={3}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {teamName} ({teamCode})
        </Typography>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No player statistics available for this match
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box mb={3}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {teamName} ({teamCode})
      </Typography>
      <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
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
            </TableRow>
            {/* Column header row */}
            <TableRow>
              {COLUMNS.map((col) => (
                <Tooltip key={col.key} title={col.tip || ''} placement="top" arrow>
                  <TableCell
                    key={col.key}
                    align={col.align ?? 'right'}
                    sx={{
                      ...headerCellSx,
                      bgcolor: 'primary.main',
                      ...(col.key === 'playerName' && { position: 'sticky', left: 0, zIndex: 3 }),
                    }}
                  >
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDirection : 'asc'}
                      onClick={() => handleSort(col.key)}
                      sx={{
                        color: 'white !important',
                        '& .MuiTableSortLabel-icon': { color: 'white !important', fontSize: '0.75rem' },
                      }}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                </Tooltip>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((player, idx) => (
              <TableRow
                key={`${player.playerName}-${idx}`}
                sx={{ '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' } }}
              >
                {COLUMNS.map((col) => {
                  const val = player[col.key];
                  if (col.key === 'playerName') {
                    return (
                      <TableCell key={col.key} sx={{ ...cellSx, position: 'sticky', left: 0, bgcolor: idx % 2 === 0 ? '#f5f5f5' : '#fff', zIndex: 1 }}>
                        <Typography variant="body2" fontWeight={500} fontSize="0.75rem" noWrap>
                          {val}
                        </Typography>
                      </TableCell>
                    );
                  }
                  if (col.key === 'position') {
                    return (
                      <TableCell key={col.key} sx={cellSx}>
                        <Typography variant="body2" color="text.secondary" fontSize="0.75rem" noWrap>
                          {val}
                        </Typography>
                      </TableCell>
                    );
                  }
                  const formatted = col.format ? col.format(val as number) : val;
                  return (
                    <TableCell key={col.key} align="right" sx={cellSx}>
                      {formatted}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
