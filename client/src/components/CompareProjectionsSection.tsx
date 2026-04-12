import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Tooltip,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { PlayerComparisonData } from '../views/CompareView';
import type { SpikeBand, SpikeDistribution } from '../services/api';

interface CompareProjectionsSectionProps {
  players: PlayerComparisonData[];
}

interface ProjectionRowDef {
  key: string;
  label: string;
  getValue: (player: PlayerComparisonData) => number | null;
  format: (v: number) => string;
}

const fmt1 = (v: number) => v.toFixed(1);
const fmt2 = (v: number) => v.toFixed(2);
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtCv = (v: number) => (v === Infinity ? '∞' : v.toFixed(2));

const SPIKE_BANDS: SpikeBand[] = ['negative', 'nil', 'low', 'moderate', 'high', 'boom'];
const BAND_LABELS: Record<SpikeBand, string> = {
  negative: 'Spike: Negative',
  nil: 'Spike: Nil (0–5)',
  low: 'Spike: Low (6–15)',
  moderate: 'Spike: Moderate (16–30)',
  high: 'Spike: High (31–50)',
  boom: 'Spike: Boom (50+)',
};

const PROJECTION_ROWS: ProjectionRowDef[] = [
  {
    key: 'projectedTotal',
    label: 'Projected Score',
    getValue: (p) => p.projection?.projectedTotal ?? null,
    format: fmt1,
  },
  {
    key: 'projectedFloor',
    label: 'Projected Floor',
    getValue: (p) => p.projection?.projectedFloor ?? null,
    format: fmt1,
  },
  {
    key: 'projectedCeiling',
    label: 'Projected Ceiling',
    getValue: (p) => p.projection?.projectedCeiling ?? null,
    format: fmt1,
  },
  {
    key: 'floorMean',
    label: 'Floor Mean',
    getValue: (p) => p.projection?.floorMean ?? null,
    format: fmt1,
  },
  {
    key: 'spikeMean',
    label: 'Spike Mean',
    getValue: (p) => p.projection?.spikeMean ?? null,
    format: fmt1,
  },
  {
    key: 'floorCv',
    label: 'Floor CV',
    getValue: (p) => p.projection?.floorCv ?? null,
    format: fmt2,
  },
  {
    key: 'spikeCv',
    label: 'Spike CV',
    getValue: (p) => {
      const cv = p.projection?.spikeCv;
      return cv === undefined ? null : cv;
    },
    format: fmtCv,
  },
  ...SPIKE_BANDS.map((band) => ({
    key: `spike_${band}`,
    label: BAND_LABELS[band],
    getValue: (p: PlayerComparisonData): number | null => {
      const dist = p.projection?.spikeDistribution as SpikeDistribution | undefined;
      return dist?.[band]?.frequency ?? null;
    },
    format: fmtPct,
  })),
];

export function CompareProjectionsSection({ players }: CompareProjectionsSectionProps) {
  if (players.length === 0) return null;

  const shouldHighlight = players.length >= 2;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Metric</TableCell>
            {players.map((player) => (
              <TableCell key={player.playerId} align="right" sx={{ minWidth: 120 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {player.playerName || player.playerId}
                </Typography>
                {!player.projectionError && (player.projection?.lowSampleWarning ?? false) && (
                  <Tooltip title="Low sample — fewer than 6 eligible games">
                    <WarningAmberIcon
                      sx={{ fontSize: 14, color: 'warning.main', ml: 0.5, verticalAlign: 'middle' }}
                      data-testid={`low-sample-${player.playerId}`}
                    />
                  </Tooltip>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {PROJECTION_ROWS.map((row) => {
            const values = players.map((p) =>
              p.projectionError || p.projection?.noUsableData ? null : row.getValue(p)
            );
            const nonNullValues = values.filter((v): v is number => v !== null && v !== Infinity);
            const maxVal =
              shouldHighlight && nonNullValues.length >= 2 ? Math.max(...nonNullValues) : null;

            return (
              <TableRow key={row.key} hover>
                <TableCell sx={{ fontWeight: 500 }}>{row.label}</TableCell>
                {players.map((player, i) => {
                  if (player.projectionError) {
                    return (
                      <TableCell key={player.playerId} align="right">
                        <Typography variant="body2" color="text.disabled" component="span">
                          Unavailable
                        </Typography>
                      </TableCell>
                    );
                  }
                  if (player.projection?.noUsableData) {
                    return (
                      <TableCell key={player.playerId} align="right">
                        <Typography variant="body2" color="text.disabled" component="span">
                          No data
                        </Typography>
                      </TableCell>
                    );
                  }
                  const val = values[i] ?? null;
                  const isLeader = maxVal !== null && val !== null && val === maxVal;
                  return (
                    <TableCell
                      key={player.playerId}
                      align="right"
                      sx={isLeader ? { bgcolor: 'success.light', fontWeight: 700 } : undefined}
                      data-testid={isLeader ? `leader-${row.key}` : undefined}
                    >
                      {val === null ? '—' : row.format(val)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
