import { Card, CardContent, Typography, Box, Divider } from '@mui/material';
import { StrengthBadge } from './StrengthBadge';
import { OutlookBadge } from './OutlookBadge';
import type { StrengthThresholds } from '../types';
import { formatMatchDate } from '../utils/formatMatchDate';

type OutlookLabel = 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';

interface MatchCardProps {
  homeStrength: number;
  awayStrength: number;
  homeTeamName: string;
  awayTeamName: string;
  strengthThresholds: StrengthThresholds;
  outlookLabel?: OutlookLabel;
  outlookTooltip?: string;
  scheduledTime?: string | null;
  stadium?: string | null;
  weather?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean;
  onClick?: () => void;
}

export function MatchCard({
  homeStrength,
  awayStrength,
  homeTeamName,
  awayTeamName,
  strengthThresholds,
  outlookLabel,
  outlookTooltip,
  scheduledTime,
  stadium,
  weather,
  homeScore,
  awayScore,
  isComplete,
  onClick,
}: MatchCardProps) {
  const hasResult = isComplete && homeScore != null && awayScore != null;

  return (
    <Card
      sx={{
        height: '100%',
        ...(onClick && {
          cursor: 'pointer',
          '&:hover': { boxShadow: 4 },
          transition: 'box-shadow 0.2s',
        }),
      }}
      onClick={onClick}
    >
      <CardContent>
        {/* Match Info: Date & Venue */}
        {(scheduledTime || stadium) && (
          <Box mb={1}>
            {scheduledTime && (
              <Typography variant="caption" color="text.secondary" display="block">
                {formatMatchDate(scheduledTime)}
              </Typography>
            )}
            {stadium && (
              <Typography variant="caption" color="text.secondary" display="block">
                {stadium}
              </Typography>
            )}
          </Box>
        )}

        {/* Home Team */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={1}
        >
          <Box>
            <Typography variant="body2" color="text.secondary">
              Home
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              {homeTeamName}
            </Typography>
          </Box>
          <StrengthBadge rating={homeStrength} thresholds={strengthThresholds} />
        </Box>

        <Divider sx={{ my: 1 }}>
          <Typography variant="caption" color="text.secondary">
            vs
          </Typography>
        </Divider>

        {/* Away Team */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mt={1}
        >
          <Box>
            <Typography variant="body2" color="text.secondary">
              Away
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              {awayTeamName}
            </Typography>
          </Box>
          <StrengthBadge rating={awayStrength} thresholds={strengthThresholds} />
        </Box>

        {/* Match Result */}
        {hasResult && (
          <Box
            display="flex"
            justifyContent="center"
            mt={1.5}
            sx={{
              bgcolor: 'grey.100',
              borderRadius: 1,
              py: 0.75,
              px: 1,
            }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              {homeScore} - {awayScore}
            </Typography>
          </Box>
        )}

        {/* Weather */}
        {weather && (
          <Box display="flex" justifyContent="center" mt={1}>
            <Typography variant="caption" color="text.secondary">
              {weather}
            </Typography>
          </Box>
        )}

        {outlookLabel && (
          <Box display="flex" justifyContent="center" mt={1.5}>
            <OutlookBadge label={outlookLabel} tooltip={outlookTooltip} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
