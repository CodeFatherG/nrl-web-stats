import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, Paper, Chip, Typography, Box,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { SupercoachScoreResponse } from '../services/api';

type SortField = 'totalScore' | 'playerName' | 'teamCode';
type SortDirection = 'asc' | 'desc';

type PlayerScore = SupercoachScoreResponse['scores'][number];

interface SupercoachScoreTableProps {
  scores: PlayerScore[];
  onPlayerClick?: (score: PlayerScore) => void;
}

export function SupercoachScoreTable({ scores, onPlayerClick }: SupercoachScoreTableProps) {
  const [sortField, setSortField] = useState<SortField>('totalScore');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'totalScore' ? 'desc' : 'asc');
    }
  };

  const sorted = useMemo(() => {
    return [...scores].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'totalScore') return (a.totalScore - b.totalScore) * dir;
      if (sortField === 'playerName') return a.playerName.localeCompare(b.playerName) * dir;
      return a.teamCode.localeCompare(b.teamCode) * dir;
    });
  }, [scores, sortField, sortDir]);

  if (scores.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No scores available for this round.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'playerName'}
                direction={sortField === 'playerName' ? sortDir : 'asc'}
                onClick={() => handleSort('playerName')}
              >
                Player
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'teamCode'}
                direction={sortField === 'teamCode' ? sortDir : 'asc'}
                onClick={() => handleSort('teamCode')}
              >
                Team
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">
              <TableSortLabel
                active={sortField === 'totalScore'}
                direction={sortField === 'totalScore' ? sortDir : 'desc'}
                onClick={() => handleSort('totalScore')}
              >
                Score
              </TableSortLabel>
            </TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((score, idx) => (
            <TableRow
              key={`${score.playerId}-${score.matchId}`}
              hover
              sx={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
              onClick={() => onPlayerClick?.(score)}
            >
              <TableCell>{idx + 1}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {score.playerName}
                  {score.validationWarnings.length > 0 && (
                    <WarningAmberIcon fontSize="small" color="warning" titleAccess="Has validation warnings" />
                  )}
                </Box>
              </TableCell>
              <TableCell>{score.teamCode}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>{score.totalScore}</TableCell>
              <TableCell align="center">
                {score.isComplete ? (
                  <Chip label="Complete" size="small" color="success" variant="outlined" />
                ) : (
                  <Chip label="Partial" size="small" color="warning" variant="outlined" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
