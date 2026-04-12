import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import { CompareRoundScoresTable } from './CompareRoundScoresTable';
import type { PlayerComparisonData } from '../views/CompareView';

function makePlayer(id: string, rounds: Array<{ round: number; score: number | null }>): PlayerComparisonData {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'SYD',
    position: 'Back',
    seasonStats: null,
    scRounds: rounds.map((r) => ({ round: r.round, totalScore: r.score, opponent: null })),
    projection: null,
    projectionError: false,
    loading: false,
    error: null,
  };
}

describe('CompareRoundScoresTable', () => {
  it('shows "DNP" for a round where player has no score but another player does', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 80 }, { round: 2, score: 60 }]);
    const p2 = makePlayer('b', [{ round: 1, score: 70 }]); // no round 2 entry
    render(<CompareRoundScoresTable players={[p1, p2]} />);
    expect(screen.getByText('DNP')).toBeTruthy();
  });

  it('renders round numbers as row labels', () => {
    const p1 = makePlayer('a', [{ round: 3, score: 55 }]);
    render(<CompareRoundScoresTable players={[p1]} />);
    expect(screen.getByText('Rd 3')).toBeTruthy();
  });

  it('highlights the max score in a row', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 90 }]);
    const p2 = makePlayer('b', [{ round: 1, score: 60 }]);
    render(<CompareRoundScoresTable players={[p1, p2]} />);
    const leaderCell = document.querySelector('[data-testid="leader-rd1"]');
    expect(leaderCell).toBeTruthy();
  });

  it('does not highlight in single-player mode', () => {
    const p1 = makePlayer('solo', [{ round: 1, score: 80 }]);
    render(<CompareRoundScoresTable players={[p1]} />);
    const leaderCells = document.querySelectorAll('[data-testid^="leader-"]');
    expect(leaderCells.length).toBe(0);
  });

  it('sorts by player column on header click', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 50 }, { round: 2, score: 100 }]);
    const p2 = makePlayer('b', [{ round: 1, score: 80 }, { round: 2, score: 30 }]);
    render(<CompareRoundScoresTable players={[p1, p2]} />);

    const sortLabel = screen.getByText('Player a');
    fireEvent.click(sortLabel); // sort by a descending — round 2 (100) should come first
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toContain('Rd 2');
  });
});
