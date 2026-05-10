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
import type { AxisConfig } from '../../utils/positionGroups';

interface PlayerRadarEntry {
  name: string;
  teamCode: string;
  stats: Record<string, number>;
}

interface RadarChartProps {
  players: PlayerRadarEntry[];
  axes: AxisConfig[];
  height?: number;
}

function normalise(players: PlayerRadarEntry[], axes: AxisConfig[]) {
  const maxes = axes.reduce<Record<string, number>>((acc, { key }) => {
    acc[key] = Math.max(...players.map(p => p.stats[key] ?? 0), 1);
    return acc;
  }, {});

  return axes.map(({ key, label }) => {
    const entry: Record<string, unknown> = { stat: label };
    for (const p of players) {
      entry[p.name] = Math.round(((p.stats[key] ?? 0) / (maxes[key] ?? 1)) * 100);
    }
    return entry;
  });
}

const COLOURS = ['#1976D2', '#E8A020', '#4CAF50', '#9C27B0', '#F44336', '#00BCD4'];

export function RadarChart({ players, axes, height = 300 }: RadarChartProps) {
  const theme = useTheme();
  const data = normalise(players, axes);

  return (
    <Box sx={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadar data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid stroke={theme.palette.divider} />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
          {players.map((p, i) => (
            <Radar
              key={p.name}
              name={p.name}
              dataKey={p.name}
              stroke={COLOURS[i] ?? getTeamPrimary(p.teamCode)}
              fill={COLOURS[i] ?? getTeamPrimary(p.teamCode)}
              fillOpacity={0.15}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </RechartsRadar>
      </ResponsiveContainer>
    </Box>
  );
}
