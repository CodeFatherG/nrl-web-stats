// Canonical position strings from src/domain/positions.ts
type PositionGroup = 'forward' | 'hooker' | 'half' | 'back';

export interface AxisConfig {
  key: string;
  label: string;
  higherIsBetter: boolean;
}

const POSITION_GROUP_MAP: Record<string, PositionGroup> = {
  prop: 'forward',
  'second row': 'forward',
  lock: 'forward',
  hooker: 'hooker',
  halfback: 'half',
  'five-eighth': 'half',
  centre: 'back',
  wing: 'back',
  winger: 'back', // alias
  fullback: 'back',
};

const GROUP_AXES: Record<PositionGroup, AxisConfig[]> = {
  forward: [
    { key: 'totalTacklesMade', label: 'Tackles', higherIsBetter: true },
    { key: 'totalRunMetres', label: 'Run M', higherIsBetter: true },
    { key: 'totalTackleBreaks', label: 'TB', higherIsBetter: true },
    { key: 'totalOffloads', label: 'Offloads', higherIsBetter: true },
    { key: 'totalLineBreaks', label: 'Line Breaks', higherIsBetter: true },
    { key: 'avgScScore', label: 'SC Avg', higherIsBetter: true },
  ],
  hooker: [
    { key: 'totalTacklesMade', label: 'Tackles', higherIsBetter: true },
    { key: 'totalRunMetres', label: 'Run M', higherIsBetter: true },
    { key: 'totalTackleBreaks', label: 'TB', higherIsBetter: true },
    { key: 'tryAssists', label: 'Try Ast', higherIsBetter: true },
    { key: 'dummyHalfRuns', label: 'DH Runs', higherIsBetter: true },
    { key: 'avgScScore', label: 'SC Avg', higherIsBetter: true },
  ],
  half: [
    { key: 'totalKicks', label: 'Kicks', higherIsBetter: true },
    { key: 'totalKickMetres', label: 'Kick M', higherIsBetter: true },
    { key: 'tryAssists', label: 'Try Ast', higherIsBetter: true },
    { key: 'lineBreakAssists', label: 'LBA', higherIsBetter: true },
    { key: 'totalRunMetres', label: 'Run M', higherIsBetter: true },
    { key: 'avgScScore', label: 'SC Avg', higherIsBetter: true },
  ],
  back: [
    { key: 'totalTries', label: 'Tries', higherIsBetter: true },
    { key: 'totalRunMetres', label: 'Run M', higherIsBetter: true },
    { key: 'totalLineBreaks', label: 'Line Breaks', higherIsBetter: true },
    { key: 'totalTackleBreaks', label: 'TB', higherIsBetter: true },
    { key: 'totalInterceptions', label: 'Intercepts', higherIsBetter: true },
    { key: 'avgScScore', label: 'SC Avg', higherIsBetter: true },
  ],
};

// All axes from all groups merged (used as fallback for unknown positions)
const ALL_AXES: AxisConfig[] = Object.values(GROUP_AXES).reduce<AxisConfig[]>(
  (acc, axes) => {
    for (const axis of axes) {
      if (!acc.some(a => a.key === axis.key)) acc.push(axis);
    }
    return acc;
  },
  [],
);

/**
 * Returns the union of radar axes for all position strings provided.
 * Deduplicates by key. Unknown/interchange positions use the full axis set.
 */
export function getRadarAxes(positions: string[]): AxisConfig[] {
  const groups = new Set<PositionGroup>();
  let hasUnknown = false;

  for (const pos of positions) {
    const group = POSITION_GROUP_MAP[pos.toLowerCase().trim()];
    if (group) {
      groups.add(group);
    } else {
      hasUnknown = true;
    }
  }

  if (hasUnknown || groups.size === 0) return ALL_AXES;

  const axes: AxisConfig[] = [];
  for (const group of groups) {
    for (const axis of GROUP_AXES[group]) {
      if (!axes.some(a => a.key === axis.key)) {
        axes.push(axis);
      }
    }
  }
  return axes;
}
