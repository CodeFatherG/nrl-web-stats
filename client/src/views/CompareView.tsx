// Exported for carried-forward comparison components (CompareRoundScoresTable, CompareSeasonStatsTable)
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
  latestPrice: number | null;
  latestBreakEven: number | null;
}

export interface PlayerComparisonData {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
  seasonStats: SeasonStatsSnapshot | null;
  scRounds: Array<{ round: number; totalScore: number | null; opponent: string | null }>;
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
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Snackbar from '@mui/material/Snackbar';
import { useAppContext } from '../hooks/useAppContext';
import { useSeasonPlayersQuery } from '../hooks/useSeasonQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { StatCard } from '../components/shared/StatCard';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { RadarChart } from '../components/charts/RadarChart';
import { ScoreBarChart } from '../components/charts/ScoreBarChart';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import {
  getPlayer,
  getPlayerSupercoachSeason,
  getPlayerSupercoachProjection,
} from '../services/api';

type ComparePlayer = {
  id: string;
  name: string;
  teamCode: string;
  position: string;
  sc: Awaited<ReturnType<typeof getPlayerSupercoachSeason>> | null;
  proj: Awaited<ReturnType<typeof getPlayerSupercoachProjection>> | null;
};

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

  const players: ComparePlayer[] = useMemo(() => {
    return playerIds.map((pid, i) => {
      const pq = playerQueries[i];
      const sq = scQueries[i];
      const prq = projQueries[i];
      if (!pq?.data) return null;
      return {
        id: pid,
        name: pq.data.name,
        teamCode: pq.data.teamCode,
        position: pq.data.position,
        sc: sq?.data ?? null,
        proj: prq?.data ?? null,
      };
    }).filter((p): p is ComparePlayer => p !== null);
  }, [playerIds, playerQueries, scQueries, projQueries]);

  const isLoading = playerQueries.some(q => q.isLoading);

  const handleAddPlayer = (pid: string) => {
    if (playerIds.includes(pid)) {
      setSnackbar('Player already added.');
      return;
    }
    if (playerIds.length >= 4) {
      setSnackbar('Maximum 4 players for comparison.');
      return;
    }
    navigate(`/compare/${[...playerIds, pid].join(',')}`);
  };

  const handleRemovePlayer = (pid: string) => {
    const remaining = playerIds.filter(p => p !== pid);
    navigate(remaining.length > 0 ? `/compare/${remaining.join(',')}` : '/compare');
  };

  const radarData = players.map(p => ({
    name: p.name,
    teamCode: p.teamCode,
    stats: {
      tries: 0,
      runMetres: 0,
      tackles: 0,
      lineBreaks: 0,
      fantasyPoints: p.sc?.seasonAverage ?? 0,
      tackleBreaks: 0,
    },
  }));

  return (
    <Box>
      <PageHeader title="Compare Players" subtitle={`${players.length} player${players.length !== 1 ? 's' : ''} selected`} />

      {/* Search + selected chips */}
      <Box sx={{ mb: 2 }}>
        <PlayerSearchInput
          allPlayers={playersQuery.data?.players ?? []}
          excludeIds={playerIds}
          onSelect={pid => handleAddPlayer(pid)}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {players.map(p => (
            <Chip
              key={p.id}
              label={`${p.name} (${p.teamCode})`}
              onDelete={() => handleRemovePlayer(p.id)}
              size="small"
            />
          ))}
        </Box>
      </Box>

      {isLoading && <SkeletonPage variant="cards" />}

      {!isLoading && players.length === 0 && (
        <Alert severity="info">Search for players above to start comparing.</Alert>
      )}

      {!isLoading && players.length > 0 && (
        <>
          {/* Stat cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, 1fr)`, gap: 2, mb: 2 }}>
            {players.map(p => (
              <StatCard
                key={p.id}
                label={`${p.name} SC Avg`}
                value={p.sc?.seasonAverage != null ? p.sc.seasonAverage.toFixed(1) : '—'}
              />
            ))}
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Overview" />
            <Tab label="Scores" />
            <Tab label="Projections" />
          </Tabs>

          {tab === 0 && (
            <SectionCard title="Stat Radar">
              <RadarChart players={radarData} height={320} />
            </SectionCard>
          )}

          {tab === 1 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {players.map(p => (
                <SectionCard key={p.id} title={p.name}>
                  {p.sc ? (
                    <ScoreBarChart
                      data={p.sc.matches.map(m => ({
                        round: m.round,
                        score: m.totalScore,
                        isComplete: m.isComplete,
                        opponent: m.opponent,
                      }))}
                      average={p.sc.seasonAverage}
                      height={160}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">No SC data</Typography>
                  )}
                </SectionCard>
              ))}
            </Box>
          )}

          {tab === 2 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(players.length, 2)}, 1fr)`, gap: 2 }}>
              {players.map(p => (
                <SectionCard key={p.id} title={p.name}>
                  {p.proj ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                      <StatCard label="Projected" value={p.proj.projectedTotal.toFixed(0)} />
                      <StatCard label="Floor" value={p.proj.projectedFloor.toFixed(0)} />
                      <StatCard label="Ceiling" value={p.proj.projectedCeiling.toFixed(0)} />
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">No projection data</Typography>
                  )}
                </SectionCard>
              ))}
            </Box>
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
