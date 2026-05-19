import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { StrengthBadge } from '../StrengthBadge';
import { GSRBadge } from '../GSRBadge';
import { OutlookBadge } from '../OutlookBadge';
import { getTeamPrimary } from '../../utils/teamColors';
import { formatMatchDate } from '../../utils/formatMatchDate';
import type { StrengthThresholds } from '../../types';

interface MatchCardProps {
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  homeStrength: number;
  awayStrength: number;
  /** Optional Game Strength Rating (normalised, 1.0 = league avg) — displayed alongside strength */
  homeGSR?: number;
  awayGSR?: number;
  homeGSRWarning?: boolean;
  awayGSRWarning?: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean;
  scheduledTime?: string | null;
  stadium?: string | null;
  weather?: string | null;
  outlookLabel?: 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';
  strengthThresholds?: StrengthThresholds;
  onClick?: () => void;
  compact?: boolean;
}

export function MatchCard({
  homeTeamCode,
  awayTeamCode,
  homeTeamName,
  awayTeamName,
  homeStrength,
  awayStrength,
  homeGSR,
  awayGSR,
  homeGSRWarning,
  awayGSRWarning,
  homeScore,
  awayScore,
  isComplete,
  scheduledTime,
  stadium,
  weather,
  outlookLabel,
  strengthThresholds,
  onClick,
  compact = false,
}: MatchCardProps) {
  const homePrimary = getTeamPrimary(homeTeamCode);

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        borderRadius: 2,
        borderTop: `3px solid ${homePrimary}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s ease',
        '&:hover': onClick ? { boxShadow: 3 } : {},
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: compact ? 1.5 : 2 }}>
        {/* Date / Venue */}
        {!compact && (scheduledTime || stadium) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {scheduledTime ? formatMatchDate(scheduledTime) : ''}
            {stadium ? ` · ${stadium}` : ''}
          </Typography>
        )}

        {/* Teams and Score */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: compact ? 0 : 1 }}>
          {/* Home */}
          <Box sx={{ flex: 1, textAlign: 'right' }}>
            <Typography variant={compact ? 'caption' : 'body2'} fontWeight={600} noWrap>
              {compact ? homeTeamCode : homeTeamName}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
              <StrengthBadge rating={homeStrength} thresholds={strengthThresholds} showValue={!compact} />
              {homeGSR != null && <GSRBadge normalizedGSR={homeGSR} sampleSizeWarning={homeGSRWarning} showValue={!compact} />}
            </Box>
          </Box>

          {/* Score or VS */}
          <Box sx={{ textAlign: 'center', minWidth: compact ? 32 : 48 }}>
            {isComplete && homeScore != null && awayScore != null ? (
              <Typography variant={compact ? 'body2' : 'h6'} fontWeight={700}>
                {homeScore}–{awayScore}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                vs
              </Typography>
            )}
          </Box>

          {/* Away */}
          <Box sx={{ flex: 1, textAlign: 'left' }}>
            <Typography variant={compact ? 'caption' : 'body2'} fontWeight={600} noWrap>
              {compact ? awayTeamCode : awayTeamName}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
              <StrengthBadge rating={awayStrength} thresholds={strengthThresholds} showValue={!compact} />
              {awayGSR != null && <GSRBadge normalizedGSR={awayGSR} sampleSizeWarning={awayGSRWarning} showValue={!compact} />}
            </Box>
          </Box>
        </Box>

        {/* Footer: weather + outlook */}
        {!compact && (weather || outlookLabel) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {weather && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <WbSunnyIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{weather}</Typography>
              </Box>
            )}
            {outlookLabel && (
              <OutlookBadge label={outlookLabel as 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert'} />
            )}
          </Box>
        )}

        {/* Completed chip */}
        {isComplete && !compact && (
          <Chip label="FT" size="small" sx={{ mt: 0.5, height: 18, fontSize: '0.65rem' }} />
        )}
      </Box>
    </Paper>
  );
}
