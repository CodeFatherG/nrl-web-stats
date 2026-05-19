import { useQuery } from '@tanstack/react-query';
import { getRound, getMatchOutlook, getGameStrengthRatings } from '../services/api';

export function useRoundQuery(year: number, round: number) {
  return useQuery({
    queryKey: ['round', year, round],
    queryFn: () => getRound(year, round),
    enabled: round > 0,
  });
}

export function useMatchOutlookQuery(year: number, round: number) {
  return useQuery({
    queryKey: ['matchOutlook', year, round],
    queryFn: () => getMatchOutlook(year, round),
    enabled: round > 0,
  });
}

export function useGameStrengthQuery(year: number, round: number) {
  return useQuery({
    queryKey: ['gameStrength', year, round],
    queryFn: () => getGameStrengthRatings(year, round),
    enabled: year > 0 && round > 0,
    staleTime: 5 * 60 * 1000, // 5 min — locked rounds never change, future rounds update weekly
  });
}
