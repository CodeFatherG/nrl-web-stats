import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useAppContext } from '../hooks/useAppContext';
import {
  usePlayerQuery,
  usePlayerSupercoachQuery,
  usePlayerProjectionQuery,
  usePlayerInjuryHistoryQuery,
} from '../hooks/usePlayerQuery';
import { useTeamScheduleQuery } from '../hooks/useTeamQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { StatCard } from '../components/shared/StatCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { ScoreBarChart } from '../components/charts/ScoreBarChart';
import { SpikeBandChart } from '../components/charts/SpikeBandChart';
import { getContextualProjection } from '../services/api';
import type { PlayerPerformanceDetail } from '../types';
import { Link as RouterLink } from 'react-router-dom';

// ─── row types ────────────────────────────────────────────────────────────────

type ContextualRoundRow = {
  round: number;
  opponent: string;
  isHome: boolean;
  baseTotal: number;
  baseFloor: number;
  baseCeiling: number;
  adjTotal: number;
  adjFloor: number;
  adjCeiling: number;
  multiplier: number;
};

type PlayerRoundRow = PlayerPerformanceDetail & {
  sc: number | null;
  scScoring: number | null;
  scCreate: number | null;
  scEvade: number | null;
  scBase: number | null;
  scDefence: number | null;
  scNegative: number | null;
  projTotal: number | null;
  projFloor: number | null;
  projSpike: number | null;
};

// ─── column helpers ───────────────────────────────────────────────────────────

const pct = (v: number) => v.toFixed(1);
const dec = (v: number) => v.toFixed(1);

function col(
  key: keyof PlayerRoundRow,
  label: string,
  groupLabel: string,
  opts: { format?: (v: number) => string } = {}
) {
  return {
    key: key as string,
    label,
    groupLabel,
    align: 'right' as const,
    sortable: true,
    getValue: (r: PlayerRoundRow) => r[key] as number | null,
    format: opts.format,
  };
}

