import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Chip,
  Link,
  Alert,
} from '@mui/material';
import { getCasualtyWard } from '../services/api';
import type { CasualtyWardEntry } from '../services/api';
import type { Team } from '../types';

interface CasualtyWardViewProps {
  teams: Team[];
  onPlayerClick?: (playerId: string) => void;
}

/** Sort order for expected return grouping */
function expectedReturnSortKey(value: string): number {
  const roundMatch = value.match(/^Round\s+(\d+)$/i);
  if (roundMatch) return parseInt(roundMatch[1]!, 10);
  if (value === 'TBC') return 1000;
  if (value === 'Indefinite') return 2000;
  if (value.toLowerCase().includes('season')) return 3000;
  return 4000;
}

export function CasualtyWardView({ teams, onPlayerClick }: CasualtyWardViewProps) {
  const [entries, setEntries] = useState<CasualtyWardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      map.set(team.code, team.name);
    }
    return map;
  }, [teams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getCasualtyWard()
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load casualty ward');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, CasualtyWardEntry[]>();
    for (const entry of entries) {
      const key = entry.expectedReturn;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => expectedReturnSortKey(a) - expectedReturnSortKey(b));
  }, [entries]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (entries.length === 0) {
    return (
      <Alert severity="info">No players currently on the casualty ward.</Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Casualty Ward ({entries.length} players)
      </Typography>

      {grouped.map(([expectedReturn, groupEntries]) => (
        <Box key={expectedReturn} mb={3}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            {expectedReturn}
            <Chip
              label={`${groupEntries.length}`}
              size="small"
              sx={{ ml: 1 }}
            />
          </Typography>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Player</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Injury</TableCell>
                  <TableCell>Since</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupEntries
                  .sort((a, b) => a.lastName.localeCompare(b.lastName))
                  .map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {entry.playerId && onPlayerClick ? (
                          <Link
                            component="button"
                            variant="body2"
                            onClick={() => onPlayerClick(entry.playerId!)}
                            sx={{ textAlign: 'left' }}
                          >
                            {entry.playerName}
                          </Link>
                        ) : (
                          entry.playerName
                        )}
                      </TableCell>
                      <TableCell>{teamNameMap.get(entry.teamCode) ?? entry.teamCode}</TableCell>
                      <TableCell>{entry.injury}</TableCell>
                      <TableCell>{entry.startDate}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}
    </Box>
  );
}
