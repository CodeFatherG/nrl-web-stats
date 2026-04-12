import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  Chip,
  Stack,
  Divider,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  getSeasonPlayers,
  getPlayer,
  getPlayerSupercoachSeason,
  getPlayerSupercoachProjection,
} from '../services/api';
import type {
  PlayerProjectionResponse,
  PlayerSeasonSupercoachResponse,
} from '../services/api';
import type { PlayerSeasonSummary, PlayerDetailResponse } from '../types';
import { buildCompareUrl } from '../utils/routes';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { CompareAnalyticsSummary } from '../components/CompareAnalyticsSummary';
import { CompareSeasonStatsTable } from '../components/CompareSeasonStatsTable';
import { CompareRoundScoresTable } from '../components/CompareRoundScoresTable';
import { CompareProjectionsSection } from '../components/CompareProjectionsSection';

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

export interface RoundScoreEntry {
  round: number;
  totalScore: number | null;
  opponent: string | null;
}

export interface PlayerComparisonData {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
  seasonStats: SeasonStatsSnapshot | null;
  scRounds: RoundScoreEntry[];
  projection: PlayerProjectionResponse | null;
  projectionError: boolean;
  loading: boolean;
  error: string | null;
}

interface CompareViewProps {
  playerIds: string[];
  year: number;
  onNavigate: (url: string) => void;
}

function buildSeasonStats(detail: PlayerDetailResponse, year: number): SeasonStatsSnapshot | null {
  const season = detail.seasons[String(year)];
  if (!season || season.performances.length === 0) return null;

  const perfs = season.performances.filter((p) => p.isComplete);
  if (perfs.length === 0) return null;

  const sum = <K extends keyof typeof perfs[0]>(key: K): number =>
    perfs.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);

  const latestPerf = [...perfs].sort((a, b) => b.round - a.round)[0];

  return {
    gamesPlayed: perfs.length,
    totalTries: sum('tries'),
    totalRunMetres: sum('allRunMetres'),
    totalTacklesMade: sum('tacklesMade'),
    totalTackleBreaks: sum('tackleBreaks'),
    totalLineBreaks: sum('lineBreaks'),
    totalPoints: sum('points'),
    avgScScore: perfs.length > 0 ? sum('fantasyPointsTotal') / perfs.length : 0,
    totalKicks: sum('kicks'),
    totalKickMetres: sum('kickMetres'),
    totalOffloads: sum('offloads'),
    totalErrors: sum('errors'),
    totalPenalties: sum('penalties'),
    totalMissedTackles: sum('missedTackles'),
    totalInterceptions: sum('intercepts'),
    avgMinutesPlayed: perfs.length > 0 ? sum('minutesPlayed') / perfs.length : 0,
    latestPrice: latestPerf?.price ?? null,
    latestBreakEven: latestPerf?.breakEven ?? null,
  };
}

function buildRoundScores(sc: PlayerSeasonSupercoachResponse): RoundScoreEntry[] {
  return sc.matches.map((m) => ({
    round: m.round,
    totalScore: m.totalScore,
    opponent: m.opponent,
  }));
}

