import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
} from '@mui/material';
import { computeGradientColor, rowMinMax } from '../utils/gradientCell';
import type { PlayerComparisonData } from '../views/CompareView';
import type { PlayerProjectionResponse } from '../services/api';

interface CompareProjectionsTableProps {
  players: PlayerComparisonData[];
}

interface ProjectionMetricRow {
  key: keyof PlayerProjectionResponse;
  label: string;
  format?: (v: number) => string;
  higherIsBetter: boolean;
}

const fmt1 = (v: number) => v.toFixed(1);
const fmt0 = (v: number) => Math.round(v).toString();
const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;

const PROJECTION_ROWS: ProjectionMetricRow[] = [
  { key: 'projectedTotal',   label: 'Projected Score',   format: fmt1, higherIsBetter: true  },
  { key: 'projectedFloor',   label: 'Projected Floor',   format: fmt0, higherIsBetter: true  },
  { key: 'projectedCeiling', label: 'Projected Ceiling', format: fmt0, higherIsBetter: true  },
  { key: 'floorMean',        label: 'Floor Mean',        format: fmt1, higherIsBetter: true  },
  { key: 'spikeMean',        label: 'Spike Mean',        format: fmt1, higherIsBetter: true  },
  { key: 'spikeP25',         label: 'Spike P25',         format: fmt0, higherIsBetter: true  },
  { key: 'spikeP75',         label: 'Spike P75',         format: fmt0, higherIsBetter: true  },
  { key: 'spikeP90',         label: 'Spike P90',         format: fmt0, higherIsBetter: true  },
  { key: 'floorCv',          label: 'Floor CV',          format: fmtPct, higherIsBetter: false },
  { key: 'spikeCv',          label: 'Spike CV',          format: fmtPct, higherIsBetter: false },
  { key: 'gamesPlayed',      label: 'Games in Model',    format: fmt0, higherIsBetter: true  },
];

const SPIKE_BAND_ORDER = ['negative', 'nil', 'low', 'moderate', 'high', 'boom'] as const;

function getProjectionValue(proj: PlayerProjectionResponse | null, key: keyof PlayerProjectionResponse): number | null {
  if (!proj || proj.noUsableData) return null;
  const v = proj[key];
  return typeof v === 'number' ? v : null;
}

function getLastCompletedRound(player: PlayerComparisonData): number {
  const completedRounds = player.scRounds
    .filter(r => r.totalScore !== null)
    .map(r => r.round);
  return completedRounds.length > 0 ? Math.max(...completedRounds) : 0;
}

function getUpcomingRoundNumber(players: PlayerComparisonData[]): number | null {
  const roundNumbers = players
    .flatMap(p => {
      const last = getLastCompletedRound(p);
      return (p.projection?.games ?? [])
        .filter(g => g.round > last)
        .map(g => g.round);
    });
  if (roundNumbers.length === 0) return null;
  return Math.min(...roundNumbers);
}

const stickyLabel = {
  position: 'sticky' as const,
  left: 0,
  zIndex: 2,
  bgcolor: 'background.paper',
  borderRight: '1px solid',
  borderColor: 'divider',
};

