import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from './test/utils';
import App from './App';
import * as api from './services/api';
import {
  mockHealthResponse,
  mockHealthResponseNoData,
  mockTeamsResponse,
  mockTeamScheduleResponse,
  mockRoundResponse,
} from './test/fixtures';

// Mock the API module
vi.mock('./services/api');

const mockedApi = vi.mocked(api);

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading state transitions', () => {
    it('should show loading state initially', async () => {
      // Set up a slow-resolving promise
      mockedApi.getHealth.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<App />);

      expect(screen.getByText('Loading NRL schedule data...')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should transition to ready state when health check succeeds with data', async () => {
      mockedApi.getHealth.mockResolvedValue(mockHealthResponse);
      mockedApi.getTeams.mockResolvedValue(mockTeamsResponse);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('NRL Schedule Dashboard')).toBeInTheDocument();
      });

      // Should show the tab navigation
      expect(screen.getByRole('tab', { name: /Team Schedule/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Round Overview/i })).toBeInTheDocument();
    });

    it('should transition to no-data state when health check succeeds with empty data', async () => {
      mockedApi.getHealth.mockResolvedValue(mockHealthResponseNoData);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('No Schedule Data Loaded')).toBeInTheDocument();
      });

      // Should show year selector and load button
      expect(screen.getByRole('button', { name: /Load Schedule/i })).toBeInTheDocument();
    });

    it('should transition to error state when health check fails', async () => {
      mockedApi.getHealth.mockRejectedValue(new Error('Network error'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
      });

      // Should show retry button
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });

    it('should retry health check when retry button is clicked', async () => {
      // First call fails
      mockedApi.getHealth.mockRejectedValueOnce(new Error('Network error'));
      // Second call succeeds
      mockedApi.getHealth.mockResolvedValueOnce(mockHealthResponse);
      mockedApi.getTeams.mockResolvedValue(mockTeamsResponse);

      render(<App />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

      // Should transition to ready state
      await waitFor(() => {
        expect(screen.getByText('NRL Schedule Dashboard')).toBeInTheDocument();
      });

      expect(mockedApi.getHealth).toHaveBeenCalledTimes(2);
    });
  });

  describe('tab switching behavior', () => {
    beforeEach(() => {
      mockedApi.getHealth.mockResolvedValue(mockHealthResponse);
      mockedApi.getTeams.mockResolvedValue(mockTeamsResponse);
      mockedApi.getTeamSchedule.mockResolvedValue(mockTeamScheduleResponse);
      mockedApi.getRound.mockResolvedValue(mockRoundResponse);
    });

    it('should default to Round Overview tab in compact mode', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Round Overview/i })).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });

      // Compact view mode toggle should be visible
      expect(screen.getByRole('button', { name: /Compact view/i })).toBeInTheDocument();
    });

    it('should switch to Team Schedule tab when clicked', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Team Schedule/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /Team Schedule/i }));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Team Schedule/i })).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });

      // Team selector should be visible
      expect(screen.getByLabelText('Select Team')).toBeInTheDocument();
    });

    it('should switch back to Round Overview tab', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Team Schedule/i })).toBeInTheDocument();
      });

      // Go to Team tab
      fireEvent.click(screen.getByRole('tab', { name: /Team Schedule/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Select Team')).toBeInTheDocument();
      });

      // Go back to Round tab
      fireEvent.click(screen.getByRole('tab', { name: /Round Overview/i }));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Round Overview/i })).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });

      // Compact view mode should be visible
      expect(screen.getByRole('button', { name: /Compact view/i })).toBeInTheDocument();
    });

    it('should show Bye Overview tab', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Bye Overview/i })).toBeInTheDocument();
      });
    });
  });

  describe('data loading from no-data state', () => {
    it('should trigger scrape and reload when Load Schedule is clicked', async () => {
      // Start with no data
      mockedApi.getHealth.mockResolvedValueOnce(mockHealthResponseNoData);
      // After scrape, return with data
      mockedApi.scrapeYear.mockResolvedValue({
        success: true,
        year: 2026,
        teamsLoaded: 17,
        fixturesLoaded: 459,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      mockedApi.getHealth.mockResolvedValueOnce(mockHealthResponse);
      mockedApi.getTeams.mockResolvedValue(mockTeamsResponse);

      render(<App />);

      // Wait for no-data state
      await waitFor(() => {
        expect(screen.getByText('No Schedule Data Loaded')).toBeInTheDocument();
      });

      // Click load button
      fireEvent.click(screen.getByRole('button', { name: /Load Schedule/i }));

      // Should call scrapeYear
      await waitFor(() => {
        expect(mockedApi.scrapeYear).toHaveBeenCalledWith(new Date().getFullYear());
      });

      // Should transition to ready state
      await waitFor(() => {
        expect(screen.getByText('NRL Schedule Dashboard')).toBeInTheDocument();
      });
    });
  });
});
