import { useQuery } from '@tanstack/react-query';
import { getRoundDashboard } from '../services/api';

export function useRoundDashboardQuery(year: number, round: number) {
  return useQuery({
    queryKey: ['roundDashboard', year, round],
    queryFn: () => getRoundDashboard(year, round),
    enabled: year > 0 && round > 0,
    staleTime: 5 * 60 * 1000,
  });
}
