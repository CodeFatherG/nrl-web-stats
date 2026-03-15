import { Box, Typography, Tooltip } from '@mui/material';
import type { PlayerSeasonSupercoachResponse } from '../services/api';

interface ScoreTrendChartProps {
  data: PlayerSeasonSupercoachResponse;
}

export function ScoreTrendChart({ data }: ScoreTrendChartProps) {
  if (data.rounds.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No round data available for this player.
      </Typography>
    );
  }

  const maxScore = Math.max(...data.rounds.map(r => Math.abs(r.totalScore)), 1);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">
          Season Trend ({data.roundsPlayed} rounds)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Total: {data.seasonTotal} | Avg: {data.seasonAverage}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end', height: 120 }}>
        {data.rounds.map(round => {
          const height = Math.max((Math.abs(round.totalScore) / maxScore) * 100, 4);
          const isNegative = round.totalScore < 0;

          return (
            <Tooltip
              key={round.round}
              title={`R${round.round}: ${round.totalScore} pts${round.isComplete ? '' : ' (partial)'}`}
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 12,
                  maxWidth: 40,
                  height: `${height}%`,
                  bgcolor: isNegative ? 'error.main' : round.isComplete ? 'primary.main' : 'warning.light',
                  borderRadius: '2px 2px 0 0',
                  opacity: round.isComplete ? 1 : 0.7,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  '&:hover': { opacity: 0.8 },
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      {/* Round labels */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {data.rounds.map(round => (
          <Typography
            key={round.round}
            variant="caption"
            color="text.secondary"
            sx={{ flex: 1, minWidth: 12, maxWidth: 40, textAlign: 'center', fontSize: '0.6rem' }}
          >
            {round.round}
          </Typography>
        ))}
      </Box>

      {/* Average line reference */}
      {data.roundsPlayed > 1 && (
        <Box sx={{ position: 'relative', mt: -0.5 }}>
          <Box
            sx={{
              position: 'absolute',
              bottom: `${(data.seasonAverage / maxScore) * 100}%`,
              left: 0,
              right: 0,
              borderTop: '1px dashed',
              borderColor: 'text.disabled',
            }}
          />
        </Box>
      )}
    </Box>
  );
}
