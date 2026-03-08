/**
 * PlayerTrendMarker — arrow icon indicating trend direction.
 * Up: green arrow, Down: red arrow, Stable: grey dash.
 */

import React from 'react';
import Tooltip from '@mui/material/Tooltip';

interface PlayerTrendMarkerProps {
  direction: 'up' | 'down' | 'stable';
  deviationPercent?: number;
}

const config = {
  up: { symbol: '\u2191', color: '#4caf50', label: 'Trending up' },
  down: { symbol: '\u2193', color: '#f44336', label: 'Trending down' },
  stable: { symbol: '\u2014', color: '#9e9e9e', label: 'Stable' },
};

export const PlayerTrendMarker: React.FC<PlayerTrendMarkerProps> = ({
  direction,
  deviationPercent,
}) => {
  const { symbol, color, label } = config[direction];
  const tooltip = deviationPercent !== undefined
    ? `${label} (${deviationPercent > 0 ? '+' : ''}${deviationPercent.toFixed(1)}%)`
    : label;

  return (
    <Tooltip title={tooltip} arrow>
      <span
        style={{
          color,
          fontWeight: 700,
          fontSize: '1rem',
          lineHeight: 1,
          cursor: 'default',
        }}
      >
        {symbol}
      </span>
    </Tooltip>
  );
};
