import { useQuery } from '@tanstack/react-query';
import { getSupercoachScores } from '../services/api';

export function useSupercoachQuery(year: number, round: number, teamCode?: string) {
  return useQuery({
    queryKey: ['supercoach', year, round, teamCode ?? 'all'],
    queryFn: () => getSupercoachScores(year, round, teamCode),
    enabled: round > 0,
  });
}
