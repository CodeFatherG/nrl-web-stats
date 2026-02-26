import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { RoundOverviewView } from './RoundOverviewView';
import {
  mockTeams,
  mockRoundResponse,
  mockStrengthThresholds,
} from '../test/fixtures';

describe('RoundOverviewView', () => {
  const defaultProps = {
    year: 2026,
    selectedRound: 1,
    onRoundSelect: vi.fn(),
    roundData: null,
    teams: mockTeams,
    strengthThresholds: mockStrengthThresholds,
    loading: false,
    error: null,
  };

  describe('initial state', () => {
    it('should render round selector', () => {
      render(<RoundOverviewView {...defaultProps} />);
      expect(screen.getByLabelText('Select Round')).toBeInTheDocument();
    });

    it('should display selected round in selector', () => {
      render(<RoundOverviewView {...defaultProps} selectedRound={5} />);
      expect(screen.getByRole('combobox')).toHaveTextContent('Round 5');
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when loading', () => {
      render(<RoundOverviewView {...defaultProps} loading={true} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should disable round selector when loading', () => {
      render(<RoundOverviewView {...defaultProps} loading={true} />);
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('error state', () => {
    it('should display error message', () => {
      render(
        <RoundOverviewView
          {...defaultProps}
          error="Failed to load round data"
        />
      );
      expect(screen.getByText('Failed to load round data')).toBeInTheDocument();
    });

    it('should render error as alert', () => {
      render(
        <RoundOverviewView
          {...defaultProps}
          error="Error message"
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('with round data', () => {
    const propsWithData = {
      ...defaultProps,
      roundData: mockRoundResponse,
    };

    it('should display round title', () => {
      render(<RoundOverviewView {...propsWithData} />);
      expect(screen.getByText('Round 1 - 2026 Season')).toBeInTheDocument();
    });

    it('should display match count', () => {
      render(<RoundOverviewView {...propsWithData} />);
      // 7 matches in mock data
      expect(screen.getByText('7 matches')).toBeInTheDocument();
    });

    it('should display match cards', () => {
      render(<RoundOverviewView {...propsWithData} />);

      // First match: Brisbane vs Sydney
      expect(screen.getByText('Brisbane Broncos')).toBeInTheDocument();
      expect(screen.getByText('Sydney Roosters')).toBeInTheDocument();

      // Second match: Melbourne vs Penrith
      expect(screen.getByText('Melbourne Storm')).toBeInTheDocument();
      expect(screen.getByText('Penrith Panthers')).toBeInTheDocument();
    });

    it('should display bye teams section', () => {
      render(<RoundOverviewView {...propsWithData} />);

      // 3 bye teams in mock data: DOL, CBY, WST
      expect(screen.getByText('Teams on Bye (3)')).toBeInTheDocument();
      expect(screen.getByText('Dolphins')).toBeInTheDocument();
      expect(screen.getByText('Canterbury-Bankstown Bulldogs')).toBeInTheDocument();
      expect(screen.getByText('Wests Tigers')).toBeInTheDocument();
    });

    it('should display strength ratings on match cards', () => {
      render(<RoundOverviewView {...propsWithData} />);

      // First match strengths: 420 (unique) and 380 (appears multiple times)
      expect(screen.getByText('420')).toBeInTheDocument();
      // 380 appears twice (BRI-SYD away strength and NTH home strength)
      expect(screen.getAllByText('380').length).toBeGreaterThan(0);
    });
  });

  describe('round selection', () => {
    it('should call onRoundSelect when round is changed', async () => {
      const onRoundSelect = vi.fn();
      render(<RoundOverviewView {...defaultProps} onRoundSelect={onRoundSelect} />);

      const select = screen.getByRole('combobox');
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Round 10'));

      expect(onRoundSelect).toHaveBeenCalledWith(10);
    });
  });

  describe('no bye teams', () => {
    it('should not display bye section when no teams on bye', () => {
      const roundDataNoByes = {
        ...mockRoundResponse,
        byeTeams: [],
      };

      render(<RoundOverviewView {...defaultProps} roundData={roundDataNoByes} />);

      expect(screen.queryByText(/Teams on Bye/i)).not.toBeInTheDocument();
    });
  });
});
