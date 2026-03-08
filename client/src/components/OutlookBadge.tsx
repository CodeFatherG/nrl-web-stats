/**
 * OutlookBadge — MUI Chip displaying match outlook difficulty label.
 * Easy: green, Competitive: amber, Tough: red, Upset Alert: purple.
 */

import React from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';

type OutlookLabel = 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';

interface OutlookBadgeProps {
  label: OutlookLabel;
  tooltip?: string;
}

const labelColors: Record<OutlookLabel, { bg: string; color: string }> = {
  'Easy': { bg: '#e8f5e9', color: '#2e7d32' },
  'Competitive': { bg: '#fff8e1', color: '#f57f17' },
  'Tough': { bg: '#ffebee', color: '#c62828' },
  'Upset Alert': { bg: '#f3e5f5', color: '#6a1b9a' },
};

export const OutlookBadge: React.FC<OutlookBadgeProps> = ({ label, tooltip }) => {
  if (!label) return null;

  const colors = labelColors[label];
  const chip = (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: colors.bg,
        color: colors.color,
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
    />
  );

  if (tooltip) {
    return <Tooltip title={tooltip} arrow>{chip}</Tooltip>;
  }

  return chip;
};
