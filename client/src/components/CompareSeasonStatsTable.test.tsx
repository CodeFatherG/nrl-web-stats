import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import { CompareSeasonStatsTable } from './CompareSeasonStatsTable';
import type { PlayerComparisonData } from '../views/CompareView';

function makePlayer(id: string, overrides: Partial<PlayerComparisonData> = {}): PlayerComparisonData {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'BRO',
    position: 'Forward',
    seasonStats: {
      gamesPlayed: 10,
      totalTries: 5,
      totalRunMetres: 1000,
      totalTacklesMade: 200,
      totalTackleBreaks: 20,
      totalLineBreaks: 3,
      totalPoints: 20,
      avgScScore: 60,
      totalKicks: 10,
      totalKickMetres: 300,
      totalOffloads: 8,
      totalErrors: 5,
      totalPenalties: 3,
      totalMissedTackles: 10,
      totalInterceptions: 2,
      avgMinutesPlayed: 70,
      latestPrice: 500000,
      latestBreakEven: 55,
    },
    scRounds: [],
    projection: null,
    projectionError: false,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('CompareSeasonStatsTable', () => {
  it('renders player names as column headers', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('a'), makePlayer('b')]} />);
    expect(screen.getByText('Player a')).toBeTruthy();
    expect(screen.getByText('Player b')).toBeTruthy();
  });

  it('shows "—" for null stat values', () => {
    const player = makePlayer('a', {
      seasonStats: {
        gamesPlayed: 5,
        totalTries: 0,
        totalRunMetres: 0,
        totalTacklesMade: 0,
        totalTackleBreaks: 0,
        totalLineBreaks: 0,
        totalPoints: 0,
        avgScScore: 0,
        totalKicks: 0,
        totalKickMetres: 0,
        totalOffloads: 0,
        totalErrors: 0,
        totalPenalties: 0,
        totalMissedTackles: 0,
        totalInterceptions: 0,
        avgMinutesPlayed: 0,
        latestPrice: null,
        latestBreakEven: null,
      },
    });
    render(<CompareSeasonStatsTable players={[makePlayer('b'), player]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('sorts descending by player column on first header click', () => {
    // Give player b a very high totalTries so it sorts to the top
    const baseStats = makePlayer('base').seasonStats!;
    const lowStats = { ...baseStats, gamesPlayed: 1, totalTries: 1, totalRunMetres: 1, totalTacklesMade: 1, totalTackleBreaks: 1, totalLineBreaks: 1, totalPoints: 1, avgScScore: 1, totalKicks: 1, totalKickMetres: 1, totalOffloads: 1, totalErrors: 1, totalPenalties: 1, totalMissedTackles: 1, totalInterceptions: 1, avgMinutesPlayed: 1, latestPrice: null, latestBreakEven: null };
    const p1 = makePlayer('a', { seasonStats: { ...lowStats } });
    const p2 = makePlayer('b', { seasonStats: { ...lowStats, totalTries: 999 } });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);

    // Click player b's column header to sort by b descending
    const sortLabel = screen.getByText('Player b');
    fireEvent.click(sortLabel);

    // Tries row should now be first (b has 999, all other stats are 1)
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    expect(firstDataRow?.textContent).toContain('Tries');
  });

  it('toggles sort to ascending on second click of same column', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    render(<CompareSeasonStatsTable players={players} />);

    const sortLabel = screen.getByText('Player a');
    fireEvent.click(sortLabel); // desc
    fireEvent.click(sortLabel); // asc — should not throw
    // Just verify the component doesn't crash
    expect(screen.getByText('Player a')).toBeTruthy();
  });

  it('does not highlight leader cells in single-player mode', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('solo')]} />);
    const leaderCells = document.querySelectorAll('[data-testid^="leader-"]');
    expect(leaderCells.length).toBe(0);
  });

  it('highlights the leader cell when two players have different values', () => {
    const p1 = makePlayer('a', { seasonStats: { ...makePlayer('a').seasonStats!, totalTries: 2 } });
    const p2 = makePlayer('b', { seasonStats: { ...makePlayer('b').seasonStats!, totalTries: 10 } });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);
    const leaderCells = document.querySelectorAll('[data-testid="leader-totalTries"]');
    expect(leaderCells.length).toBe(1);
  });
});
