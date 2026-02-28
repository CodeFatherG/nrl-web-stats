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
import type { ScheduleFixture, Team, Streak } from '../types';

interface FixtureTableProps {
  fixtures: ScheduleFixture[];
  teams: Team[];
  emptyMessage?: string;
  streaks?: Streak[];
}

function getStreakForRound(round: number, streaks: Streak[]): Streak | null {
  return streaks.find((s) => round >= s.startRound && round <= s.endRound) ?? null;
}

function isFirstRoundOfStreak(round: number, streak: Streak, fixtures: ScheduleFixture[]): boolean {
  // Find the first fixture round that falls within this streak
  for (const f of fixtures) {
    if (f.round >= streak.startRound && f.round <= streak.endRound) {
      return f.round === round;
    }
  }
  return false;
}

function getStreakRowCount(streak: Streak, fixtures: ScheduleFixture[]): number {
  return fixtures.filter((f) => f.round >= streak.startRound && f.round <= streak.endRound).length;
}

const STREAK_COLORS = {
  soft_draw: '#E8F5E9',
  rough_patch: '#FFEBEE',
} as const;

const STREAK_LABELS = {
  soft_draw: 'Soft Draw',
  rough_patch: 'Rough Patch',
} as const;

const STREAK_LABEL_COLORS = {
  soft_draw: '#2E7D32',
  rough_patch: '#C62828',
} as const;

export function FixtureTable({
  fixtures,
  teams,
  emptyMessage = 'No fixtures match your filters',
  streaks = [],
}: FixtureTableProps) {
  const getTeamName = (code: string | null): string => {
    if (!code) return '-';
    const team = teams.find((t) => t.code === code);
    return team?.name ?? code;
  };

  const hasStreaks = streaks.length > 0;

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
            {hasStreaks && (
              <TableCell sx={{ color: 'white', fontWeight: 600, width: 100 }}>Streak</TableCell>
            )}
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Round</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Opponent</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }}>Venue</TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 600 }} align="center">
              Strength
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fixtures.map((fixture) => {
            const streak = hasStreaks ? getStreakForRound(fixture.round, streaks) : null;
            const showLabel = streak && isFirstRoundOfStreak(fixture.round, streak, fixtures);
            const rowSpan = showLabel ? getStreakRowCount(streak, fixtures) : undefined;

            return (
              <TableRow
                key={fixture.round}
                sx={{
                  bgcolor: streak ? STREAK_COLORS[streak.type] : undefined,
                  '&:nth-of-type(odd)': !streak ? { bgcolor: 'action.hover' } : undefined,
                  opacity: fixture.isBye ? 0.7 : 1,
                }}
              >
                {hasStreaks && showLabel && (
                  <TableCell
                    rowSpan={rowSpan}
                    sx={{
                      verticalAlign: 'middle',
                      borderRight: `3px solid ${STREAK_LABEL_COLORS[streak.type]}`,
                      px: 1,
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ color: STREAK_LABEL_COLORS[streak.type], whiteSpace: 'nowrap' }}
                    >
                      {STREAK_LABELS[streak.type]}
                    </Typography>
                  </TableCell>
                )}
                {hasStreaks && !showLabel && !streak && (
                  <TableCell />
                )}
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
                      category={fixture.category}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
