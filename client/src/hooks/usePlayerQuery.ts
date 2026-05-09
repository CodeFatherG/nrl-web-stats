import { useQuery } from '@tanstack/react-query';
import {
  getPlayer,
  getPlayerSupercoachSeason,
  getPlayerSupercoachProjection,
  getPlayerInjuryHistory,
} from '../services/api';

export function usePlayerQuery(playerId: string) {
  return useQuery({
    queryKey: ['player', playerId],
    queryFn: () => getPlayer(playerId),
    enabled: !!playerId,
  });
}

export function usePlayerSupercoachQuery(year: number, playerId: string) {
  return useQuery({
    queryKey: ['playerSupercoach', year, playerId],
    queryFn: () => getPlayerSupercoachSeason(year, playerId),
    enabled: !!playerId,
  });
}

export function usePlayerProjectionQuery(year: number, playerId: string) {
  return useQuery({
    queryKey: ['playerProjection', year, playerId],
    queryFn: () => getPlayerSupercoachProjection(year, playerId),
    enabled: !!playerId,
  });
}

export function usePlayerInjuryHistoryQuery(playerId: string) {
  return useQuery({
    queryKey: ['playerInjuryHistory', playerId],
    queryFn: () => getPlayerInjuryHistory(playerId),
    enabled: !!playerId,
  });
}
