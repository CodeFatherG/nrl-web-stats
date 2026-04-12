import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import { CompareProjectionsSection } from './CompareProjectionsSection';
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
      nil: { count: 1, frequency: 0.1 },
      low: { count: 2, frequency: 0.2 },
      moderate: { count: 4, frequency: 0.4 },
      high: { count: 2, frequency: 0.2 },
      boom: { count: 1, frequency: 0.1 },
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
    teamCode: 'BRO',
    position: 'Forward',
    seasonStats: null,
    scRounds: [],
    projection: makeProjection({ playerId: id }),
    projectionError: false,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('CompareProjectionsSection', () => {
  it('shows "Unavailable" for a player with projectionError', () => {
    const p1 = makePlayer('a');
    const p2 = makePlayer('b', { projectionError: true, projection: null });
    render(<CompareProjectionsSection players={[p1, p2]} />);
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('shows low sample warning icon when lowSampleWarning is true', () => {
    const p1 = makePlayer('a', {
      projection: makeProjection({ lowSampleWarning: true }),
    });
    render(<CompareProjectionsSection players={[p1]} />);
    const warningIcon = document.querySelector('[data-testid="low-sample-a"]');
    expect(warningIcon).toBeTruthy();
  });

  it('highlights the leader value for a metric', () => {
    const p1 = makePlayer('a', { projection: makeProjection({ projectedCeiling: 95 }) });
    const p2 = makePlayer('b', { projection: makeProjection({ projectedCeiling: 70 }) });
    render(<CompareProjectionsSection players={[p1, p2]} />);
    const leaderCell = document.querySelector('[data-testid="leader-projectedCeiling"]');
    expect(leaderCell).toBeTruthy();
  });

  it('does not highlight in single-player mode', () => {
    render(<CompareProjectionsSection players={[makePlayer('solo')]} />);
    const leaderCells = document.querySelectorAll('[data-testid^="leader-"]');
    expect(leaderCells.length).toBe(0);
  });

  it('shows "No data" when noUsableData is true', () => {
    const p1 = makePlayer('a', {
      projection: makeProjection({ noUsableData: true }),
    });
    render(<CompareProjectionsSection players={[p1]} />);
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  });
});
