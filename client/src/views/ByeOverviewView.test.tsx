import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { ByeOverviewView } from './ByeOverviewView';
import { mockTeams, mockSeasonSummaryResponse } from '../test/fixtures';

describe('ByeOverviewView', () => {
  const defaultProps = {
    teams: mockTeams,
    seasonSummary: mockSeasonSummaryResponse,
    loading: false,
    error: null,
    onRetry: vi.fn(),
  };

  // T026: Round slider rendering tests
  describe('round slider', () => {
    it('should render round range slider', () => {
      render(<ByeOverviewView {...defaultProps} />);

      // MUI Range slider has two slider inputs (start and end handles)
      const sliders = screen.getAllByRole('slider', { name: /round range filter/i });
      expect(sliders.length).toBe(2);
    });

    it('should display "Round Range" label', () => {
      render(<ByeOverviewView {...defaultProps} />);

      expect(screen.getByText('Round Range')).toBeInTheDocument();
    });

    it('should disable Clear button when at default range', () => {
      render(<ByeOverviewView {...defaultProps} />);

      // Initially no Clear button (default range 1-27)
      expect(screen.queryByRole('button', { name: /clear/i })).toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('should display loading state when loading is true', () => {
      render(<ByeOverviewView {...defaultProps} loading={true} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display error message when error is provided', () => {
      render(<ByeOverviewView {...defaultProps} error="Failed to load data" />);

      expect(screen.getByText(/failed to load bye data/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
    });

    it('should display retry button on error', () => {
      render(<ByeOverviewView {...defaultProps} error="Test error" />);

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', async () => {
      const onRetry = vi.fn();
      render(<ByeOverviewView {...defaultProps} error="Test error" onRetry={onRetry} />);

      await userEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('no data state', () => {
    it('should display message when no season summary is available', () => {
      render(<ByeOverviewView {...defaultProps} seasonSummary={null} />);

      expect(screen.getByText(/no bye data available/i)).toBeInTheDocument();
    });

    it('should display message when teams array is empty', () => {
      render(<ByeOverviewView {...defaultProps} teams={[]} />);

      expect(screen.getByText(/no bye data available/i)).toBeInTheDocument();
    });
  });

  describe('grid display', () => {
    it('should display the bye overview grid when data is loaded', () => {
      render(<ByeOverviewView {...defaultProps} />);

      expect(screen.getByRole('table', { name: /bye overview grid/i })).toBeInTheDocument();
    });

    it('should display page title', () => {
      render(<ByeOverviewView {...defaultProps} />);

      expect(screen.getByRole('heading', { name: /bye overview/i })).toBeInTheDocument();
    });

    it('should display instructions', () => {
      render(<ByeOverviewView {...defaultProps} />);

      expect(screen.getByText(/view bye distribution across all teams and rounds/i)).toBeInTheDocument();
    });
  });
});
