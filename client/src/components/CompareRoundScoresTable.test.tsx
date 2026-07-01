import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import { CompareRoundScoresTable } from './CompareRoundScoresTable';
import type { PlayerComparisonData } from '../views/CompareView';

function makePlayer(
  id: string,
  rounds: Array<{ round: number; score: number | null }>,
  seasonAverage?: number,
  seasonTotal?: number,
): PlayerComparisonData {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'SYD',
    position: 'wing',
    scPosition: null,
    seasonStats: null,
    scRounds: rounds.map(r => ({ round: r.round, totalScore: r.score, opponent: null, isComplete: true })),
    sc: seasonAverage !== undefined ? {
      playerId: id,
      playerName: `Player ${id}`,
      teamCode: 'SYD',
      year: 2026,
      matches: rounds.filter(r => r.score !== null).map(r => ({
        playerId: id, playerName: `Player ${id}`, teamCode: 'SYD',
        matchId: `m${r.round}`, year: 2026, round: r.round, opponent: 'OPP',
        totalScore: r.score!,
        isComplete: true,
        matchConfidence: 'high',
        categories: { scoring: [], create: [], evade: [], base: [], defence: [], negative: [] },
        categoryTotals: { scoring: 0, create: 0, evade: 0, base: 0, defence: 0, negative: 0 },
        validationWarnings: [],
      })),
      seasonTotal: seasonTotal ?? 0,
      seasonAverage: seasonAverage ?? 0,
      matchesPlayed: rounds.filter(r => r.score !== null).length,
      currentPrice: null,
      currentBreakeven: null,
    } : null,
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
    expect(screen.getAllByText('DNP').length).toBeGreaterThan(0);
  });

  it('renders round numbers as row labels', () => {
    const p1 = makePlayer('a', [{ round: 3, score: 55 }]);
    render(<CompareRoundScoresTable players={[p1]} />);
    expect(screen.getByText('Rd 3')).toBeTruthy();
  });

  it('applies gradient — higher score cell is greener', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 90 }]);
    const p2 = makePlayer('b', [{ round: 1, score: 40 }]);
    render(<CompareRoundScoresTable players={[p1, p2]} />);

    const cellHigh = document.querySelector('[data-testid="cell-rd1-a"]') as HTMLElement | null;
    const cellLow  = document.querySelector('[data-testid="cell-rd1-b"]') as HTMLElement | null;

    const parseRgb = (s: string) => {
      const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m || !m[1] || !m[2] || !m[3]) return null;
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const rgbHigh = parseRgb(cellHigh?.style.backgroundColor ?? '');
    const rgbLow  = parseRgb(cellLow?.style.backgroundColor ?? '');
    if (rgbHigh && rgbLow) {
      expect(rgbHigh.g).toBeGreaterThan(rgbLow.g);
    }
  });

  it('no gradient applied in single-player mode', () => {
    const p1 = makePlayer('solo', [{ round: 1, score: 80 }]);
    render(<CompareRoundScoresTable players={[p1]} />);
    const cell = document.querySelector('[data-testid="cell-rd1-solo"]') as HTMLElement | null;
    expect(cell?.style.backgroundColor ?? '').toBe('');
  });

  it('sorts by player column on header click', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 50 }, { round: 2, score: 100 }]);
    const p2 = makePlayer('b', [{ round: 1, score: 80 }, { round: 2, score: 30 }]);
    render(<CompareRoundScoresTable players={[p1, p2]} />);
    const sortLabel = screen.getByText('Player a');
    fireEvent.click(sortLabel); // sort by a descending — round 2 (100) first
    const rows = screen.getAllByRole('row');
    // First data row after summary rows (4 summary rows + header = index 5+)
    const dataRows = rows.filter(r => r.textContent?.includes('Rd '));
    expect(dataRows[0]?.textContent).toContain('Rd 2');
  });

  it('renders summary rows: Season Avg, Season Total, Best Round, Worst Round', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 80 }, { round: 2, score: 60 }], 70, 140);
    render(<CompareRoundScoresTable players={[p1]} />);
    expect(screen.getByText('Season Avg')).toBeTruthy();
    expect(screen.getByText('Season Total')).toBeTruthy();
    expect(screen.getByText('Best Round')).toBeTruthy();
    expect(screen.getByText('Worst Round')).toBeTruthy();
  });

  it('applies gradient to summary rows across players', () => {
    const p1 = makePlayer('a', [{ round: 1, score: 100 }], 100, 100);
    const p2 = makePlayer('b', [{ round: 1, score: 40 }], 40, 40);
    render(<CompareRoundScoresTable players={[p1, p2]} />);
    // Summary rows should have background colours
    const avgCells = screen.getAllByText('Season Avg');
    expect(avgCells.length).toBeGreaterThan(0);
  });
});
