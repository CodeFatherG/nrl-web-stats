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
import { computeGradientColor, rowMinMax } from '../utils/gradientCell';
import type { PlayerComparisonData } from '../views/CompareView';

interface CompareRoundScoresTableProps {
  players: PlayerComparisonData[];
}

interface SortState {
  playerId: string | null;
  dir: 'asc' | 'desc';
}

function getRoundScore(player: PlayerComparisonData, round: number): number | null {
  const entry = player.scRounds.find(r => r.round === round);
  return entry?.totalScore ?? null;
}

function SummaryCell({
  value,
  bg,
}: {
  value: number | null;
  bg: string | undefined;
}) {
  if (value === null) {
    return <TableCell align="right">—</TableCell>;
  }
  return (
    <TableCell align="right" style={{ backgroundColor: bg }} sx={{ fontWeight: 600 }}>
      {Math.round(value)}
    </TableCell>
  );
}

export function CompareRoundScoresTable({ players }: CompareRoundScoresTableProps) {
  const [sort, setSort] = useState<SortState>({ playerId: null, dir: 'desc' });

  const allRounds = Array.from(
    new Set(players.flatMap(p => p.scRounds.map(r => r.round)))
  ).sort((a, b) => a - b);

  const handleColumnClick = (playerId: string) => {
    setSort(prev => {
      if (prev.playerId === playerId) {
        return { playerId, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      }
      return { playerId, dir: 'desc' };
    });
  };

  const sortedRounds = [...allRounds].sort((a, b) => {
    if (!sort.playerId) return a - b;
    const player = players.find(p => p.playerId === sort.playerId);
    if (!player) return a - b;
    const va = getRoundScore(player, a);
    const vb = getRoundScore(player, b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sort.dir === 'desc' ? vb - va : va - vb;
  });

  // Compute summary stats per player
  const summaries = players.map(p => {
    const scores = p.scRounds.map(r => r.totalScore).filter((s): s is number => s !== null);
    return {
      avg: p.sc?.seasonAverage ?? (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null),
      total: p.sc?.seasonTotal ?? (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) : null),
      best: scores.length > 0 ? Math.max(...scores) : null,
      worst: scores.length > 0 ? Math.min(...scores) : null,
    };
  });

  // Summary gradient ranges (computed across players for each summary metric, independently)
  const summaryRanges = {
    avg:   rowMinMax(summaries.map(s => s.avg)),
    total: rowMinMax(summaries.map(s => s.total)),
    best:  rowMinMax(summaries.map(s => s.best)),
    worst: rowMinMax(summaries.map(s => s.worst)),
  };

  if (allRounds.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No round scores available.
      </Typography>
    );
  }

  const stickyLabel = {
    position: 'sticky' as const,
    left: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderColor: 'divider',
  };

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        overflowX: 'auto',
        '& .MuiTableCell-root': {
          px: { xs: 0.5, sm: 1 },
          py: { xs: 0.25, sm: 0.5 },
          fontSize: { xs: '0.68rem', sm: '0.8rem' },
        },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...stickyLabel, zIndex: 4, fontWeight: 700, minWidth: { xs: 52, sm: 100 } }}>
              Round
            </TableCell>
            {players.map(player => (
              <TableCell key={player.playerId} align="right" sx={{ minWidth: { xs: 56, sm: 110 } }}>
                <TableSortLabel
                  active={sort.playerId === player.playerId}
                  direction={sort.playerId === player.playerId ? sort.dir : 'desc'}
                  onClick={() => handleColumnClick(player.playerId)}
                >
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: 'inherit' }}>
                    {player.playerName}
                  </Typography>
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Summary rows */}
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ ...stickyLabel, fontWeight: 600, color: 'text.secondary' }}>Season Avg</TableCell>
            {players.map((player, i) => {
              const s = summaries[i]!;
              return (
                <SummaryCell
                  key={player.playerId}
                  value={s.avg}
                  bg={summaryRanges.avg && s.avg !== null
                    ? computeGradientColor(s.avg, summaryRanges.avg.min, summaryRanges.avg.max, true)
                    : undefined}
                />
              );
            })}
          </TableRow>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ ...stickyLabel, fontWeight: 600, color: 'text.secondary' }}>Season Total</TableCell>
            {players.map((player, i) => {
              const s = summaries[i]!;
              return (
                <SummaryCell
                  key={player.playerId}
                  value={s.total}
                  bg={summaryRanges.total && s.total !== null
                    ? computeGradientColor(s.total, summaryRanges.total.min, summaryRanges.total.max, true)
                    : undefined}
                />
              );
            })}
          </TableRow>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ ...stickyLabel, fontWeight: 600, color: 'text.secondary' }}>Best Round</TableCell>
            {players.map((player, i) => {
              const s = summaries[i]!;
              return (
                <SummaryCell
                  key={player.playerId}
                  value={s.best}
                  bg={summaryRanges.best && s.best !== null
                    ? computeGradientColor(s.best, summaryRanges.best.min, summaryRanges.best.max, true)
                    : undefined}
                />
              );
            })}
          </TableRow>
          <TableRow sx={{ bgcolor: 'action.hover', borderBottom: '2px solid', borderColor: 'divider' }}>
            <TableCell sx={{ ...stickyLabel, fontWeight: 600, color: 'text.secondary' }}>Worst Round</TableCell>
            {players.map((player, i) => {
              const s = summaries[i]!;
              return (
                <SummaryCell
                  key={player.playerId}
                  value={s.worst}
                  bg={summaryRanges.worst && s.worst !== null
                    ? computeGradientColor(s.worst, summaryRanges.worst.min, summaryRanges.worst.max, true)
                    : undefined}
                />
              );
            })}
          </TableRow>

          {/* Per-round rows */}
          {sortedRounds.map(round => {
            const scores = players.map(p => getRoundScore(p, round));
            const range = rowMinMax(scores);

            return (
              <TableRow key={round} hover>
                <TableCell sx={{ ...stickyLabel, fontWeight: 500 }}>Rd {round}</TableCell>
                {players.map((player, i) => {
                  const score = scores[i] ?? null;
                  const roundExists = allRounds.includes(round);
                  const playerHasRound = player.scRounds.some(r => r.round === round);

                  const bg = range !== null && score !== null
                    ? computeGradientColor(score, range.min, range.max, true)
                    : undefined;

                  return (
                    <TableCell
                      key={player.playerId}
                      align="right"
                      style={{ backgroundColor: bg }}
                      data-testid={`cell-rd${round}-${player.playerId}`}
                    >
                      {score !== null ? (
                        score
                      ) : playerHasRound ? (
                        <Typography variant="body2" color="text.disabled" component="span">
                          DNP
                        </Typography>
                      ) : roundExists ? (
                        <Typography variant="body2" color="text.disabled" component="span">
                          DNP
                        </Typography>
                      ) : (
                        '—'
                      )}
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