export function CompareProjectionsTable({ players }: CompareProjectionsTableProps) {
  const upcomingRound = getUpcomingRoundNumber(players);

  // Compute upcoming scores per player
  const upcomingScores = players.map(p => {
    if (!p.projection || p.projection.noUsableData) return null;
    if (upcomingRound === null) return null;
    const game = p.projection.games.find(g => g.round === upcomingRound);
    return game ? game.totalScore : 'bye' as const;
  });

  const upcomingNumeric = upcomingScores.map(s => (typeof s === 'number' ? s : null));
  const upcomingRange = rowMinMax(upcomingNumeric);

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        overflowX: 'auto',
        '& .MuiTableCell-root': {
          px: { xs: 0.5, sm: 1 },
          py: { xs: 0.25, sm: 0.5 },
          fontSize: { xs: '0.68rem', sm: '0.8rem' },
        },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...stickyLabel, zIndex: 4, fontWeight: 700, minWidth: { xs: 100, sm: 160 } }}>
              Metric
            </TableCell>
            {players.map(p => (
              <TableCell key={p.playerId} align="right" sx={{ minWidth: { xs: 56, sm: 120 } }}>
                <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: 'inherit' }}>
                  {p.playerName}
                </Typography>
                {p.projection?.lowSampleWarning && (
                  <Typography variant="caption" color="warning.main" display="block">
                    ⚠ low sample
                  </Typography>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Upcoming round pinned row */}
          {upcomingRound !== null && (
            <TableRow sx={{ bgcolor: 'primary.50', borderBottom: '2px solid', borderColor: 'divider' }}>
              <TableCell sx={{ ...stickyLabel, fontWeight: 700 }}>
                Upcoming: Rd {upcomingRound}
              </TableCell>
              {players.map((p, i) => {
                const val = upcomingScores[i] ?? null;
                const numVal = typeof val === 'number' ? val : null;
                const bg = upcomingRange && numVal !== null
                  ? computeGradientColor(numVal, upcomingRange.min, upcomingRange.max, true)
                  : undefined;

                return (
                  <TableCell
                    key={p.playerId}
                    align="right"
                    style={{ backgroundColor: bg }}
                    sx={{ fontWeight: 600 }}
                    data-testid={`cell-upcoming-${p.playerId}`}
                  >
                    {p.projectionError ? (
                      <Typography variant="caption" color="text.disabled">Unavailable</Typography>
                    ) : val === 'bye' ? (
                      <Typography variant="body2" color="text.disabled" component="span">BYE</Typography>
                    ) : numVal !== null ? (
                      Math.round(numVal)
                    ) : (
                      '—'
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          )}

          {/* Projection metric rows */}
          {PROJECTION_ROWS.map(row => {
            const values = players.map(p =>
              p.projectionError ? null : getProjectionValue(p.projection, row.key)
            );
            const range = rowMinMax(values);

            return (
              <TableRow key={String(row.key)} hover>
                <TableCell sx={{ ...stickyLabel, fontWeight: 500 }}>{row.label}</TableCell>
                {players.map((p, i) => {
                  const val = values[i] ?? null;
                  const bg = range && val !== null
                    ? computeGradientColor(val, range.min, range.max, row.higherIsBetter)
                    : undefined;

                  return (
                    <TableCell
                      key={p.playerId}
                      align="right"
                      style={{ backgroundColor: bg }}
                      data-testid={`cell-${String(row.key)}-${p.playerId}`}
                    >
                      {p.projectionError ? (
                        <Typography variant="caption" color="text.disabled">Unavailable</Typography>
                      ) : val === null ? (
                        '—'
                      ) : (
                        (row.format ?? String)(val)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}

          {/* Spike distribution (categorical — no gradient) */}
          <TableRow>
            <TableCell
              colSpan={players.length + 1}
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
                bgcolor: 'action.hover',
                py: 0.5,
              }}
            >
              Spike Distribution
            </TableCell>
          </TableRow>
          {SPIKE_BAND_ORDER.map(band => (
            <TableRow key={band} hover>
              <TableCell sx={{ ...stickyLabel, fontWeight: 500, textTransform: 'capitalize' }}>{band}</TableCell>
              {players.map(p => {
                if (p.projectionError) {
                  return (
                    <TableCell key={p.playerId} align="right">
                      <Typography variant="caption" color="text.disabled">Unavailable</Typography>
                    </TableCell>
                  );
                }
                const entry = p.projection?.spikeDistribution?.[band];
                return (
                  <TableCell key={p.playerId} align="right">
                    {entry !== undefined ? (
                      <Chip
                        label={`${entry.count} (${(entry.frequency * 100).toFixed(0)}%)`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem' }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
