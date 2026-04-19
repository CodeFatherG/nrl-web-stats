import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { TeamScheduleView } from './TeamScheduleView';
import {
  mockTeams,
  mockTeamScheduleResponse,
} from '../test/fixtures';
import type { FilterState } from '../types';

describe('TeamScheduleView', () => {
  const defaultFilters: FilterState = {
    roundStart: 1,
    roundEnd: 27,
    venueFilter: 'all',
  };

  const defaultProps = {
    teams: mockTeams,
    selectedTeamCode: null,
    onTeamSelect: vi.fn(),
    schedule: null,
    loading: false,
    error: null,
    filters: defaultFilters,
    onFiltersChange: vi.fn(),
    year: 2026,
    loadedYears: [2026],
  };

  describe('initial state', () => {
    it('should render team selector', () => {
      render(<TeamScheduleView {...defaultProps} />);
      expect(screen.getByLabelText('Select Team')).toBeInTheDocument();
    });

    it('should show info message when no team selected', () => {
      render(<TeamScheduleView {...defaultProps} />);
      expect(
        screen.getByText('Select a team from the dropdown above to view their schedule.')
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when loading', () => {
      render(<TeamScheduleView {...defaultProps} loading={true} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should disable team selector when loading', () => {
      render(<TeamScheduleView {...defaultProps} loading={true} />);
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('error state', () => {
    it('should display error message', () => {
      render(
        <TeamScheduleView
          {...defaultProps}
          error="Failed to load schedule"
        />
      );
      expect(screen.getByText('Failed to load schedule')).toBeInTheDocument();
    });
  });

  describe('with schedule data', () => {
    const propsWithSchedule = {
      ...defaultProps,
      selectedTeamCode: 'BRI',
      schedule: mockTeamScheduleResponse,
    };

    it('should display team schedule summary', () => {
      render(<TeamScheduleView {...propsWithSchedule} />);
      // Brisbane Broncos appears in summary and in dropdown
      expect(screen.getAllByText('Brisbane Broncos').length).toBeGreaterThan(0);
      // Check for strength label which is unique to summary
      expect(screen.getByText('Strength of Schedule')).toBeInTheDocument();
    });

    it('should display filter controls', () => {
      render(<TeamScheduleView {...propsWithSchedule} />);
      expect(screen.getByText(/Round Range/i)).toBeInTheDocument();
      // Filter controls should have All/Home/Away toggle buttons
      expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
    });

    it('should display fixture table', () => {
      render(<TeamScheduleView {...propsWithSchedule} />);
      // Check for table headers
      expect(screen.getByText('Round')).toBeInTheDocument();
      expect(screen.getByText('Opponent')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    const propsWithSchedule = {
      ...defaultProps,
      selectedTeamCode: 'BRI',
      schedule: mockTeamScheduleResponse,
    };

    it('should apply round range filter', () => {
      // Filter to rounds 1-4 (avoiding R5 which is also in bye rounds chip)
      const filteredFilters: FilterState = {
        roundStart: 1,
        roundEnd: 4,
        venueFilter: 'all',
      };

      render(
        <TeamScheduleView {...propsWithSchedule} filters={filteredFilters} />
      );

      // Should show rounds 1-4 (4 fixtures)
      expect(screen.getByText('R1')).toBeInTheDocument();
      expect(screen.getByText('R4')).toBeInTheDocument();
      // Round 6 should not be visible
      expect(screen.queryByText('R6')).not.toBeInTheDocument();
    });

    it('should apply home venue filter', () => {
      const homeOnlyFilters: FilterState = {
        roundStart: 1,
        roundEnd: 27,
        venueFilter: 'home',
      };

      render(
        <TeamScheduleView {...propsWithSchedule} filters={homeOnlyFilters} />
      );

      // Round 1 is home (should be visible)
      expect(screen.getByText('R1')).toBeInTheDocument();
      // Round 2 is away (should not be visible)
      expect(screen.queryByText('R2')).not.toBeInTheDocument();
    });

    it('should apply away venue filter', () => {
      const awayOnlyFilters: FilterState = {
        roundStart: 1,
        roundEnd: 27,
        venueFilter: 'away',
      };

      render(
        <TeamScheduleView {...propsWithSchedule} filters={awayOnlyFilters} />
      );

      // Round 2 is away (should be visible)
      expect(screen.getByText('R2')).toBeInTheDocument();
      // Round 1 is home (should not be visible)
      expect(screen.queryByText('R1')).not.toBeInTheDocument();
    });

    it('should show bye rounds regardless of venue filter', () => {
      const homeOnlyFilters: FilterState = {
        roundStart: 1,
        roundEnd: 27,
        venueFilter: 'home',
      };

      render(
        <TeamScheduleView {...propsWithSchedule} filters={homeOnlyFilters} />
      );

      // Round 5 is a bye - should be visible with home filter
      // R5 appears both in table and in bye rounds chip, so check for BYE indicator
      expect(screen.getByText('BYE')).toBeInTheDocument();
      // The fixture table should still have the bye row
      const rows = screen.getAllByRole('row');
      // Filter should show: home fixtures + byes
      expect(rows.length).toBeGreaterThan(1);
    });
  });

  describe('team selection', () => {
    it('should call onTeamSelect when team is selected', async () => {
      const onTeamSelect = vi.fn();
      render(<TeamScheduleView {...defaultProps} onTeamSelect={onTeamSelect} />);

      const select = screen.getByRole('combobox');
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Melbourne Storm'));

      expect(onTeamSelect).toHaveBeenCalledWith('MEL');
    });
  });
});
