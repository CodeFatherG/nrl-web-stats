import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import { computeGradientColor, rowMinMax } from '../utils/gradientCell';
import type { PlayerComparisonData, SeasonStatsSnapshot } from '../views/CompareView';

export type StatGroup = 'NRL' | 'SC';

export interface StatColDef {
  key: keyof SeasonStatsSnapshot;
  label: string;
  fullLabel: string;
  format?: (v: number) => string;
  higherIsBetter: boolean;
  group: StatGroup;
}

const fmt0 = (v: number) => Math.round(v).toString();
const fmt1 = (v: number) => v.toFixed(1);
const fmtPrice = (v: number) => `$${(v / 1000).toFixed(0)}k`;

export const STAT_COLS: StatColDef[] = [
  // SC first
  { key: 'scSeasonTotal',          label: 'SC Tot',   fullLabel: 'SC Season Total',            format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgScScore',             label: 'SC Avg',   fullLabel: 'SC Average',                 format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'latestPrice',            label: 'Price',    fullLabel: 'Price',                      format: fmtPrice, higherIsBetter: false, group: 'SC' },
  { key: 'latestBreakEven',        label: 'BE',       fullLabel: 'Break Even',                 format: fmt0,     higherIsBetter: false, group: 'SC' },
  { key: 'avgScoringPts',          label: 'Sc Avg',   fullLabel: 'Scoring Avg (per game)',     format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'totalScoringPts',        label: 'Sc Tot',   fullLabel: 'Scoring Total',              format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgCreatePts',           label: 'Cr Avg',   fullLabel: 'Create Avg (per game)',      format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'totalCreatePts',         label: 'Cr Tot',   fullLabel: 'Create Total',               format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgEvadePts',            label: 'Ev Avg',   fullLabel: 'Evade Avg (per game)',       format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'totalEvadePts',          label: 'Ev Tot',   fullLabel: 'Evade Total',                format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgBasePts',             label: 'Bs Avg',   fullLabel: 'Base Avg (per game)',        format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'totalBasePts',           label: 'Bs Tot',   fullLabel: 'Base Total',                 format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgDefencePts',          label: 'Df Avg',   fullLabel: 'Defence Avg (per game)',     format: fmt1,     higherIsBetter: true,  group: 'SC' },
  { key: 'totalDefencePts',        label: 'Df Tot',   fullLabel: 'Defence Total',              format: fmt0,     higherIsBetter: true,  group: 'SC' },
  { key: 'avgNegativePts',         label: 'Neg Avg',  fullLabel: 'Negative Avg (per game)',    format: fmt1,     higherIsBetter: false, group: 'SC' },
  { key: 'totalNegativePts',       label: 'Neg Tot',  fullLabel: 'Negative Total',             format: fmt0,     higherIsBetter: false, group: 'SC' },
  // NRL
  { key: 'gamesPlayed',            label: 'GP',       fullLabel: 'Games Played',               format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'avgMinutesPlayed',       label: 'Avg Min',  fullLabel: 'Avg Minutes Played',         format: fmt1, higherIsBetter: true,  group: 'NRL' },
  { key: 'fantasyPointsTotal',     label: 'Fant',     fullLabel: 'Fantasy Points',             format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalTries',             label: 'Tries',    fullLabel: 'Tries',                      format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'tryAssists',             label: 'TA',       fullLabel: 'Try Assists',                format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalGoals',             label: 'Goals',    fullLabel: 'Goals',                      format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalFieldGoals',        label: 'FG',       fullLabel: 'Field Goals',                format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalPoints',            label: 'Pts',      fullLabel: 'Points',                     format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalAllRuns',           label: 'Runs',     fullLabel: 'Total Runs',                 format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalRunMetres',         label: 'Run M',    fullLabel: 'Run Metres',                 format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalHitUps',            label: 'HitUps',   fullLabel: 'Hit Ups',                    format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalHitUpRunMetres',    label: 'HU M',     fullLabel: 'Hit Up Run Metres',          format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalPostContactMetres', label: 'PC M',     fullLabel: 'Post Contact Metres',        format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalTackleBreaks',      label: 'TB',       fullLabel: 'Tackle Breaks',              format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalLineBreaks',        label: 'LB',       fullLabel: 'Line Breaks',                format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'lineBreakAssists',       label: 'LBA',      fullLabel: 'Line Break Assists',         format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalOffloads',          label: 'Offld',    fullLabel: 'Offloads',                   format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalEffectiveOffloads', label: 'Eff Off',  fullLabel: 'Effective Offloads',         format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalReceipts',          label: 'Rec',      fullLabel: 'Receipts',                   format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalPasses',            label: 'Pass',     fullLabel: 'Passes',                     format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'dummyHalfRuns',          label: 'DHR',      fullLabel: 'Dummy Half Runs',            format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'dummyHalfRunMetres',     label: 'DHM',      fullLabel: 'Dummy Half Run Metres',      format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalRunsOver8m',        label: '>8m',      fullLabel: 'Runs Over 8m',               format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalRunsUnder8m',       label: '<8m',      fullLabel: 'Runs Under 8m',              format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalTacklesMade',       label: 'Tckls',    fullLabel: 'Tackles Made',               format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalMissedTackles',     label: 'MT',       fullLabel: 'Missed Tackles',             format: fmt0, higherIsBetter: false, group: 'NRL' },
  { key: 'totalOneOnOneSteal',     label: '1v1 W',    fullLabel: '1-on-1 Steal',               format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalTrySaves',          label: 'TS',       fullLabel: 'Try Saves',                  format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalInterceptions',     label: 'Int',      fullLabel: 'Interceptions',              format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalKicks',             label: 'Kicks',    fullLabel: 'Kicks',                      format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalKickMetres',        label: 'KM',       fullLabel: 'Kick Metres',                format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalKickReturnMetres',  label: 'KR M',     fullLabel: 'Kick Return Metres',         format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalBombKicks',         label: 'Bomb',     fullLabel: 'Bomb Kicks',                 format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalGrubberKicks',      label: 'Grub',     fullLabel: 'Grubber Kicks',              format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalFortyTwentyKicks',  label: '40/20',    fullLabel: '40/20 Kicks',                format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalKickRegatherBreak', label: 'KRB',      fullLabel: 'Kick Regather Break',        format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalLastTouch',         label: 'LT',       fullLabel: 'Last Touch',                 format: fmt0, higherIsBetter: true,  group: 'NRL' },
  { key: 'totalErrors',            label: 'Err',      fullLabel: 'Errors',                     format: fmt0, higherIsBetter: false, group: 'NRL' },
  { key: 'totalPenalties',         label: 'Pen',      fullLabel: 'Penalties',                  format: fmt0, higherIsBetter: false, group: 'NRL' },
  { key: 'totalSinBins',           label: 'SB',       fullLabel: 'Sin Bins',                   format: fmt0, higherIsBetter: false, group: 'NRL' },
  { key: 'totalOnReport',          label: 'OR',       fullLabel: 'On Report',                  format: fmt0, higherIsBetter: false, group: 'NRL' },
];

export const SC_COLS  = STAT_COLS.filter(c => c.group === 'SC');
export const NRL_COLS = STAT_COLS.filter(c => c.group === 'NRL');

interface CompareSeasonStatsTableProps {
  players: PlayerComparisonData[];
  cols?: StatColDef[];
}

function getStatValue(player: PlayerComparisonData, key: keyof SeasonStatsSnapshot): number | null {
  if (!player.seasonStats) return null;
  const v = player.seasonStats[key];
  return typeof v === 'number' ? v : null;
}

export function CompareSeasonStatsTable({ players, cols = STAT_COLS }: CompareSeasonStatsTableProps) {
  const stickyLabel = {
    position: 'sticky' as const,
    left: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderColor: 'divider',
  };

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
        '& tbody tr:hover .sticky-stat-label': {
          bgcolor: 'action.selected',
        },
        '& tbody tr:hover td:not(.sticky-stat-label)': {
          boxShadow: 'inset 0 0 0 9999px rgba(0, 0, 0, 0.08)',
        },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell
              sx={{
                ...stickyLabel,
                zIndex: 4,
                fontWeight: 700,
                minWidth: { xs: 80, sm: 140 },
              }}
            >
              Stat
            </TableCell>
            {players.map(player => (
              <TableCell
                key={player.playerId}
                align="right"
                sx={{
                  minWidth: { xs: 70, sm: 120 },
                  maxWidth: { xs: 100, sm: 'none' },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <Tooltip title={player.playerName} placement="top" arrow>
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: 'inherit' }}>
                    {player.playerName}
                  </Typography>
                </Tooltip>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {cols.map(col => {
            const values = players.map(p => getStatValue(p, col.key));
            const range = rowMinMax(values);

            return (
              <TableRow key={col.key} hover>
                <Tooltip title={col.fullLabel} placement="right" arrow>
                  <TableCell
                    className="sticky-stat-label"
                    sx={{
                      ...stickyLabel,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      minWidth: { xs: 80, sm: 140 },
                    }}
                  >
                    {col.label}
                  </TableCell>
                </Tooltip>
                {players.map((player, i) => {
                  const val = values[i] ?? null;
                  const bg = range !== null && val !== null
                    ? computeGradientColor(val, range.min, range.max, col.higherIsBetter)
                    : undefined;
                  return (
                    <TableCell
                      key={player.playerId}
                      align="right"
                      style={{ backgroundColor: bg }}
                      data-testid={`cell-${col.key}-${player.playerId}`}
                    >
                      {val === null ? '—' : (col.format ?? String)(val)}
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
