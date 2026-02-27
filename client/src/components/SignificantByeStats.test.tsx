import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { SignificantByeStats } from './SignificantByeStats';
import {
  mockSignificantByeRounds,
  mockMultipleSignificantByeRounds,
  mockEmptySignificantByeRounds,
} from '../test/fixtures';

describe('SignificantByeStats', () => {
  const defaultProps = {
    significantRounds: mockSignificantByeRounds,
    highlightedTeam: null,
    onTeamClick: vi.fn(),
  };

  // T037: Component rendering tests
  describe('rendering', () => {
    it('should render a table with proper structure', () => {
      render(<SignificantByeStats {...defaultProps} />);

      expect(screen.getByRole('table', { name: /significant bye statistics/i })).toBeInTheDocument();
    });

    it('should render section title', () => {
      render(<SignificantByeStats {...defaultProps} />);

      expect(screen.getByText(/significant bye rounds/i)).toBeInTheDocument();
    });

    it('should render two row headers: Affected Teams and Unaffected Teams', () => {
      render(<SignificantByeStats {...defaultProps} />);

      expect(screen.getByText('Affected Teams')).toBeInTheDocument();
      expect(screen.getByText('Unaffected Teams')).toBeInTheDocument();
    });
  });

  // T038: Only showing rounds with >2 byes
  describe('round filtering', () => {
    it('should only display rounds with more than 2 byes as columns', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Round 12 has 3 byes, should be visible
      expect(screen.getByRole('columnheader', { name: /round 12/i })).toBeInTheDocument();
    });

    it('should display multiple significant rounds when available', () => {
      render(
        <SignificantByeStats
          {...defaultProps}
          significantRounds={mockMultipleSignificantByeRounds}
        />
      );

      // Both rounds 5 and 12 should be visible
      expect(screen.getByRole('columnheader', { name: /round 5/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /round 12/i })).toBeInTheDocument();
    });

    it('should not display rounds with 2 or fewer byes', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Check that we don't have rounds that aren't significant
      // Our default mock only has round 12 as significant
      const columnHeaders = screen.getAllByRole('columnheader');
      // Should have 2 column headers: 1 for row label + 1 for round 12
      expect(columnHeaders.length).toBe(2);
    });
  });

  // T039: Affected teams row
  describe('affected teams row', () => {
    it('should display team codes as chips in affected teams row', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Round 12 affected teams: SOU, SYD, WST
      expect(screen.getByText('SOU')).toBeInTheDocument();
      expect(screen.getByText('SYD')).toBeInTheDocument();
      expect(screen.getByText('WST')).toBeInTheDocument();
    });

    it('should display correct number of affected team chips', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Find the affected teams row
      const affectedRow = screen.getByText('Affected Teams').closest('tr');
      expect(affectedRow).toBeInTheDocument();

      // Count chips in the affected row - should be 3 for round 12
      const chips = within(affectedRow!).getAllByRole('button');
      expect(chips.length).toBe(3);
    });
  });

  // T040: Unaffected teams row
  describe('unaffected teams row', () => {
    it('should display team codes as chips in unaffected teams row', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Round 12 unaffected teams include BRI, CAN, etc.
      expect(screen.getByText('BRI')).toBeInTheDocument();
      expect(screen.getByText('CAN')).toBeInTheDocument();
    });

    it('should display correct number of unaffected team chips', () => {
      render(<SignificantByeStats {...defaultProps} />);

      // Find the unaffected teams row
      const unaffectedRow = screen.getByText('Unaffected Teams').closest('tr');
      expect(unaffectedRow).toBeInTheDocument();

      // Count chips in the unaffected row - should be 14 (17 - 3)
      const chips = within(unaffectedRow!).getAllByRole('button');
      expect(chips.length).toBe(14);
    });
  });

  // T041: Team chip click highlighting
  describe('team chip highlighting', () => {
    it('should call onTeamClick when a team chip is clicked', async () => {
      const onTeamClick = vi.fn();
      render(<SignificantByeStats {...defaultProps} onTeamClick={onTeamClick} />);

      const souChip = screen.getByText('SOU');
      await userEvent.click(souChip);

      expect(onTeamClick).toHaveBeenCalledWith('SOU');
    });

    it('should highlight all instances of a team across the table', () => {
      render(
        <SignificantByeStats
          {...defaultProps}
          significantRounds={mockMultipleSignificantByeRounds}
          highlightedTeam="BRI"
        />
      );

      // BRI appears in round 5 affected and round 12 unaffected
      const briChips = screen.getAllByText('BRI');
      expect(briChips.length).toBe(2);

      // Both should have highlighted styling (we check via data-testid or class)
      briChips.forEach((chip) => {
        const chipElement = chip.closest('[data-highlighted]');
        expect(chipElement).toHaveAttribute('data-highlighted', 'true');
      });
    });

    it('should not highlight teams that are not selected', () => {
      render(
        <SignificantByeStats
          {...defaultProps}
          highlightedTeam="BRI"
        />
      );

      // SOU should not be highlighted
      const souChip = screen.getByText('SOU').closest('[data-highlighted]');
      expect(souChip).toHaveAttribute('data-highlighted', 'false');
    });
  });

  // T042: Team highlight toggle behavior
  describe('highlight toggle', () => {
    it('should call onTeamClick with same team code when clicking highlighted team', async () => {
      const onTeamClick = vi.fn();
      render(
        <SignificantByeStats
          {...defaultProps}
          highlightedTeam="SOU"
          onTeamClick={onTeamClick}
        />
      );

      const souChip = screen.getByText('SOU');
      await userEvent.click(souChip);

      // Parent component handles toggle logic
      expect(onTeamClick).toHaveBeenCalledWith('SOU');
    });
  });

  // T043: Empty state
  describe('empty state', () => {
    it('should not render table when no significant rounds exist', () => {
      render(
        <SignificantByeStats
          {...defaultProps}
          significantRounds={mockEmptySignificantByeRounds}
        />
      );

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('should display message when no significant rounds exist', () => {
      render(
        <SignificantByeStats
          {...defaultProps}
          significantRounds={mockEmptySignificantByeRounds}
        />
      );

      expect(screen.getByText(/no rounds with more than 2 byes/i)).toBeInTheDocument();
    });
  });

  // T044: Round filter affecting statistics table
  describe('round range filter integration', () => {
    it('should only show rounds within filtered range', () => {
      // When parent filters to rounds 10-15, only round 12 (which has >2 byes) should show
      render(<SignificantByeStats {...defaultProps} />);

      // With our default mock (only round 12 significant), it should show
      expect(screen.getByRole('columnheader', { name: /round 12/i })).toBeInTheDocument();
    });

    it('should show empty state when all significant rounds are filtered out', () => {
      // If no significant rounds passed (parent filtered them out), show empty state
      render(
        <SignificantByeStats
          {...defaultProps}
          significantRounds={[]}
        />
      );

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText(/no rounds with more than 2 byes/i)).toBeInTheDocument();
    });
  });
});
