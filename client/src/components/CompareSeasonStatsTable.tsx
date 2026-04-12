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
} from '@mui/material';
import type { PlayerComparisonData, SeasonStatsSnapshot } from '../views/CompareView';

interface CompareSeasonStatsTableProps {
  players: PlayerComparisonData[];
}

interface StatRowDef {
  key: keyof SeasonStatsSnapshot;
  label: string;
  format?: (v: number) => string;
}

const fmt0 = (v: number) => Math.round(v).toString();
const fmt1 = (v: number) => v.toFixed(1);
const fmtPrice = (v: number) => `$${(v / 1000).toFixed(0)}k`;

const STAT_ROWS: StatRowDef[] = [
  { key: 'gamesPlayed', label: 'Games Played', format: fmt0 },
  { key: 'avgScScore', label: 'SC Avg', format: fmt1 },
  { key: 'totalTries', label: 'Tries', format: fmt0 },
  { key: 'totalRunMetres', label: 'Run Metres', format: fmt0 },
  { key: 'totalTacklesMade', label: 'Tackles Made', format: fmt0 },
  { key: 'totalTackleBreaks', label: 'Tackle Breaks', format: fmt0 },
  { key: 'totalLineBreaks', label: 'Line Breaks', format: fmt0 },
  { key: 'totalPoints', label: 'Points', format: fmt0 },
  { key: 'totalKicks', label: 'Kicks', format: fmt0 },
  { key: 'totalKickMetres', label: 'Kick Metres', format: fmt0 },
  { key: 'totalOffloads', label: 'Offloads', format: fmt0 },
  { key: 'totalErrors', label: 'Errors', format: fmt0 },
  { key: 'totalPenalties', label: 'Penalties', format: fmt0 },
  { key: 'totalMissedTackles', label: 'Missed Tackles', format: fmt0 },
  { key: 'totalInterceptions', label: 'Intercepts', format: fmt0 },
  { key: 'avgMinutesPlayed', label: 'Avg Minutes', format: fmt1 },
  { key: 'latestPrice', label: 'Price', format: fmtPrice },
  { key: 'latestBreakEven', label: 'Break Even', format: fmt0 },
];

interface SortState {
  playerId: string | null;
  dir: 'asc' | 'desc';
}

function getStatValue(player: PlayerComparisonData, key: keyof SeasonStatsSnapshot): number | null {
  if (!player.seasonStats) return null;
  const v = player.seasonStats[key];
  return typeof v === 'number' ? v : null;
}

export function CompareSeasonStatsTable({ players }: CompareSeasonStatsTableProps) {
  const [sort, setSort] = useState<SortState>({ playerId: null, dir: 'desc' });

  const handleColumnClick = (playerId: string) => {
    setSort((prev) => {
      if (prev.playerId === playerId) {
        return { playerId, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      }
      return { playerId, dir: 'desc' };
    });
  };

  const sortedRows = [...STAT_ROWS].sort((a, b) => {
    if (!sort.playerId) return 0;
    const player = players.find((p) => p.playerId === sort.playerId);
    if (!player) return 0;
    const va = getStatValue(player, a.key);
    const vb = getStatValue(player, b.key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // nulls last
    if (vb === null) return -1;
    return sort.dir === 'desc' ? vb - va : va - vb;
  });

  // Compute max per row for leader highlighting (only when 2+ players)
  const shouldHighlight = players.length >= 2;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>Stat</TableCell>
            {players.map((player) => (
              <TableCell key={player.playerId} align="right" sx={{ minWidth: 120 }}>
                <TableSortLabel
                  active={sort.playerId === player.playerId}
                  direction={sort.playerId === player.playerId ? sort.dir : 'desc'}
                  onClick={() => handleColumnClick(player.playerId)}
                >
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {player.playerName || player.playerId}
                  </Typography>
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedRows.map((row) => {
            const values = players.map((p) => getStatValue(p, row.key));
            const nonNullValues = values.filter((v): v is number => v !== null);
            const maxVal = shouldHighlight && nonNullValues.length >= 2 ? Math.max(...nonNullValues) : null;

            return (
              <TableRow key={row.key} hover>
                <TableCell sx={{ fontWeight: 500 }}>{row.label}</TableCell>
                {players.map((player, i) => {
                  const val = values[i] ?? null;
                  const isLeader = maxVal !== null && val === maxVal;
                  return (
                    <TableCell
                      key={player.playerId}
                      align="right"
                      sx={isLeader ? { bgcolor: 'success.light', fontWeight: 700 } : undefined}
                      data-testid={isLeader ? `leader-${row.key}` : undefined}
                    >
                      {val === null ? '—' : (row.format ?? String)(val)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
