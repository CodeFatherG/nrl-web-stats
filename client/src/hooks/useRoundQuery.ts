import { useQuery } from '@tanstack/react-query';
import { getRound, getMatchOutlook } from '../services/api';

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
