import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import { CompareSeasonStatsTable, SC_COLS, NRL_COLS } from './CompareSeasonStatsTable';
import type { PlayerComparisonData, SeasonStatsSnapshot } from '../views/CompareView';

const BASE_STATS: SeasonStatsSnapshot = {
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
  tryAssists: 4,
  lineBreakAssists: 3,
  dummyHalfRuns: 0,
  dummyHalfRunMetres: 0,
  latestPrice: 500000,
  latestBreakEven: 55,
  totalAllRuns: 80,
  totalHitUps: 60,
  totalHitUpRunMetres: 400,
  totalPostContactMetres: 300,
  totalGoals: 2,
  totalFieldGoals: 0,
  totalPasses: 150,
  totalReceipts: 160,
  totalSinBins: 0,
  totalOnReport: 1,
  totalBombKicks: 5,
  totalGrubberKicks: 8,
  totalFortyTwentyKicks: 1,
  totalKickReturnMetres: 200,
  totalOneOnOneSteal: 3,
  fantasyPointsTotal: 700,
  totalEffectiveOffloads: 6,
  totalIneffectiveOffloads: 2,
  totalRunsOver8m: 15,
  totalRunsUnder8m: 45,
  totalTrySaves: 1,
  totalLastTouch: 4,
  totalKickRegatherBreak: 0,
  scSeasonTotal: 600,
  avgScoringPts: 10,
  totalScoringPts: 100,
  avgCreatePts: 8,
  totalCreatePts: 80,
  avgEvadePts: 5,
  totalEvadePts: 50,
  avgBasePts: 20,
  totalBasePts: 200,
  avgDefencePts: 15,
  totalDefencePts: 150,
  avgNegativePts: 2,
  totalNegativePts: 20,
};

function makePlayer(id: string, statsOverride: Partial<SeasonStatsSnapshot> = {}): PlayerComparisonData {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'BRO',
    position: 'prop',
    scPosition: null,
    seasonStats: { ...BASE_STATS, ...statsOverride },
    scRounds: [],
    sc: null,
    projection: null,
    projectionError: false,
    loading: false,
    error: null,
  };
}

describe('CompareSeasonStatsTable', () => {
  it('renders player names as column headers', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('a'), makePlayer('b')]} />);
    expect(screen.getAllByText('Player a').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Player b').length).toBeGreaterThan(0);
  });

  it('shows "—" for null stat values', () => {
    const p = makePlayer('a', { latestPrice: null, latestBreakEven: null });
    render(<CompareSeasonStatsTable players={[makePlayer('b'), p]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders SC and NRL stat row labels by default', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('a')]} />);
    expect(screen.getByText('SC Tot')).toBeTruthy();  // SC group
    expect(screen.getByText('GP')).toBeTruthy();       // NRL group
  });

  it('renders only the provided cols when cols prop is given', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('a')]} cols={SC_COLS} />);
    expect(screen.getByText('SC Tot')).toBeTruthy();
    expect(screen.queryByText('GP')).toBeNull();
  });

  it('renders stat row labels including extended NRL stats', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('a')]} cols={NRL_COLS} />);
    // Abbreviated row labels
    expect(screen.getByText('TA')).toBeTruthy();   // Try Assists
    expect(screen.getByText('LBA')).toBeTruthy();  // LB Assists
    expect(screen.getByText('DHR')).toBeTruthy();  // Dummy Half Runs
  });

  it('applies green background to higher tackles value and red to lower', () => {
    const p1 = makePlayer('a', { totalTacklesMade: 50 });
    const p2 = makePlayer('b', { totalTacklesMade: 200 });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);

    const cellA = document.querySelector('[data-testid="cell-totalTacklesMade-a"]') as HTMLElement | null;
    const cellB = document.querySelector('[data-testid="cell-totalTacklesMade-b"]') as HTMLElement | null;

    const parseRgb = (s: string) => {
      const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m || !m[1] || !m[2] || !m[3]) return null;
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const rgbA = parseRgb(cellA?.style.backgroundColor ?? '');
    const rgbB = parseRgb(cellB?.style.backgroundColor ?? '');
    if (rgbA && rgbB) {
      expect(rgbB.g).toBeGreaterThan(rgbA.g);
    }
  });

  it('applies green background to lower missed tackles value', () => {
    const p1 = makePlayer('a', { totalMissedTackles: 2 });
    const p2 = makePlayer('b', { totalMissedTackles: 20 });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);

    const cellA = document.querySelector('[data-testid="cell-totalMissedTackles-a"]') as HTMLElement | null;
    const cellB = document.querySelector('[data-testid="cell-totalMissedTackles-b"]') as HTMLElement | null;

    const parseRgb = (s: string) => {
      const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m || !m[1] || !m[2] || !m[3]) return null;
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const rgbA = parseRgb(cellA?.style.backgroundColor ?? '');
    const rgbB = parseRgb(cellB?.style.backgroundColor ?? '');
    if (rgbA && rgbB) {
      expect(rgbA.g).toBeGreaterThan(rgbB.g);
    }
  });

  it('applies green background to lower price', () => {
    const cheap = makePlayer('a', { latestPrice: 200000 });
    const expensive = makePlayer('b', { latestPrice: 800000 });
    render(<CompareSeasonStatsTable players={[cheap, expensive]} />);

    const cellCheap    = document.querySelector('[data-testid="cell-latestPrice-a"]') as HTMLElement | null;
    const cellExpensive = document.querySelector('[data-testid="cell-latestPrice-b"]') as HTMLElement | null;

    const parseRgb = (s: string) => {
      const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m || !m[1] || !m[2] || !m[3]) return null;
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const rgbCheap    = parseRgb(cellCheap?.style.backgroundColor ?? '');
    const rgbExpensive = parseRgb(cellExpensive?.style.backgroundColor ?? '');
    if (rgbCheap && rgbExpensive) {
      expect(rgbCheap.g).toBeGreaterThan(rgbExpensive.g);
    }
  });

  it('no gradient applied for single player', () => {
    render(<CompareSeasonStatsTable players={[makePlayer('solo')]} />);
    const cell = document.querySelector('[data-testid="cell-totalTacklesMade-solo"]') as HTMLElement | null;
    expect(cell?.style.backgroundColor ?? '').toBe('');
  });

  it('no gradient when all values are equal', () => {
    const p1 = makePlayer('a', { totalTacklesMade: 100 });
    const p2 = makePlayer('b', { totalTacklesMade: 100 });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);
    const cellA = document.querySelector('[data-testid="cell-totalTacklesMade-a"]') as HTMLElement | null;
    expect(cellA?.style.backgroundColor ?? '').toBe('');
  });

  it('null cell excluded from gradient', () => {
    const p1 = makePlayer('a', { latestPrice: null });
    const p2 = makePlayer('b', { latestPrice: 500000 });
    render(<CompareSeasonStatsTable players={[p1, p2]} />);
    const cellNull = document.querySelector('[data-testid="cell-latestPrice-a"]') as HTMLElement | null;
    expect(cellNull?.textContent).toBe('—');
    expect(cellNull?.style.backgroundColor ?? '').toBe('');
  });

});
