import { useQuery } from '@tanstack/react-query';
import { getSupercoachScores } from '../services/api';

export function useSupercoachQuery(year: number, round: number) {
  return useQuery({
    queryKey: ['supercoach', year, round],
    queryFn: () => getSupercoachScores(year, round),
    enabled: round > 0,
  });
}
