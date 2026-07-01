// SeasonStatsSnapshot and PlayerComparisonData are exported for use by comparison table components
export interface SeasonStatsSnapshot {
  gamesPlayed: number;
  totalTries: number;
  totalRunMetres: number;
  totalTacklesMade: number;
  totalTackleBreaks: number;
  totalLineBreaks: number;
  totalPoints: number;
  avgScScore: number;
  totalKicks: number;
  totalKickMetres: number;
  totalOffloads: number;
  totalErrors: number;
  totalPenalties: number;
  totalMissedTackles: number;
  totalInterceptions: number;
  avgMinutesPlayed: number;
  // Extended fields (already in PlayerPerformanceDetail)
  tryAssists: number;
  lineBreakAssists: number;
  dummyHalfRuns: number;
  dummyHalfRunMetres: number;
  latestPrice: number | null;
  latestBreakEven: number | null;
  // Additional NRL stats
  totalAllRuns: number;
  totalHitUps: number;
  totalHitUpRunMetres: number;
  totalPostContactMetres: number;
  totalGoals: number;
  totalFieldGoals: number;
  totalPasses: number;
  totalReceipts: number;
  totalSinBins: number;
  totalOnReport: number;
  totalBombKicks: number;
  totalGrubberKicks: number;
  totalFortyTwentyKicks: number;
  totalKickReturnMetres: number;
  totalOneOnOneSteal: number;
  fantasyPointsTotal: number;
  // Supplementary NRL stats (null when no data available)
  totalEffectiveOffloads: number | null;
  totalIneffectiveOffloads: number | null;
  totalRunsOver8m: number | null;
  totalRunsUnder8m: number | null;
  totalTrySaves: number | null;
  totalLastTouch: number | null;
  totalKickRegatherBreak: number | null;
  // SC season totals & per-category averages/totals (from sc.matches)
  scSeasonTotal: number;
  avgScoringPts: number;
  totalScoringPts: number;
  avgCreatePts: number;
  totalCreatePts: number;
  avgEvadePts: number;
  totalEvadePts: number;
  avgBasePts: number;
  totalBasePts: number;
  avgDefencePts: number;
  totalDefencePts: number;
  avgNegativePts: number;
  totalNegativePts: number;
}

export interface PlayerComparisonData {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
  scPosition: string | null;
  seasonStats: SeasonStatsSnapshot | null;
  scRounds: Array<{ round: number; totalScore: number | null; opponent: string | null; isComplete: boolean }>;
  sc: import('../services/api').PlayerSeasonSupercoachResponse | null;
  projection: import('../services/api').PlayerProjectionResponse | null;
  projectionError: boolean;
  loading: boolean;
  error: string | null;
}

import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Snackbar from '@mui/material/Snackbar';
import { useAppContext } from '../hooks/useAppContext';
import { useSeasonPlayersQuery } from '../hooks/useSeasonQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { RadarChart } from '../components/charts/RadarChart';
import { ScRadarChart } from '../components/charts/ScRadarChart';
import { CompareSeasonStatsTable, STAT_COLS, SC_COLS, NRL_COLS } from '../components/CompareSeasonStatsTable';
import { CompareRoundScoresTable } from '../components/CompareRoundScoresTable';
import { CompareProjectionsTable } from '../components/CompareProjectionsTable';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { getRadarAxes, getRadarAxesFromSupercoach } from '../utils/positionGroups';
import {
  getPlayer,
  getPlayerSupercoachSeason,
  getPlayerSupercoachProjection,
} from '../services/api';
import type { PlayerPerformanceDetail } from '../types';

