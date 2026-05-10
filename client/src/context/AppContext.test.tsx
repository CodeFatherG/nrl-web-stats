import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '../test/utils';
import { AppContextProvider } from './AppContext';
import { useAppContext } from '../hooks/useAppContext';

vi.mock('../services/api', () => ({
  getHealth: vi.fn(),
  getTeams: vi.fn(),
}));

import { getHealth, getTeams } from '../services/api';
const mockGetHealth = vi.mocked(getHealth);
const mockGetTeams = vi.mocked(getTeams);

function TestConsumer() {
  const ctx = useAppContext();
  return (
    <div>
      <div data-testid="status">{ctx.status}</div>
      <div data-testid="year">{ctx.currentYear}</div>
      <div data-testid="years">{ctx.loadedYears.join(',')}</div>
      <div data-testid="teams">{ctx.teams.map(t => t.code).join(',')}</div>
      <div data-testid="error">{ctx.error ?? ''}</div>
      <button onClick={ctx.refetch}>refetch</button>
    </div>
  );
}

// Wrap directly in JSX instead of using the `wrapper` render option,
// since renderWithTheme omits 'wrapper' from its options type.
function renderApp() {
  return render(
    <AppContextProvider>
      <TestConsumer />
    </AppContextProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppContext', () => {
  describe('status transitions', () => {
    it('starts in loading state before promises resolve', () => {
      mockGetHealth.mockReturnValue(new Promise(() => {}));
      mockGetTeams.mockReturnValue(new Promise(() => {}));
      renderApp();
      expect(screen.getByTestId('status')).toHaveTextContent('loading');
    });

    it('transitions to ready when health has years and teams resolves', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [2024, 2025], totalFixtures: 100 });
      mockGetTeams.mockResolvedValue({ teams: [{ code: 'BRI', name: 'Brisbane Broncos' }] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    });

    it('transitions to no-data when loadedYears is empty', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [], totalFixtures: 0 });
      mockGetTeams.mockResolvedValue({ teams: [] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('no-data'));
    });

    it('transitions to error when getHealth rejects', async () => {
      mockGetHealth.mockRejectedValue(new Error('Network failure'));
      mockGetTeams.mockResolvedValue({ teams: [] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    });

    it('transitions to error when getTeams rejects', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [2025], totalFixtures: 10 });
      mockGetTeams.mockRejectedValue(new Error('Teams unavailable'));
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    });
  });

  describe('data population', () => {
    beforeEach(() => {
      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [2024, 2025], totalFixtures: 100 });
      mockGetTeams.mockResolvedValue({
        teams: [{ code: 'BRI', name: 'Brisbane Broncos' }, { code: 'SYD', name: 'Sydney Roosters' }],
      });
    });

    it('sets currentYear to the maximum of loadedYears', async () => {
      renderApp();
      await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent('2025'));
    });

    it('populates loadedYears from getHealth response', async () => {
      renderApp();
      await waitFor(() => expect(screen.getByTestId('years')).toHaveTextContent('2024,2025'));
    });

    it('populates teams from getTeams response', async () => {
      renderApp();
      await waitFor(() => expect(screen.getByTestId('teams')).toHaveTextContent('BRI,SYD'));
    });
  });

  describe('error message', () => {
    it('surfaces the error message string on failure', async () => {
      mockGetHealth.mockRejectedValue(new Error('Connection refused'));
      mockGetTeams.mockResolvedValue({ teams: [] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Connection refused'));
    });
  });

  describe('refetch', () => {
    it('triggers a new API call when refetch is invoked', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [2025], totalFixtures: 10 });
      mockGetTeams.mockResolvedValue({ teams: [] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(mockGetHealth).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: /refetch/i }));
      await waitFor(() => expect(mockGetHealth).toHaveBeenCalledTimes(2));
    });

    it('clears a previous error and reloads on refetch', async () => {
      mockGetHealth.mockRejectedValueOnce(new Error('First failure'));
      mockGetTeams.mockResolvedValue({ teams: [] });
      renderApp();
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));

      mockGetHealth.mockResolvedValue({ status: 'ok', loadedYears: [2025], totalFixtures: 10 });
      fireEvent.click(screen.getByRole('button', { name: /refetch/i }));
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('error')).toHaveTextContent('');
    });
  });
});
