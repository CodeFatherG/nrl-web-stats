import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import { StrengthBadge } from './StrengthBadge';
import { VenueBadge } from './VenueBadge';
import { ByeIndicator } from './ByeIndicator';
import type { ScheduleFixture, StrengthThresholds, Team } from '../types';

interface FixtureTableProps {
  fixtures: ScheduleFixture[];
  strengthThresholds: StrengthThresholds;
  teams: Team[];
  emptyMessage?: string;
}

export function FixtureTable({
  fixtures,
  strengthThresholds,
  teams,
  emptyMessage = 'No fixtures match your filters',
}: FixtureTableProps) {
  const getTeamName = (code: string | null): string => {
    if (!code) return '-';
    const team = teams.find((t) => t.code === code);
    return team?.name ?? code;
  };

  if (fixtures.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{emptyMessage}</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'primary.main' }}>
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Round</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Opponent</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Venue</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }} align="center">
              Strength
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fixtures.map((fixture) => (
            <TableRow
              key={fixture.round}
              sx={{
                '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
                opacity: fixture.isBye ? 0.7 : 1,
              }}
            >
              <TableCell>
                <Typography fontWeight={500}>R{fixture.round}</Typography>
              </TableCell>
              <TableCell>
                {fixture.isBye ? (
                  <ByeIndicator />
                ) : (
                  <Typography>{getTeamName(fixture.opponent)}</Typography>
                )}
              </TableCell>
              <TableCell>
                {fixture.isBye ? (
                  <Typography color="text.secondary">-</Typography>
                ) : (
                  <VenueBadge isHome={fixture.isHome} />
                )}
              </TableCell>
              <TableCell align="center">
                {fixture.isBye ? (
                  <Typography color="text.secondary">-</Typography>
                ) : (
                  <StrengthBadge
                    rating={fixture.strengthRating}
                    thresholds={strengthThresholds}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