export function CompareView({ playerIds, year, onNavigate }: CompareViewProps) {
  const [allPlayers, setAllPlayers] = useState<PlayerSeasonSummary[]>([]);
  const [playerData, setPlayerData] = useState<Map<string, PlayerComparisonData>>(new Map());
  const [removedAlert, setRemovedAlert] = useState<string | null>(null);

  // Load full player list for search autocomplete
  useEffect(() => {
    getSeasonPlayers(year)
      .then((res) => setAllPlayers(res.players))
      .catch(() => {
        // Search autocomplete unavailable — not fatal
      });
  }, [year]);

  // Load data for each player in the comparison set
  useEffect(() => {
    for (const playerId of playerIds) {
      if (playerData.has(playerId)) continue;

      // Mark as loading
      setPlayerData((prev) => {
        const next = new Map(prev);
        next.set(playerId, {
          playerId,
          playerName: playerId,
          teamCode: '',
          position: '',
          seasonStats: null,
          scRounds: [],
          projection: null,
          projectionError: false,
          loading: true,
          error: null,
        });
        return next;
      });

      // Fire all three requests in parallel
      Promise.allSettled([
        getPlayer(playerId),
        getPlayerSupercoachSeason(year, playerId),
        getPlayerSupercoachProjection(year, playerId),
      ]).then(([detailResult, scResult, projResult]) => {
        if (detailResult.status === 'rejected') {
          const err = detailResult.reason as { message?: string };
          const is404 = err?.message?.includes('404') || err?.message?.includes('not found');
          if (is404) {
            // Remove from comparison set and show alert
            setRemovedAlert('One or more players could not be found and were removed from the comparison.');
            onNavigate(buildCompareUrl(playerIds.filter((id) => id !== playerId)));
            return;
          }
          setPlayerData((prev) => {
            const next = new Map(prev);
            const existing = next.get(playerId);
            if (existing) {
              next.set(playerId, { ...existing, loading: false, error: 'Failed to load player data.' });
            }
            return next;
          });
          return;
        }

        const detail = detailResult.value;
        const sc = scResult.status === 'fulfilled' ? scResult.value : null;
        const proj = projResult.status === 'fulfilled' ? projResult.value : null;
        const projectionError = projResult.status === 'rejected';

        setPlayerData((prev) => {
          const next = new Map(prev);
          next.set(playerId, {
            playerId: detail.id,
            playerName: detail.name,
            teamCode: detail.teamCode,
            position: detail.position,
            seasonStats: buildSeasonStats(detail, year),
            scRounds: sc ? buildRoundScores(sc) : [],
            projection: proj,
            projectionError,
            loading: false,
            error: null,
          });
          return next;
        });
      });
    }

    // Clean up data for removed players
    setPlayerData((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!playerIds.includes(key)) next.delete(key);
      }
      return next;
    });
  }, [playerIds, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = useCallback(
    (newId: string) => {
      if (playerIds.includes(newId)) return;
      onNavigate(buildCompareUrl([...playerIds, newId]));
    },
    [playerIds, onNavigate]
  );

  const handleRemove = useCallback(
    (removeId: string) => {
      onNavigate(buildCompareUrl(playerIds.filter((id) => id !== removeId)));
    },
    [playerIds, onNavigate]
  );

  const orderedData = playerIds
    .map((id) => playerData.get(id))
    .filter((d): d is PlayerComparisonData => d !== undefined);

  const hasPlayers = playerIds.length > 0;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={2}>
        Player Comparison
      </Typography>

      {removedAlert && (
        <Alert severity="info" onClose={() => setRemovedAlert(null)} sx={{ mb: 2 }}>
          {removedAlert}
        </Alert>
      )}

      {/* Empty state */}
      {!hasPlayers && (
        <Paper
          variant="outlined"
          sx={{
            p: 6,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <SearchIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
          <Typography variant="h6" color="text.secondary">
            Add players to start comparing
          </Typography>
          <Box sx={{ width: '100%', maxWidth: 480 }}>
            <PlayerSearchInput
              allPlayers={allPlayers}
              excludeIds={playerIds}
              onSelect={handleAdd}
            />
          </Box>
        </Paper>
      )}

      {/* Player chips + search bar */}
      {hasPlayers && (
        <Box mb={3}>
          <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
            {orderedData.map((d) => (
              <Chip
                key={d.playerId}
                label={d.loading ? `${d.playerId}…` : `${d.playerName} (${d.teamCode})`}
                onDelete={() => handleRemove(d.playerId)}
                color="primary"
                variant="outlined"
              />
            ))}
          </Stack>
          <Box sx={{ maxWidth: 480 }}>
            <PlayerSearchInput
              allPlayers={allPlayers}
              excludeIds={playerIds}
              onSelect={handleAdd}
            />
          </Box>
        </Box>
      )}

      {/* Analytics summary */}
      {hasPlayers && (
        <>
          <CompareAnalyticsSummary players={orderedData} />

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight={600} mb={1}>
            Season Statistics
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <CompareSeasonStatsTable players={orderedData} />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight={600} mb={1}>
            Round Scores
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <CompareRoundScoresTable players={orderedData} />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight={600} mb={1}>
            Projections
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <CompareProjectionsSection players={orderedData} />
          </Box>
        </>
      )}
    </Box>
  );
}
