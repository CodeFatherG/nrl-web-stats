import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import { CompareAnalyticsSummary } from './CompareAnalyticsSummary';
import type { PlayerComparisonData } from '../views/CompareView';
import type { PlayerProjectionResponse } from '../services/api';

function makeProjection(overrides: Partial<PlayerProjectionResponse> = {}): PlayerProjectionResponse {
  return {
    playerId: 'p1',
    playerName: 'Test',
    teamCode: 'BRO',
    position: 'Forward',
    avgMinutes: 75,
    floorMean: 30,
    floorStd: 5,
    floorCv: 0.17,
    floorPerMinute: 0.4,
    spikeMean: 40,
    spikeStd: 10,
    spikeCv: 0.25,
    spikePerMinute: 0.53,
    spikeP25: 30,
    spikeP50: 40,
    spikeP75: 50,
    spikeP90: 65,
    spikeDistribution: {
      negative: { count: 0, frequency: 0 },
      nil: { count: 0, frequency: 0 },
      low: { count: 0, frequency: 0 },
      moderate: { count: 10, frequency: 1 },
      high: { count: 0, frequency: 0 },
      boom: { count: 0, frequency: 0 },
    },
    projectedTotal: 70,
    projectedFloor: 60,
    projectedCeiling: 95,
    gamesPlayed: 10,
    lowSampleWarning: false,
    noUsableData: false,
    games: [],
    ...overrides,
  };
}

function makePlayer(id: string, overrides: Partial<PlayerComparisonData> = {}): PlayerComparisonData {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'SYD',
    position: 'Back',
    seasonStats: {
      gamesPlayed: 10,
      totalTries: 3,
      totalRunMetres: 800,
      totalTacklesMade: 150,
      totalTackleBreaks: 10,
      totalLineBreaks: 2,
      totalPoints: 12,
      avgScScore: 55,
      totalKicks: 5,
      totalKickMetres: 200,
      totalOffloads: 4,
      totalErrors: 3,
      totalPenalties: 2,
      totalMissedTackles: 8,
      totalInterceptions: 1,
      avgMinutesPlayed: 65,
      latestPrice: 450000,
      latestBreakEven: 50,
    },
    scRounds: [],
    projection: makeProjection({ playerId: id }),
    projectionError: false,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('CompareAnalyticsSummary', () => {
  it('renders player names', () => {
    render(<CompareAnalyticsSummary players={[makePlayer('a'), makePlayer('b')]} />);
    expect(screen.getByText('Player a')).toBeTruthy();
    expect(screen.getByText('Player b')).toBeTruthy();
  });

  it('highlights the leader for a metric when two players have different values', () => {
    const p1 = makePlayer('a', { projection: makeProjection({ projectedTotal: 90 }) });
    const p2 = makePlayer('b', { projection: makeProjection({ projectedTotal: 60 }) });
    render(<CompareAnalyticsSummary players={[p1, p2]} />);
    const leader = document.querySelector('[data-testid="leader-projectedTotal"]');
    expect(leader).toBeTruthy();
  });

  it('does not highlight when only one player in set', () => {
    render(<CompareAnalyticsSummary players={[makePlayer('solo')]} />);
    const leaders = document.querySelectorAll('[data-testid^="leader-"]');
    expect(leaders.length).toBe(0);
  });

  it('shows "—" for null metric values', () => {
    const player = makePlayer('a', {
      seasonStats: { ...makePlayer('a').seasonStats!, latestPrice: null, latestBreakEven: null },
    });
    render(<CompareAnalyticsSummary players={[player]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "Unavailable" for projection metrics when projectionError is true', () => {
    const player = makePlayer('a', { projectionError: true, projection: null });
    render(<CompareAnalyticsSummary players={[player]} />);
    const unavailable = screen.getAllByText('Unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
  });
});
