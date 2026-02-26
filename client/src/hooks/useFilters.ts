import { useState, useCallback } from 'react';
import type { FilterState } from '../types';

const DEFAULT_FILTERS: FilterState = {
  roundStart: 1,
  roundEnd: 27,
  venueFilter: 'all',
};

interface UseFiltersResult {
  filters: FilterState;
  setRoundRange: (start: number, end: number) => void;
  setVenueFilter: (venue: 'all' | 'home' | 'away') => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

export function useFilters(initialFilters?: Partial<FilterState>): UseFiltersResult {
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });

  const setRoundRange = useCallback((start: number, end: number) => {
    setFilters((prev) => ({
      ...prev,
      roundStart: Math.max(1, Math.min(start, end)),
      roundEnd: Math.min(27, Math.max(start, end)),
    }));
  }, []);

  const setVenueFilter = useCallback((venue: 'all' | 'home' | 'away') => {
    setFilters((prev) => ({
      ...prev,
      venueFilter: venue,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters =
    filters.roundStart !== 1 ||
    filters.roundEnd !== 27 ||
    filters.venueFilter !== 'all';

  return {
    filters,
    setRoundRange,
    setVenueFilter,
    resetFilters,
    hasActiveFilters,
  };
}