function buildSeasonStats(
  performances: PlayerPerformanceDetail[],
  sc: import('../services/api').PlayerSeasonSupercoachResponse | null,
): SeasonStatsSnapshot {
  const completed = performances.filter(p => p.isComplete);
  const sum = (fn: (p: PlayerPerformanceDetail) => number) =>
    completed.reduce((acc, p) => acc + fn(p), 0);

  const latestPerf = [...completed].sort((a, b) => b.round - a.round)[0] ?? null;

  // Supplementary stats: sum non-null values; return null if no game had data
  const suppSum = (fn: (p: PlayerPerformanceDetail) => number | null): number | null => {
    const hasData = completed.some(p => fn(p) !== null);
    return hasData ? completed.reduce((acc, p) => acc + (fn(p) ?? 0), 0) : null;
  };

  const scMatches = sc?.matches ?? [];
  const scN = scMatches.length;
  const catSum = scMatches.reduce(
    (acc, m) => ({
      scoring:  acc.scoring  + m.categoryTotals.scoring,
      create:   acc.create   + m.categoryTotals.create,
      evade:    acc.evade    + m.categoryTotals.evade,
      base:     acc.base     + m.categoryTotals.base,
      defence:  acc.defence  + m.categoryTotals.defence,
      negative: acc.negative + m.categoryTotals.negative,
    }),
    { scoring: 0, create: 0, evade: 0, base: 0, defence: 0, negative: 0 },
  );

  return {
    gamesPlayed: completed.length,
    totalTries: sum(p => p.tries),
    totalRunMetres: sum(p => p.allRunMetres),
    totalTacklesMade: sum(p => p.tacklesMade),
    totalTackleBreaks: sum(p => p.tackleBreaks),
    totalLineBreaks: sum(p => p.lineBreaks),
    totalPoints: sum(p => p.points),
    avgScScore: sc?.seasonAverage ?? 0,
    totalKicks: sum(p => p.kicks),
    totalKickMetres: sum(p => p.kickMetres),
    totalOffloads: sum(p => p.offloads),
    totalErrors: sum(p => p.errors),
    totalPenalties: sum(p => p.penalties),
    totalMissedTackles: sum(p => p.missedTackles),
    totalInterceptions: sum(p => p.intercepts),
    avgMinutesPlayed: completed.length > 0 ? sum(p => p.minutesPlayed) / completed.length : 0,
    tryAssists: sum(p => p.tryAssists),
    lineBreakAssists: sum(p => p.lineBreakAssists),
    dummyHalfRuns: sum(p => p.dummyHalfRuns),
    dummyHalfRunMetres: sum(p => p.dummyHalfRunMetres),
    latestPrice: latestPerf?.price ?? null,
    latestBreakEven: latestPerf?.breakEven ?? null,
    totalAllRuns: sum(p => p.allRuns),
    totalHitUps: sum(p => p.hitUps),
    totalHitUpRunMetres: sum(p => p.hitUpRunMetres),
    totalPostContactMetres: sum(p => p.postContactMetres),
    totalGoals: sum(p => p.goals),
    totalFieldGoals: sum(p => p.fieldGoals),
    totalPasses: sum(p => p.passes),
    totalReceipts: sum(p => p.receipts),
    totalSinBins: sum(p => p.sinBins),
    totalOnReport: sum(p => p.onReport),
    totalBombKicks: sum(p => p.bombKicks),
    totalGrubberKicks: sum(p => p.grubberKicks),
    totalFortyTwentyKicks: sum(p => p.fortyTwentyKicks),
    totalKickReturnMetres: sum(p => p.kickReturnMetres),
    totalOneOnOneSteal: sum(p => p.oneOnOneSteal),
    fantasyPointsTotal: sum(p => p.fantasyPointsTotal),
    totalEffectiveOffloads: suppSum(p => p.effectiveOffloads),
    totalIneffectiveOffloads: suppSum(p => p.ineffectiveOffloads),
    totalRunsOver8m: suppSum(p => p.runsOver8m),
    totalRunsUnder8m: suppSum(p => p.runsUnder8m),
    totalTrySaves: suppSum(p => p.trySaves),
    totalLastTouch: suppSum(p => p.lastTouch),
    totalKickRegatherBreak: suppSum(p => p.kickRegatherBreak),
    scSeasonTotal:   sc?.seasonTotal ?? 0,
    avgScoringPts:   scN > 0 ? catSum.scoring  / scN : 0,
    totalScoringPts: catSum.scoring,
    avgCreatePts:    scN > 0 ? catSum.create   / scN : 0,
    totalCreatePts:  catSum.create,
    avgEvadePts:     scN > 0 ? catSum.evade    / scN : 0,
    totalEvadePts:   catSum.evade,
    avgBasePts:      scN > 0 ? catSum.base     / scN : 0,
    totalBasePts:    catSum.base,
    avgDefencePts:   scN > 0 ? catSum.defence  / scN : 0,
    totalDefencePts: catSum.defence,
    avgNegativePts:  scN > 0 ? catSum.negative / scN : 0,
    totalNegativePts: catSum.negative,
  };
}

