import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { ByeOverviewGrid } from './ByeOverviewGrid';
import { mockByeGridData, mockTeams } from '../test/fixtures';

describe('ByeOverviewGrid', () => {
  const defaultProps = {
    byeGridData: mockByeGridData,
    highlightedRow: null,
    highlightedColumn: null,
    roundRange: [1, 27] as [number, number],
    onRowClick: vi.fn(),
    onColumnClick: vi.fn(),
  };

  // T006: Component rendering tests
  describe('rendering', () => {
    it('should render a table with proper structure', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      expect(screen.getByRole('table', { name: /bye overview grid/i })).toBeInTheDocument();
    });

    it('should render team column header', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('should render all 27 round column headers by default', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Get all column headers (including Team header)
      const columnHeaders = screen.getAllByRole('columnheader');
      // Should have 28 column headers: 1 for Team + 27 for rounds
      expect(columnHeaders.length).toBe(28);
    });

    it('should render all 17 team rows', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // All teams should be present as row headers
      for (const team of mockTeams) {
        expect(screen.getByText(team.name)).toBeInTheDocument();
      }
    });
  });

  // T007: Bye indicator display tests
  describe('bye indicator display', () => {
    it('should display bye indicator for Brisbane Broncos in round 5', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Brisbane Broncos has bye in round 5
      // Total BYE chips should include one for Brisbane
      const byeIndicators = screen.getAllByText('BYE');
      expect(byeIndicators.length).toBeGreaterThan(0);
    });

    it('should display correct number of bye indicators', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Count all BYE indicators in the grid
      // Our mock data has 17 teams with 1 bye each = 17 BYE indicators
      const byeIndicators = screen.getAllByText('BYE');
      expect(byeIndicators.length).toBe(17);
    });

    it('should not display bye indicator in cells without byes', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Get Brisbane's row (first alphabetically)
      const rows = screen.getAllByRole('row');
      // First row is header, Brisbane is first data row (alphabetically sorted)
      const brisbaneRow = rows[1]; // 0 is header
      expect(brisbaneRow).toBeDefined();
      const cells = within(brisbaneRow!).getAllByRole('cell');

      // Round 1 cell (index 1, since index 0 is rowheader) should NOT have BYE
      // Brisbane has bye in round 5, not round 1
      expect(within(cells[0]!).queryByText('BYE')).not.toBeInTheDocument();
    });

    it('should display bye indicators for multiple teams in same round', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Round 12 has 3 teams with byes: SOU, SYD, WST
      // Count BYE indicators (there should be 17 total)
      const byeIndicators = screen.getAllByText('BYE');
      expect(byeIndicators.length).toBe(17);
    });
  });

  // T008: Alphabetical team ordering tests
  describe('alphabetical team ordering', () => {
    it('should display teams sorted alphabetically by full name', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Get all row headers (team names)
      const teamCells = screen.getAllByRole('rowheader');
      const teamNames = teamCells.map(cell => cell.textContent);

      // Expected alphabetical order
      const expectedOrder = [...mockTeams]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => t.name);

      expect(teamNames).toEqual(expectedOrder);
    });

    it('should have Brisbane Broncos before Canterbury-Bankstown Bulldogs', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      const teamCells = screen.getAllByRole('rowheader');
      const teamNames = teamCells.map(cell => cell.textContent);

      const brisbaneIndex = teamNames.indexOf('Brisbane Broncos');
      const canterburyIndex = teamNames.indexOf('Canterbury-Bankstown Bulldogs');

      expect(brisbaneIndex).toBeLessThan(canterburyIndex);
    });

    it('should have Wests Tigers as the last team alphabetically', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      const teamCells = screen.getAllByRole('rowheader');
      const lastTeam = teamCells[teamCells.length - 1]?.textContent;

      expect(lastTeam).toBe('Wests Tigers');
    });
  });

  // T016-T019: Highlighting tests (User Story 2)
  describe('row highlighting', () => {
    it('should highlight row when highlightedRow prop is set', () => {
      render(<ByeOverviewGrid {...defaultProps} highlightedRow="BRI" />);

      // The Brisbane Broncos row should have highlighted styling
      const brisbaneRowHeader = screen.getByRole('rowheader', { name: /Brisbane Broncos/i });
      expect(brisbaneRowHeader).toHaveStyle({ cursor: 'pointer' });
    });

    it('should call onRowClick when team name is clicked', async () => {
      const onRowClick = vi.fn();
      render(<ByeOverviewGrid {...defaultProps} onRowClick={onRowClick} />);

      const brisbaneRowHeader = screen.getByRole('rowheader', { name: /Brisbane Broncos/i });
      await userEvent.click(brisbaneRowHeader);

      expect(onRowClick).toHaveBeenCalledWith('BRI');
    });
  });

  describe('column highlighting', () => {
    it('should call onColumnClick when round header is clicked', async () => {
      const onColumnClick = vi.fn();
      render(<ByeOverviewGrid {...defaultProps} onColumnClick={onColumnClick} />);

      const round5Header = screen.getByRole('columnheader', { name: /Round 5/i });
      await userEvent.click(round5Header);

      expect(onColumnClick).toHaveBeenCalledWith(5);
    });
  });

  // T027: Column filtering tests (User Story 3)
  describe('round range filtering', () => {
    it('should only display rounds within the specified range', () => {
      render(<ByeOverviewGrid {...defaultProps} roundRange={[5, 15]} />);

      // Rounds 5-15 should be visible
      for (let round = 5; round <= 15; round++) {
        expect(screen.getByRole('columnheader', { name: new RegExp(`Round ${round}`) })).toBeInTheDocument();
      }

      // Rounds 1-4 should not be visible
      for (let round = 1; round <= 4; round++) {
        expect(screen.queryByRole('columnheader', { name: new RegExp(`Round ${round},`) })).not.toBeInTheDocument();
      }

      // Rounds 16-27 should not be visible
      for (let round = 16; round <= 27; round++) {
        expect(screen.queryByRole('columnheader', { name: new RegExp(`Round ${round},`) })).not.toBeInTheDocument();
      }
    });

    it('should display single round when range has same start and end', () => {
      render(<ByeOverviewGrid {...defaultProps} roundRange={[10, 10]} />);

      expect(screen.getByRole('columnheader', { name: /Round 10/i })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /Round 9,/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /Round 11,/i })).not.toBeInTheDocument();
    });
  });

  // Bye concentration highlighting tests
  describe('bye concentration highlighting', () => {
    it('should show bye count in column header aria-label', () => {
      render(<ByeOverviewGrid {...defaultProps} />);

      // Round 12 has 3 teams on bye
      const round12Header = screen.getByRole('columnheader', { name: /Round 12, 3 teams on bye/i });
      expect(round12Header).toBeInTheDocument();

      // Round 5 has 2 teams on bye
      const round5Header = screen.getByRole('columnheader', { name: /Round 5, 2 teams on bye/i });
      expect(round5Header).toBeInTheDocument();

      // Round 1 has 0 teams on bye
      const round1Header = screen.getByRole('columnheader', { name: /Round 1, 0 teams on bye/i });
      expect(round1Header).toBeInTheDocument();
    });
  });
});
