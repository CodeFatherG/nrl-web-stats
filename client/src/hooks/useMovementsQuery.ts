import { useQuery } from '@tanstack/react-query';
import { getPlayerMovements } from '../services/api';

export function useMovementsQuery(year: number) {
  return useQuery({
    queryKey: ['movements', year],
    queryFn: () => getPlayerMovements(year),
  });
}
