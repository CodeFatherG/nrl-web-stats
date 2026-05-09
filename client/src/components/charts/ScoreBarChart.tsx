import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface ScoreEntry {
  round: number;
  score: number;
  isComplete?: boolean;
  opponent?: string;
}

interface ScoreBarChartProps {
  data: ScoreEntry[];
  average?: number;
  height?: number;
}

export function ScoreBarChart({ data, average, height = 200 }: ScoreBarChartProps) {
  const theme = useTheme();

  return (
    <Box sx={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="round"
            tickFormatter={v => `R${v}`}
            tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
          />
          <YAxis tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
          <Tooltip
            formatter={(value: number, _name: string, props) => [
              `${value} pts`,
              props.payload.opponent ? `vs ${props.payload.opponent}` : 'Score',
            ]}
            labelFormatter={label => `Round ${label}`}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          {average != null && (
            <ReferenceLine
              y={average}
              stroke={theme.palette.text.disabled}
              strokeDasharray="4 4"
              label={{ value: `Avg ${average.toFixed(0)}`, position: 'right', fontSize: 10, fill: theme.palette.text.disabled }}
            />
          )}
          <Bar dataKey="score" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  !entry.isComplete
                    ? theme.palette.warning.light
                    : entry.score < 0
                    ? theme.palette.error.main
                    : average != null && entry.score >= average * 1.1
                    ? theme.palette.success.main
                    : theme.palette.primary.main
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
