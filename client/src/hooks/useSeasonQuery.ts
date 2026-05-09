import { useQuery } from '@tanstack/react-query';
import { getSeasonSummary, getSeasonPlayers } from '../services/api';

export function useSeasonSummaryQuery(year: number) {
  return useQuery({
    queryKey: ['seasonSummary', year],
    queryFn: () => getSeasonSummary(year),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSeasonPlayersQuery(year: number) {
  return useQuery({
    queryKey: ['seasonPlayers', year],
    queryFn: () => getSeasonPlayers(year),
  });
}