const COLUMNS = [
  // Match context — sticky
  {
    key: 'round', label: 'Rd', groupLabel: 'Match',
    sticky: true, align: 'center' as const, sortable: true,
    getValue: (r: PlayerRoundRow) => r.round,
    renderCell: (r: PlayerRoundRow) => (
      <Typography variant="inherit" fontWeight={600}>R{r.round}</Typography>
    ),
  },
  {
    key: 'opponentTeamCode', label: 'Opp', groupLabel: 'Match',
    align: 'center' as const, sortable: false,
    getValue: (r: PlayerRoundRow) => r.opponentTeamCode ?? '',
    renderCell: (r: PlayerRoundRow) => (
      <Typography variant="inherit">{r.opponentTeamCode ?? '—'}</Typography>
    ),
  },
  // SC score + categories
  {
    key: 'sc', label: 'SC', groupLabel: 'Supercoach',
    align: 'right' as const, sortable: true,
    getValue: (r: PlayerRoundRow) => r.sc,
    renderCell: (r: PlayerRoundRow) => (
      <Typography variant="inherit" fontWeight={700}>{r.sc ?? '—'}</Typography>
    ),
  },
  col('scScoring', 'Score', 'Supercoach'),
  col('scCreate', 'Create', 'Supercoach'),
  col('scEvade', 'Evade', 'Supercoach'),
  col('scBase', 'Base', 'Supercoach'),
  col('scDefence', 'Def', 'Supercoach'),
  col('scNegative', 'Neg', 'Supercoach'),
  // Per-game projections
  col('projTotal', 'Proj', 'Projection'),
  col('projFloor', 'Floor', 'Projection'),
  col('projSpike', 'Spike', 'Projection'),
  // Base stats
  col('minutesPlayed', 'Mins', 'Base'),
  col('stintOne', 'S1', 'Base'),
  // Scoring
  col('tries', 'T', 'Scoring'),
  col('tryAssists', 'TA', 'Scoring'),
  col('goals', 'G', 'Scoring'),
  col('goalConversionRate', 'G%', 'Scoring', { format: pct }),
  col('conversions', 'Conv', 'Scoring'),
  col('conversionAttempts', 'ConvA', 'Scoring'),
  col('penaltyGoals', 'PG', 'Scoring'),
  col('fieldGoals', 'FG', 'Scoring'),
  col('onePointFieldGoals', '1FG', 'Scoring'),
  col('twoPointFieldGoals', '2FG', 'Scoring'),
  col('points', 'Pts', 'Scoring'),
  // Running
  col('allRuns', 'Runs', 'Running'),
  col('allRunMetres', 'RunM', 'Running'),
  col('hitUps', 'HU', 'Running'),
  col('hitUpRunMetres', 'HUM', 'Running'),
  col('lineEngagedRuns', 'LE', 'Running'),
  col('postContactMetres', 'PCM', 'Running'),
  col('lineBreaks', 'LB', 'Running'),
  col('lineBreakAssists', 'LBA', 'Running'),
  col('tackleBreaks', 'TB', 'Running'),
  col('offloads', 'Off', 'Running'),
  col('dummyHalfRuns', 'DH', 'Running'),
  col('dummyHalfRunMetres', 'DHM', 'Running'),
  // Passing
  col('receipts', 'Rec', 'Passing'),
  col('passes', 'Pass', 'Passing'),
  col('passesToRunRatio', 'P:R', 'Passing', { format: dec }),
  col('dummyPasses', 'DP', 'Passing'),
  // Kicking
  col('kicks', 'K', 'Kicking'),
  col('kickMetres', 'KM', 'Kicking'),
  col('kickReturnMetres', 'KRM', 'Kicking'),
  col('kicksDefused', 'KD', 'Kicking'),
  col('kicksDead', 'Dead', 'Kicking'),
  col('bombKicks', 'BK', 'Kicking'),
  col('grubberKicks', 'GK', 'Kicking'),
  col('crossFieldKicks', 'XK', 'Kicking'),
  col('forcedDropOutKicks', 'FDO', 'Kicking'),
  col('fortyTwentyKicks', '40/20', 'Kicking'),
  col('twentyFortyKicks', '20/40', 'Kicking'),
  // Defence
  col('tacklesMade', 'Tkl', 'Defence'),
  col('missedTackles', 'MT', 'Defence'),
  col('ineffectiveTackles', 'IT', 'Defence'),
  col('tackleEfficiency', 'TE%', 'Defence', { format: pct }),
  col('intercepts', 'Int', 'Defence'),
  col('oneOnOneSteal', '1v1W', 'Defence'),
  col('oneOnOneLost', '1v1L', 'Defence'),
  // Errors
  col('errors', 'Err', 'Errors'),
  col('handlingErrors', 'HE', 'Errors'),
  col('penalties', 'Pen', 'Errors'),
  col('ruckInfringements', 'RI', 'Errors'),
  col('offsideWithinTenMetres', 'OS', 'Errors'),
  col('onReport', 'OR', 'Errors'),
  col('sinBins', 'SB', 'Errors'),
  col('sendOffs', 'SO', 'Errors'),
  // PTB
  col('playTheBallTotal', 'PTB', 'PTB'),
  col('playTheBallAverageSpeed', 'PTBSpd', 'PTB', { format: dec }),
  // Supplementary
  col('lastTouch', 'LT', 'Supp'),
  col('missedGoals', 'MG', 'Supp'),
  col('missedFieldGoals', 'MFG', 'Supp'),
  col('effectiveOffloads', 'EO', 'Supp'),
  col('ineffectiveOffloads', 'IO', 'Supp'),
  col('runsOver8m', 'R8+', 'Supp'),
  col('runsUnder8m', 'R<8', 'Supp'),
  col('trySaves', 'TS', 'Supp'),
  col('kickRegatherBreak', 'KRB', 'Supp'),
  col('heldUpInGoal', 'HIG', 'Supp'),
  col('price', 'Price', 'Supp'),
  col('breakEven', 'BE', 'Supp'),
];

// ─── upcoming projections columns ────────────────────────────────────────────

const CONTEXTUAL_COLUMNS = [
  {
    key: 'round', label: 'Rd', groupLabel: 'Game',
    sticky: true, align: 'center' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.round,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit" fontWeight={600}>R{r.round}</Typography>
    ),
  },
  {
    key: 'opponent', label: 'Opp', groupLabel: 'Game',
    align: 'center' as const,
    getValue: (r: ContextualRoundRow) => r.opponent,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.opponent}</Typography>
    ),
  },
  {
    key: 'isHome', label: 'H/A', groupLabel: 'Game',
    align: 'center' as const,
    getValue: (r: ContextualRoundRow) => r.isHome ? 1 : 0,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit" color={r.isHome ? 'success.main' : 'text.secondary'}>
        {r.isHome ? 'H' : 'A'}
      </Typography>
    ),
  },
  {
    key: 'baseTotal', label: 'Base', groupLabel: 'Base Projection',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.baseTotal,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.baseTotal.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'baseFloor', label: 'Floor', groupLabel: 'Base Projection',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.baseFloor,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.baseFloor.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'baseCeiling', label: 'Ceil', groupLabel: 'Base Projection',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.baseCeiling,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.baseCeiling.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'adjTotal', label: 'Adj', groupLabel: 'Adjusted (vs Opponent)',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.adjTotal,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit" fontWeight={700}>{r.adjTotal.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'adjFloor', label: 'Floor', groupLabel: 'Adjusted (vs Opponent)',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.adjFloor,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.adjFloor.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'adjCeiling', label: 'Ceil', groupLabel: 'Adjusted (vs Opponent)',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.adjCeiling,
    renderCell: (r: ContextualRoundRow) => (
      <Typography variant="inherit">{r.adjCeiling.toFixed(1)}</Typography>
    ),
  },
  {
    key: 'multiplier', label: 'Mult', groupLabel: 'Adjusted (vs Opponent)',
    align: 'right' as const, sortable: true,
    getValue: (r: ContextualRoundRow) => r.multiplier,
    renderCell: (r: ContextualRoundRow) => {
      const delta = (r.multiplier - 1) * 100;
      const sign = delta >= 0 ? '+' : '';
      return (
        <Typography variant="inherit" color={delta >= 0 ? 'success.main' : 'error.main'}>
          {sign}{delta.toFixed(0)}%
        </Typography>
      );
    },
  },
];

