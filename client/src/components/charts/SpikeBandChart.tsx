import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import type { SpikeBand, SpikeDistribution } from '../../services/api';

interface SpikeBandChartProps {
  distribution: SpikeDistribution;
  height?: number;
}

const BANDS: SpikeBand[] = ['negative', 'nil', 'low', 'moderate', 'high', 'boom'];

const BAND_LABELS: Record<SpikeBand, string> = {
  negative: 'Neg',
  nil: 'Nil',
  low: 'Low',
  moderate: 'Mod',
  high: 'High',
  boom: 'Boom',
};

const BAND_FULL_LABELS: Record<SpikeBand, string> = {
  negative: 'Negative spike',
  nil: 'Nil (0–5 pts)',
  low: 'Low (6–15 pts)',
  moderate: 'Moderate (16–30 pts)',
  high: 'High (31–50 pts)',
  boom: 'Boom (50+ pts)',
};

const BAND_COLORS: Record<SpikeBand, string> = {
  negative: '#D32F2F',
  nil: '#F57C00',
  low: '#FBC02D',
  moderate: '#7CB342',
  high: '#0288D1',
  boom: '#6A1B9A',
};

export function SpikeBandChart({ distribution, height = 40 }: SpikeBandChartProps) {
  const total = BANDS.reduce((sum, b) => sum + distribution[b].count, 0);

  if (total === 0) {
    return (
      <Typography variant="caption" color="text.disabled">
        No data
      </Typography>
    );
  }

  return (
    <Box>
      {/* Stacked bar */}
      <Box sx={{ display: 'flex', height, borderRadius: 1, overflow: 'hidden', width: '100%' }}>
        {BANDS.map((band) => {
          const entry = distribution[band];
          if (entry.count === 0) return null;
          const pct = (entry.frequency * 100).toFixed(1);
          return (
            <Tooltip
              key={band}
              title={`${BAND_FULL_LABELS[band]}: ${entry.count} game${entry.count !== 1 ? 's' : ''} (${pct}%)`}
              arrow
            >
              <Box
                sx={{
                  flex: entry.frequency,
                  bgcolor: BAND_COLORS[band],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: entry.frequency > 0.05 ? 'auto' : 0,
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'filter 0.15s',
                  '&:hover': { filter: 'brightness(1.15)' },
                }}
              >
                {entry.frequency > 0.09 && (
                  <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, fontSize: 10, lineHeight: 1 }}>
                    {Math.round(entry.frequency * 100)}%
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
        {BANDS.filter((b) => distribution[b].count > 0).map((band) => (
          <Box key={band} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: BAND_COLORS[band], flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {BAND_LABELS[band]} ({distribution[band].count})
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
