import type { ReactNode } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  accent?: string;
  icon?: ReactNode;
}

const TREND_ICONS = {
  up: <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />,
  down: <TrendingDownIcon fontSize="small" sx={{ color: 'error.main' }} />,
  neutral: <TrendingFlatIcon fontSize="small" sx={{ color: 'text.disabled' }} />,
};

export function StatCard({ label, value, subValue, trend, accent, icon }: StatCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 2,
        borderTop: accent ? `3px solid ${accent}` : undefined,
        minWidth: 120,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, fontSize: '0.65rem' }}>
          {label}
        </Typography>
        {icon && <Box sx={{ color: 'text.disabled', mt: -0.25 }}>{icon}</Box>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {value}
        </Typography>
        {trend && TREND_ICONS[trend]}
      </Box>
      {subValue && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {subValue}
        </Typography>
      )}
    </Paper>
  );
}
