import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import {
  RadarChart as RechartsRadar,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getTeamPrimary } from '../../utils/teamColors';
import type { PlayerComparisonData } from '../../views/CompareView';
import type { PlayerMatchSupercoach } from '../../services/api';

interface ScRadarChartProps {
  players: PlayerComparisonData[];
  height?: number;
}

interface ScValues {
  scAvg: number;
  scTotal: number;
  avgScoring: number;
  avgCreate: number;
  avgEvade: number;
  avgBase: number;
  avgDefence: number;
  avgNegative: number;
  hasScData: boolean;
}

const SC_AXES: Array<{ key: keyof ScValues; label: string; higherIsBetter: boolean }> = [
  { key: 'scAvg',      label: 'SC Avg',   higherIsBetter: true  },
  { key: 'scTotal',    label: 'SC Total', higherIsBetter: true  },
  { key: 'avgScoring', label: 'Scoring',  higherIsBetter: true  },
  { key: 'avgCreate',  label: 'Create',   higherIsBetter: true  },
  { key: 'avgEvade',   label: 'Evade',    higherIsBetter: true  },
  { key: 'avgBase',    label: 'Base',     higherIsBetter: true  },
  { key: 'avgDefence', label: 'Defence',  higherIsBetter: true  },
  { key: 'avgNegative',label: 'Negative', higherIsBetter: false },
];

function avgCategories(matches: PlayerMatchSupercoach[]) {
  if (matches.length === 0) {
    return { scoring: 0, create: 0, evade: 0, base: 0, defence: 0, negative: 0 };
  }
  const sum = matches.reduce(
    (acc, m) => ({
      scoring:  acc.scoring  + m.categoryTotals.scoring,
      create:   acc.create   + m.categoryTotals.create,
      evade:    acc.evade    + m.categoryTotals.evade,
      base:     acc.base     + m.categoryTotals.base,
      defence:  acc.defence  + m.categoryTotals.defence,
      negative: acc.negative + m.categoryTotals.negative,
    }),
    { scoring: 0, create: 0, evade: 0, base: 0, defence: 0, negative: 0 },
  );
  const n = matches.length;
  return {
    scoring:  sum.scoring  / n,
    create:   sum.create   / n,
    evade:    sum.evade    / n,
    base:     sum.base     / n,
    defence:  sum.defence  / n,
    negative: sum.negative / n,
  };
}

function extractScValues(p: PlayerComparisonData): ScValues {
  const sc = p.sc;
  if (!sc) {
    return {
      scAvg: 0, scTotal: 0,
      avgScoring: 0, avgCreate: 0, avgEvade: 0,
      avgBase: 0, avgDefence: 0, avgNegative: 0,
      hasScData: false,
    };
  }
  const cats = avgCategories(sc.matches);
  return {
    scAvg:       sc.seasonAverage,
    scTotal:     sc.seasonTotal,
    avgScoring:  cats.scoring,
    avgCreate:   cats.create,
    avgEvade:    cats.evade,
    avgBase:     cats.base,
    avgDefence:  cats.defence,
    avgNegative: cats.negative,
    hasScData:   true,
  };
}

function normaliseScValues(playerValues: ScValues[]): Record<string, number>[] {
  return SC_AXES.map(({ key, higherIsBetter }) => {
    const rawValues = playerValues.map(v => v[key] as number);
    const max = Math.max(...rawValues, 1);
    const min = Math.min(...rawValues, 0);
    const range = max - min;

    const entry: Record<string, number> = {};
    for (let i = 0; i < playerValues.length; i++) {
      const raw = playerValues[i]![key] as number;
      if (range === 0) {
        entry[`p${i}`] = 100;
      } else if (higherIsBetter) {
        entry[`p${i}`] = Math.round(((raw - min) / range) * 100);
      } else {
        entry[`p${i}`] = Math.round(((max - raw) / range) * 100);
      }
    }
    return entry;
  });
}

const COLOURS = ['#1976D2', '#E8A020', '#4CAF50', '#9C27B0', '#F44336', '#00BCD4'];

export function ScRadarChart({ players, height = 300 }: ScRadarChartProps) {
  const theme = useTheme();
  const playerValues = players.map(extractScValues);

  const normalisedPerAxis = normaliseScValues(playerValues);

  const data = SC_AXES.map((axis, axisIdx) => {
    const entry: Record<string, unknown> = { stat: axis.label };
    players.forEach((p, pi) => {
      const legendName = playerValues[pi]!.hasScData ? p.playerName : `${p.playerName} (no SC data)`;
      entry[legendName] = normalisedPerAxis[axisIdx]![`p${pi}`] ?? 0;
    });
    return entry;
  });

  const legendNames = players.map((p, pi) =>
    playerValues[pi]!.hasScData ? p.playerName : `${p.playerName} (no SC data)`
  );

  return (
    <Box sx={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadar data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid stroke={theme.palette.divider} />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
          {legendNames.map((name, i) => (
            <Radar
              key={name}
              name={name}
              dataKey={name}
              stroke={COLOURS[i] ?? getTeamPrimary(players[i]?.teamCode ?? '')}
              fill={COLOURS[i] ?? getTeamPrimary(players[i]?.teamCode ?? '')}
              fillOpacity={0.15}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </RechartsRadar>
      </ResponsiveContainer>
    </Box>
  );
}
