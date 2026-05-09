import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/api';

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    staleTime: Infinity,
  });
}
