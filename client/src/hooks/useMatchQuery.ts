import { useQuery } from '@tanstack/react-query';
import { getMatchDetail, getMatchSupercoach } from '../services/api';

export function useMatchDetailQuery(matchId: string) {
  return useQuery({
    queryKey: ['matchDetail', matchId],
    queryFn: () => getMatchDetail(matchId),
    enabled: !!matchId,
  });
}

export function useMatchSupercoachQuery(year: number, matchId: string) {
  return useQuery({
    queryKey: ['matchSupercoach', year, matchId],
    queryFn: () => getMatchSupercoach(year, matchId),
    enabled: !!matchId && year > 0,
  });
}
