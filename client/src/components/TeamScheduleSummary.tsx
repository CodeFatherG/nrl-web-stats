import { Card, CardContent, Typography, Box, Chip, Stack } from '@mui/material';
import type { Team, StrengthCategory } from '../types';
import { getStrengthColor } from '../utils/strengthColors';
import { FormSparkline } from './FormSparkline';

interface TeamScheduleSummaryProps {
  team: Team;
  totalStrength: number;
  byeRounds: number[];
  fixtureCount: number;
  /** Team's ranking among all teams (1 = easiest schedule) */
  rank?: number;
  /** Total number of teams */
  totalTeams?: number;
  /** Category based on percentile */
  category?: StrengthCategory;
  /** Form trajectory snapshots for sparkline */
  formSnapshots?: Array<{ round: number; formScore: number }>;
}

export function TeamScheduleSummary({
  team,
  totalStrength,
  byeRounds,
  fixtureCount,
  rank,
  totalTeams,
  category,
  formSnapshots,
}: TeamScheduleSummaryProps) {
  const matchCount = fixtureCount - byeRounds.length;
  const avgStrength = matchCount > 0 ? Math.round(totalStrength / matchCount) : 0;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h5" component="h2" gutterBottom>
                {team.name}
              </Typography>
              {formSnapshots && formSnapshots.length > 0 && (
                <FormSparkline snapshots={formSnapshots} />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {fixtureCount} fixtures • {byeRounds.length} bye weeks
            </Typography>
          </Box>

          <Box textAlign="right">
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Strength of Schedule
            </Typography>
            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
                {totalStrength}
              </Typography>
              {category && (
                <Chip
                  label={category.charAt(0).toUpperCase() + category.slice(1)}
                  size="small"
                  sx={{
                    backgroundColor: getStrengthColor(category),
                    color: category === 'medium' ? '#000' : '#fff',
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Avg: {avgStrength} per match
              {rank !== undefined && totalTeams !== undefined && (
                <> • Rank: {rank}/{totalTeams}</>
              )}
            </Typography>
          </Box>
        </Box>

        {byeRounds.length > 0 && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Bye Rounds:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {byeRounds.map((round) => (
                <Chip
                  key={round}
                  label={`R${round}`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
