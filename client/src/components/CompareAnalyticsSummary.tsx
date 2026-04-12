import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Tooltip,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { PlayerComparisonData } from '../views/CompareView';

interface CompareAnalyticsSummaryProps {
  players: PlayerComparisonData[];
}

interface MetricDef {
  key: 'projectedTotal' | 'projectedFloor' | 'projectedCeiling' | 'latestPrice' | 'latestBreakEven';
  label: string;
  isProjection: boolean;
  format: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { key: 'projectedTotal', label: 'Proj. Score', isProjection: true, format: (v) => v.toFixed(1) },
  { key: 'projectedFloor', label: 'Floor', isProjection: true, format: (v) => v.toFixed(1) },
  { key: 'projectedCeiling', label: 'Ceiling', isProjection: true, format: (v) => v.toFixed(1) },
  { key: 'latestPrice', label: 'Price', isProjection: false, format: (v) => `$${(v / 1000).toFixed(0)}k` },
  { key: 'latestBreakEven', label: 'Break Even', isProjection: false, format: (v) => v.toFixed(0) },
];

function getMetricValue(player: PlayerComparisonData, key: MetricDef['key']): number | null {
  if (key === 'projectedTotal') return player.projectionError ? null : (player.projection?.projectedTotal ?? null);
  if (key === 'projectedFloor') return player.projectionError ? null : (player.projection?.projectedFloor ?? null);
  if (key === 'projectedCeiling') return player.projectionError ? null : (player.projection?.projectedCeiling ?? null);
  if (key === 'latestPrice') return player.seasonStats?.latestPrice ?? null;
  if (key === 'latestBreakEven') return player.seasonStats?.latestBreakEven ?? null;
  return null;
}

export function CompareAnalyticsSummary({ players }: CompareAnalyticsSummaryProps) {
  if (players.length === 0) return null;

  // Compute max per metric across all players (for leader highlighting)
  const maxValues: Partial<Record<MetricDef['key'], number>> = {};
  for (const metric of METRICS) {
    const values = players.map((p) => getMetricValue(p, metric.key)).filter((v): v is number => v !== null);
    if (values.length >= 2) {
      maxValues[metric.key] = Math.max(...values);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      {players.map((player) => (
        <Card
          key={player.playerId}
          variant="outlined"
          sx={{ minWidth: 180, flex: '1 1 180px', maxWidth: 260 }}
        >
          <CardContent>
            {/* Header */}
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {player.loading ? `${player.playerId}…` : player.playerName}
            </Typography>
            <Chip label={player.teamCode || '…'} size="small" sx={{ mb: 1.5 }} />

            {/* Metrics */}
            {METRICS.map((metric) => {
              const value = getMetricValue(player, metric.key);
              const isLeader = value !== null && maxValues[metric.key] === value;
              const isUnavailable = metric.isProjection && (player.projectionError || player.projection?.noUsableData);
              const showWarning = metric.isProjection && !player.projectionError && (player.projection?.lowSampleWarning ?? false);

              return (
                <Box
                  key={metric.key}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 0.25,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {metric.label}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {showWarning && (
                      <Tooltip title="Low sample size — fewer than 6 games">
                        <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                      </Tooltip>
                    )}
                    <Typography
                      variant="body2"
                      fontWeight={isLeader ? 700 : 400}
                      color={isLeader ? 'success.main' : 'text.primary'}
                      data-testid={isLeader ? `leader-${metric.key}` : undefined}
                    >
                      {isUnavailable ? 'Unavailable' : value === null ? '—' : metric.format(value)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