// ─── injury table columns ─────────────────────────────────────────────────────

const INJURY_COLUMNS = [
  { key: 'injury', label: 'Injury', align: 'left' as const,
    renderCell: (e: { injury: string }) => <Typography variant="caption">{e.injury}</Typography> },
  { key: 'expectedReturn', label: 'Expected Return', align: 'left' as const,
    renderCell: (e: { expectedReturn: string }) => <Typography variant="caption">{e.expectedReturn}</Typography> },
  { key: 'startDate', label: 'Start', align: 'left' as const, hideOnMobile: true,
    renderCell: (e: { startDate: string }) => <Typography variant="caption">{e.startDate}</Typography> },
];

// ─── main view ────────────────────────────────────────────────────────────────

export function PlayerDetailView() {
  const { id } = useParams<{ id: string }>();
  const { currentYear } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);
  const [tab, setTab] = useState(0);

  const playerQuery = usePlayerQuery(id ?? '');
  const scQuery = usePlayerSupercoachQuery(year, id ?? '');
  const projQuery = usePlayerProjectionQuery(year, id ?? '');
  const injuryQuery = usePlayerInjuryHistoryQuery(id ?? '');

  const teamCode = playerQuery.data?.teamCode ?? '';
  const scheduleQuery = useTeamScheduleQuery(year, teamCode);

  // Remaining fixtures (not bye, not complete, has opponent)
  const remainingFixtures = useMemo(() => {
    if (!scheduleQuery.data) return [];
    return scheduleQuery.data.schedule.filter(
      f => !f.isBye && !f.isComplete && f.opponent
    );
  }, [scheduleQuery.data]);

  // Fan-out contextual projection per upcoming opponent
  const contextualQueries = useQueries({
    queries: remainingFixtures.map(f => ({
      queryKey: ['contextualProj', year, id, f.opponent],
      queryFn: () => getContextualProjection(year, id!, f.opponent!),
      enabled: !!id && !!f.opponent,
    })),
  });

  // Build upcoming projection rows
  const upcomingRows = useMemo<ContextualRoundRow[]>(() => {
    return remainingFixtures.flatMap((f, i) => {
      const q = contextualQueries[i];
      if (!q?.data) return [];
      return [{
        round: f.round,
        opponent: f.opponent!,
        isHome: f.isHome,
        baseTotal: q.data.baseProjection.total,
        baseFloor: q.data.baseProjection.floor,
        baseCeiling: q.data.baseProjection.ceiling,
        adjTotal: q.data.adjustedProjection.total,
        adjFloor: q.data.adjustedProjection.floor,
        adjCeiling: q.data.adjustedProjection.ceiling,
        multiplier: q.data.adjustments.opponent.multiplier,
      }];
    });
  }, [remainingFixtures, contextualQueries]);

  // Build merged per-round rows (stats + SC + projection)
  const roundRows = useMemo<PlayerRoundRow[]>(() => {
    const performances = playerQuery.data?.seasons[String(year)]?.performances ?? [];
    const scByRound = new Map((scQuery.data?.matches ?? []).map(m => [m.round, m]));
    const projByRound = new Map((projQuery.data?.games ?? []).map(g => [g.round, g]));

    return performances.map(perf => {
      const scMatch = scByRound.get(perf.round) ?? null;
      const projGame = projByRound.get(perf.round) ?? null;
      return {
        ...perf,
        sc: scMatch?.totalScore ?? null,
        scScoring: scMatch?.categoryTotals.scoring ?? null,
        scCreate: scMatch?.categoryTotals.create ?? null,
        scEvade: scMatch?.categoryTotals.evade ?? null,
        scBase: scMatch?.categoryTotals.base ?? null,
        scDefence: scMatch?.categoryTotals.defence ?? null,
        scNegative: scMatch?.categoryTotals.negative ?? null,
        projTotal: projGame?.totalScore ?? null,
        projFloor: projGame?.floorScore ?? null,
        projSpike: projGame?.spikeScore ?? null,
      };
    });
  }, [playerQuery.data, scQuery.data, projQuery.data, year]);

  // SC score chart data
  const scScores = useMemo(() =>
    (scQuery.data?.matches ?? []).map(m => ({
      round: m.round,
      score: m.totalScore,
      isComplete: m.isComplete,
      opponent: m.opponent,
    })),
    [scQuery.data]
  );

  if (playerQuery.isLoading) return <SkeletonPage variant="player-header" />;

  if (playerQuery.isError || !playerQuery.data) {
    return (
      <Box>
        <Alert severity="warning" sx={{ mb: 2 }}>Player not found.</Alert>
        <Button component={RouterLink} to="/players" variant="outlined">Back to Players</Button>
      </Box>
    );
  }

  const player = playerQuery.data;
  const sc = scQuery.data;
  const proj = projQuery.data;
  const injuryHistory = injuryQuery.data?.entries ?? [];

  return (
    <Box>
      <PageHeader
        title={player.name}
        subtitle={`${player.teamCode} · ${player.position}`}
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => navigate(-1)} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CompareArrowsIcon />}
              onClick={() => navigate(`/compare/${player.id}`)}
            >
              Compare
            </Button>
          </Box>
        }
      />

      {/* Profile header */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip label={player.teamCode} size="small" variant="outlined" />
          <Chip label={player.position} size="small" variant="outlined" />
          {sc && <Chip label={`SC Avg: ${sc.seasonAverage.toFixed(1)}`} size="small" color="primary" />}
          {sc && <Chip label={`${sc.matchesPlayed} games`} size="small" variant="outlined" />}
        </Box>
      </Paper>

      {/* Stat snapshot */}
      {sc && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, mb: 2 }}>
          <StatCard label="SC Average" value={sc.seasonAverage.toFixed(1)} />
          <StatCard label="SC Total" value={String(sc.seasonTotal)} />
          <StatCard label="Games Played" value={String(sc.matchesPlayed)} />
          {proj && <StatCard label="Projected" value={proj.projectedTotal.toFixed(0)} />}
          {proj && <StatCard label="Floor" value={proj.projectedFloor.toFixed(0)} />}
          {proj && <StatCard label="Ceiling" value={proj.projectedCeiling.toFixed(0)} />}
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stats" />
        <Tab label="Projections" />
        <Tab label="Injury History" />
      </Tabs>

      {tab === 0 && (
        <Box>
          {scScores.length > 0 && (
            <SectionCard title="SC Trend" sx={{ mb: 2 }}>
              <ScoreBarChart data={scScores} average={sc?.seasonAverage} height={160} />
            </SectionCard>
          )}
          {upcomingRows.length > 0 && (
            <SectionCard title="Upcoming Game Projections" sx={{ mb: 2 }}>
              <DataTable
                columns={CONTEXTUAL_COLUMNS}
                rows={upcomingRows}
                getRowKey={r => `${r.round}-${r.opponent}`}
                stickyHeader
                defaultSortKey="round"
                defaultSortDir="asc"
                dense
                emptyMessage="No upcoming games."
              />
            </SectionCard>
          )}
          <SectionCard title="Per-Round Stats">
            <DataTable
              columns={COLUMNS}
              rows={roundRows}
              getRowKey={r => r.matchId}
              stickyHeader
              maxHeight="70vh"
              defaultSortKey="round"
              defaultSortDir="asc"
              dense
              emptyMessage="No stats available for this season."
              onRowClick={r => navigate(`/match/${r.matchId}`)}
            />
          </SectionCard>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          {proj ? (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2, mb: 2 }}>
                <StatCard label="Projected Total" value={proj.projectedTotal.toFixed(1)} />
                <StatCard label="Projected Floor" value={proj.projectedFloor.toFixed(1)} />
                <StatCard label="Projected Ceiling" value={proj.projectedCeiling.toFixed(1)} />
                <StatCard label="Floor Mean" value={proj.floorMean.toFixed(1)} />
                <StatCard label="Spike Mean" value={proj.spikeMean.toFixed(1)} />
              </Box>
              {proj.lowSampleWarning && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Low sample size — projections may be unreliable.
                </Alert>
              )}
              <SectionCard title="Spike Distribution" sx={{ mb: 2 }}>
                <SpikeBandChart distribution={proj.spikeDistribution} height={36} />
              </SectionCard>
            </>
          ) : (
            <Alert severity="info">No projection data available for {year}.</Alert>
          )}
        </Box>
      )}

      {tab === 2 && (
        <Box>
          {injuryHistory.length > 0 ? (
            <SectionCard title="Injury History">
              <DataTable
                columns={INJURY_COLUMNS}
                rows={injuryHistory}
                getRowKey={e => `${e.id}`}
                emptyMessage="No injury history."
              />
            </SectionCard>
          ) : (
            <Alert severity="info">No injury history recorded.</Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
