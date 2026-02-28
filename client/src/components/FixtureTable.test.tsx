import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '../test/utils';
import { FixtureTable } from './FixtureTable';
import { mockScheduleFixtures, mockTeams } from '../test/fixtures';

describe('FixtureTable', () => {
  const defaultProps = {
    fixtures: mockScheduleFixtures,
    teams: mockTeams,
  };

  describe('table structure', () => {
    it('should render table headers', () => {
      render(<FixtureTable {...defaultProps} />);

      expect(screen.getByText('Round')).toBeInTheDocument();
      expect(screen.getByText('Opponent')).toBeInTheDocument();
      expect(screen.getByText('Venue')).toBeInTheDocument();
      expect(screen.getByText('Strength')).toBeInTheDocument();
    });

    it('should render all fixtures as rows', () => {
      render(<FixtureTable {...defaultProps} />);

      // 10 fixtures in mock data
      const rows = screen.getAllByRole('row');
      // +1 for header row
      expect(rows.length).toBe(mockScheduleFixtures.length + 1);
    });
  });

  describe('fixture display', () => {
    it('should display round numbers', () => {
      render(<FixtureTable {...defaultProps} />);

      expect(screen.getByText('R1')).toBeInTheDocument();
      expect(screen.getByText('R2')).toBeInTheDocument();
    });

    it('should display opponent team names', () => {
      render(<FixtureTable {...defaultProps} />);

      expect(screen.getByText('Sydney Roosters')).toBeInTheDocument();
      expect(screen.getByText('Melbourne Storm')).toBeInTheDocument();
    });

    it('should display venue badges for non-bye fixtures', () => {
      render(<FixtureTable {...defaultProps} />);

      // Round 1 is home (SYD)
      expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
      // Round 2 is away (MEL)
      expect(screen.getAllByText('Away').length).toBeGreaterThan(0);
    });

    it('should display strength badges for non-bye fixtures', () => {
      render(<FixtureTable {...defaultProps} />);

      // First fixture has strength 420
      expect(screen.getByText('420')).toBeInTheDocument();
      // Second fixture has strength 480
      expect(screen.getByText('480')).toBeInTheDocument();
    });
  });

  describe('bye fixtures', () => {
    it('should display BYE indicator for bye rounds', () => {
      render(<FixtureTable {...defaultProps} />);

      // Round 5 is a bye in mock data
      expect(screen.getByText('BYE')).toBeInTheDocument();
    });

    it('should show dash for venue in bye rounds', () => {
      render(<FixtureTable {...defaultProps} />);

      // Find the bye row and check its cells
      const byeRow = screen.getByText('R5').closest('tr');
      expect(byeRow).toBeInTheDocument();
      const cells = within(byeRow!).getAllByRole('cell');
      // Venue cell should have a dash
      expect(cells[2]).toHaveTextContent('-');
    });
  });

  describe('empty state', () => {
    it('should display empty message when no fixtures', () => {
      render(<FixtureTable {...defaultProps} fixtures={[]} />);

      expect(screen.getByText('No fixtures match your filters')).toBeInTheDocument();
    });

    it('should display custom empty message', () => {
      render(
        <FixtureTable
          {...defaultProps}
          fixtures={[]}
          emptyMessage="Custom empty message"
        />
      );

      expect(screen.getByText('Custom empty message')).toBeInTheDocument();
    });
  });
});