export function CompareView() {
  const { ids } = useParams<{ ids?: string }>();
  const { currentYear } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);
  const [tab, setTab] = useState(0);
  const [snackbar, setSnackbar] = useState('');

  const playerIds = useMemo(() => ids?.split(',').filter(Boolean) ?? [], [ids]);

  const playersQuery = useSeasonPlayersQuery(year);

  const playerQueries = useQueries({
    queries: playerIds.map(pid => ({
      queryKey: ['player', pid],
      queryFn: () => getPlayer(pid),
      throwOnError: false,
    })),
  });

  const scQueries = useQueries({
    queries: playerIds.map(pid => ({
      queryKey: ['playerSupercoach', year, pid],
      queryFn: () => getPlayerSupercoachSeason(year, pid),
      throwOnError: false,
    })),
  });

  const projQueries = useQueries({
    queries: playerIds.map(pid => ({
      queryKey: ['playerProjection', year, pid],
      queryFn: () => getPlayerSupercoachProjection(year, pid),
      throwOnError: false,
    })),
  });

  const players: PlayerComparisonData[] = useMemo(() => {
    return playerIds.map((pid, i) => {
      const pq = playerQueries[i];
      const sq = scQueries[i];
      const prq = projQueries[i];

      const isLoading = pq?.isLoading || sq?.isLoading || prq?.isLoading;
      const error = pq?.error ? String(pq.error) : null;

      if (!pq?.data) {
        return {
          playerId: pid,
          playerName: pid,
          teamCode: '',
          position: '',
          scPosition: null,
          seasonStats: null,
          scRounds: [],
          sc: null,
          projection: null,
          projectionError: false,
          loading: isLoading ?? true,
          error,
        };
      }

      const playerData = pq.data;
      const scData = sq?.data ?? null;
      const projData = prq?.data ?? null;
      const performances = playerData.seasons[String(year)]?.performances ?? [];

      return {
        playerId: pid,
        playerName: playerData.name,
        teamCode: playerData.teamCode,
        position: playerData.position,
        scPosition: playerData.scPosition ?? null,
        seasonStats: buildSeasonStats(performances, scData),
        scRounds: (scData?.matches ?? []).map(m => ({
          round: m.round,
          totalScore: m.totalScore,
          opponent: m.opponent,
          isComplete: true,
        })),
        sc: scData,
        projection: projData,
        projectionError: !!prq?.error,
        loading: isLoading ?? false,
        error,
      };
    });
  }, [playerIds, playerQueries, scQueries, projQueries, year]);

  const isLoading = playerQueries.some(q => q.isLoading);

  const handleAddPlayer = (pid: string) => {
    if (playerIds.includes(pid)) {
      setSnackbar('Player already added.');
      return;
    }
    if (playerIds.length >= 6) {
      setSnackbar('Maximum 6 players for comparison.');
      return;
    }
    navigate(`/compare/${[...playerIds, pid].join(',')}`);
  };

  const handleRemovePlayer = (pid: string) => {
    const remaining = playerIds.filter(p => p !== pid);
    navigate(remaining.length > 0 ? `/compare/${remaining.join(',')}` : '/compare');
  };

  const loadedPlayers = players.filter(p => !p.loading && p.playerName !== p.playerId);

  // Position-aware NRL radar axes — prefer Supercoach positions (lineup-relevant groupings)
  // per player. Players without scPosition fall back to their NRL canonical position so
  // their axes still join the union.
  const nrlAxes = useMemo(
    () => {
      const scInputs: string[] = [];
      const nrlFallbacks: string[] = [];
      for (const p of loadedPlayers) {
        if (p.scPosition) scInputs.push(p.scPosition);
        else if (p.position) nrlFallbacks.push(p.position);
      }
      const scAxes = scInputs.length > 0 ? getRadarAxesFromSupercoach(scInputs) : [];
      const nrlAxesFallback = nrlFallbacks.length > 0 ? getRadarAxes(nrlFallbacks) : [];
      if (scAxes.length === 0) return nrlAxesFallback.length > 0 ? nrlAxesFallback : getRadarAxes([]);
      if (nrlAxesFallback.length === 0) return scAxes;
      // Merge unique axes from both
      const merged = [...scAxes];
      for (const a of nrlAxesFallback) {
        if (!merged.some(m => m.key === a.key)) merged.push(a);
      }
      return merged;
    },
    [loadedPlayers],
  );

  // Key stats columns — only the axes shown in the radar chart
  const keyStatsCols = useMemo(() => {
    const axisKeys = new Set(nrlAxes.map(a => a.key));
    return STAT_COLS.filter(c => axisKeys.has(c.key));
  }, [nrlAxes]);

  // Build NRL radar data from real season stats
  const nrlRadarData = loadedPlayers.map(p => ({
    name: p.playerName,
    teamCode: p.teamCode,
    stats: Object.fromEntries(
      nrlAxes.map(axis => [axis.key, (p.seasonStats as Record<string, number> | null)?.[axis.key] ?? 0])
    ) as Record<string, number>,
  }));

  return (
    <Box>
      <PageHeader
        title="Compare Players"
        subtitle={`${loadedPlayers.length} player${loadedPlayers.length !== 1 ? 's' : ''} selected`}
      />

      {/* Search + selected chips */}
      <Box sx={{ mb: 2 }}>
        <PlayerSearchInput
          allPlayers={playersQuery.data?.players ?? []}
          excludeIds={playerIds}
          onSelect={pid => handleAddPlayer(pid)}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {loadedPlayers.map(p => (
            <Chip
              key={p.playerId}
              label={`${p.playerName} (${p.teamCode})`}
              onDelete={() => handleRemovePlayer(p.playerId)}
              size="small"
            />
          ))}
        </Box>
      </Box>

      {isLoading && <SkeletonPage variant="cards" />}

      {!isLoading && loadedPlayers.length === 0 && (
        <Alert severity="info">Search for players above to start comparing.</Alert>
      )}

      {!isLoading && loadedPlayers.length > 0 && (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Overview" />
            <Tab label="Stats" />
            <Tab label="Scores" />
            <Tab label="Projections" />
          </Tabs>

          {/* Overview: two radar charts side-by-side on wide screens */}
          {tab === 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2,
              }}
            >
              <SectionCard title="NRL Stats">
                <RadarChart players={nrlRadarData} axes={nrlAxes} height={320} />
              </SectionCard>
              <SectionCard title="Supercoach Stats">
                <ScRadarChart players={loadedPlayers} height={320} />
              </SectionCard>
            </Box>
          )}

          {/* Stats: three focused tables */}
          {tab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <SectionCard title="Key Stats">
                <CompareSeasonStatsTable players={loadedPlayers} cols={keyStatsCols} />
              </SectionCard>
              <SectionCard title="Supercoach">
                <CompareSeasonStatsTable players={loadedPlayers} cols={SC_COLS} />
              </SectionCard>
              <SectionCard title="NRL Stats">
                <CompareSeasonStatsTable players={loadedPlayers} cols={NRL_COLS} />
              </SectionCard>
            </Box>
          )}

          {/* Scores: comparative round-by-round table */}
          {tab === 2 && (
            <CompareRoundScoresTable players={loadedPlayers} />
          )}

          {/* Projections: detailed projection metrics + upcoming row */}
          {tab === 3 && (
            <CompareProjectionsTable players={loadedPlayers} />
          )}
        </>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Box>
  );
}
