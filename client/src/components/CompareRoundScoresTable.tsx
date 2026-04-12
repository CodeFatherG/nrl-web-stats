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
import type { PlayerComparisonData } from '../views/CompareView';

interface CompareRoundScoresTableProps {
  players: PlayerComparisonData[];
}

interface SortState {
  playerId: string | null;
  dir: 'asc' | 'desc';
}

export function CompareRoundScoresTable({ players }: CompareRoundScoresTableProps) {
  const [sort, setSort] = useState<SortState>({ playerId: null, dir: 'desc' });

  // Derive union of all rounds across all players
  const allRounds = Array.from(
    new Set(players.flatMap((p) => p.scRounds.map((r) => r.round)))
  ).sort((a, b) => a - b);

  const handleColumnClick = (playerId: string) => {
    setSort((prev) => {
      if (prev.playerId === playerId) {
        return { playerId, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      }
      return { playerId, dir: 'desc' };
    });
  };

  const getRoundScore = (player: PlayerComparisonData, round: number): number | null => {
    const entry = player.scRounds.find((r) => r.round === round);
    return entry?.totalScore ?? null;
  };

  const sortedRounds = [...allRounds].sort((a, b) => {
    if (!sort.playerId) return a - b;
    const player = players.find((p) => p.playerId === sort.playerId);
    if (!player) return a - b;
    const va = getRoundScore(player, a);
    const vb = getRoundScore(player, b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // DNP/null last
    if (vb === null) return -1;
    return sort.dir === 'desc' ? vb - va : va - vb;
  });

  const shouldHighlight = players.length >= 2;

  if (allRounds.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No round scores available.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Round</TableCell>
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
          {sortedRounds.map((round) => {
            const scores = players.map((p) => getRoundScore(p, round));
            const nonNullScores = scores.filter((v): v is number => v !== null);
            const maxScore = shouldHighlight && nonNullScores.length >= 2 ? Math.max(...nonNullScores) : null;

            return (
              <TableRow key={round} hover>
                <TableCell sx={{ fontWeight: 500 }}>Rd {round}</TableCell>
                {players.map((player, i) => {
                  const score = scores[i] ?? null;
                  const isLeader = maxScore !== null && score === maxScore;
                  const isDnp = players.some((p) =>
                    p.scRounds.some((r) => r.round === round)
                  ) && score === null;

                  return (
                    <TableCell
                      key={player.playerId}
                      align="right"
                      sx={isLeader ? { bgcolor: 'success.light', fontWeight: 700 } : undefined}
                      data-testid={isLeader ? `leader-rd${round}` : undefined}
                    >
                      {score !== null ? (
                        score
                      ) : isDnp ? (
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
