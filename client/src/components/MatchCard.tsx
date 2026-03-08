import { Card, CardContent, Typography, Box, Divider } from '@mui/material';
import { StrengthBadge } from './StrengthBadge';
import { OutlookBadge } from './OutlookBadge';
import type { StrengthThresholds } from '../types';

type OutlookLabel = 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';

interface MatchCardProps {
  homeStrength: number;
  awayStrength: number;
  homeTeamName: string;
  awayTeamName: string;
  strengthThresholds: StrengthThresholds;
  outlookLabel?: OutlookLabel;
  outlookTooltip?: string;
}

export function MatchCard({
  homeStrength,
  awayStrength,
  homeTeamName,
  awayTeamName,
  strengthThresholds,
  outlookLabel,
  outlookTooltip,
}: MatchCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
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

        {outlookLabel && (
          <Box display="flex" justifyContent="center" mt={1.5}>
            <OutlookBadge label={outlookLabel} tooltip={outlookTooltip} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
