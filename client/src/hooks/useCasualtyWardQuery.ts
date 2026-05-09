import { useQuery } from '@tanstack/react-query';
import { getCasualtyWard } from '../services/api';

export function useCasualtyWardQuery() {
  return useQuery({
    queryKey: ['casualtyWard'],
    queryFn: getCasualtyWard,
    staleTime: 5 * 60 * 1000,
  });
}
