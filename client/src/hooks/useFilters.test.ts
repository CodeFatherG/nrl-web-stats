import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilters } from './useFilters';

describe('useFilters', () => {
  it('should initialize with default filters', () => {
    const { result } = renderHook(() => useFilters());

    expect(result.current.filters).toEqual({
      roundStart: 1,
      roundEnd: 27,
      venueFilter: 'all',
    });
  });

  it('should initialize with custom filters', () => {
    const { result } = renderHook(() =>
      useFilters({ roundStart: 5, venueFilter: 'home' })
    );

    expect(result.current.filters).toEqual({
      roundStart: 5,
      roundEnd: 27,
      venueFilter: 'home',
    });
  });

  describe('setRoundRange', () => {
    it('should update round range', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(5, 15);
      });

      expect(result.current.filters.roundStart).toBe(5);
      expect(result.current.filters.roundEnd).toBe(15);
    });

    it('should swap start/end if provided in wrong order', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(15, 5);
      });

      expect(result.current.filters.roundStart).toBe(5);
      expect(result.current.filters.roundEnd).toBe(15);
    });

    it('should clamp roundStart to minimum of 1', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(-5, 10);
      });

      expect(result.current.filters.roundStart).toBe(1);
      expect(result.current.filters.roundEnd).toBe(10);
    });

    it('should clamp roundEnd to maximum of 27', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(5, 30);
      });

      expect(result.current.filters.roundStart).toBe(5);
      expect(result.current.filters.roundEnd).toBe(27);
    });
  });

  describe('setVenueFilter', () => {
    it('should update venue filter to home', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setVenueFilter('home');
      });

      expect(result.current.filters.venueFilter).toBe('home');
    });

    it('should update venue filter to away', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setVenueFilter('away');
      });

      expect(result.current.filters.venueFilter).toBe('away');
    });

    it('should update venue filter back to all', () => {
      const { result } = renderHook(() => useFilters({ venueFilter: 'home' }));

      act(() => {
        result.current.setVenueFilter('all');
      });

      expect(result.current.filters.venueFilter).toBe('all');
    });
  });

  describe('resetFilters', () => {
    it('should reset all filters to defaults', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(5, 15);
        result.current.setVenueFilter('home');
      });

      expect(result.current.filters.roundStart).toBe(5);
      expect(result.current.filters.venueFilter).toBe('home');

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.filters).toEqual({
        roundStart: 1,
        roundEnd: 27,
        venueFilter: 'all',
      });
    });
  });

  describe('hasActiveFilters', () => {
    it('should return false when using default filters', () => {
      const { result } = renderHook(() => useFilters());

      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('should return true when roundStart is changed', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(5, 27);
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('should return true when roundEnd is changed', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(1, 20);
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('should return true when venueFilter is changed', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setVenueFilter('home');
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('should return false after resetting filters', () => {
      const { result } = renderHook(() => useFilters());

      act(() => {
        result.current.setRoundRange(5, 15);
        result.current.setVenueFilter('away');
      });

      expect(result.current.hasActiveFilters).toBe(true);

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.hasActiveFilters).toBe(false);
    });
  });
});
