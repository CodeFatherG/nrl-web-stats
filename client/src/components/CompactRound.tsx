import { Box, Typography, Paper, Chip } from '@mui/material';
import type { CompactRound as CompactRoundType, StrengthThresholds } from '../types';
import { getStrengthCategory, getStrengthColor, getStrengthTextColor } from '../utils/strengthColors';
import { createMatchId } from '../utils/matchId';

interface CompactRoundProps {
  round: CompactRoundType;
  year: number;
  onClick?: () => void;
  onMatchClick?: (matchId: string) => void;
  strengthThresholds?: StrengthThresholds;
}

export function CompactRound({ round, year, onClick, onMatchClick, strengthThresholds }: CompactRoundProps) {
  // Default thresholds if not provided
  const thresholds = strengthThresholds ?? { p33: 300, p67: 400 };

  return (
    <Paper
      elevation={1}
      onClick={onClick}
      sx={{
        p: 1,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': onClick
          ? {
              elevation: 4,
              transform: 'translateY(-2px)',
              boxShadow: 3,
            }
          : {},
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 'bold',
          mb: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 0.5,
          textAlign: 'center',
        }}
      >
        R{round.round}
      </Typography>
      <Box
        sx={{
          fontSize: '10px',
          lineHeight: 1.3,
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {round.matches.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            No matches
          </Typography>
        ) : (
          round.matches.map((match, index) => {
            const homeCategory = getStrengthCategory(match.homeStrength, thresholds);
            const homeBgColor = getStrengthColor(homeCategory);
            const homeTextColor = getStrengthTextColor(homeCategory);

            const awayCategory = getStrengthCategory(match.awayStrength, thresholds);
            const awayBgColor = getStrengthColor(awayCategory);
            const awayTextColor = getStrengthTextColor(awayCategory);

            return (
              <Box
                key={index}
                onClick={
                  onMatchClick
                    ? (e: React.MouseEvent) => {
                        e.stopPropagation();
                        const matchId = createMatchId(year, round.round, match.homeTeam, match.awayTeam);
                        onMatchClick(matchId);
                      }
                    : undefined
                }
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  mb: 0.25,
                  whiteSpace: 'nowrap',
                  ...(onMatchClick && {
                    cursor: 'pointer',
                    borderRadius: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                  }),
                }}
              >
                {/* Home Strength Badge */}
                <Chip
                  label={match.homeStrength}
                  size="small"
                  sx={{
                    height: 14,
                    minWidth: 28,
                    fontSize: '9px',
                    fontWeight: 'bold',
                    backgroundColor: homeBgColor,
                    color: homeTextColor,
                    '& .MuiChip-label': {
                      px: 0.5,
                    },
                    flexShrink: 0,
                  }}
                />

                {/* Teams */}
                <Box
                  component="span"
                  sx={{
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {match.homeTeam} v {match.awayTeam}
                </Box>

                {/* Away Strength Badge */}
                <Chip
                  label={match.awayStrength}
                  size="small"
                  sx={{
                    height: 14,
                    minWidth: 28,
                    fontSize: '9px',
                    fontWeight: 'bold',
                    backgroundColor: awayBgColor,
                    color: awayTextColor,
                    '& .MuiChip-label': {
                      px: 0.5,
                    },
                    flexShrink: 0,
                  }}
                />
              </Box>
            );
          })
        )}
      </Box>
    </Paper>
  );
}
