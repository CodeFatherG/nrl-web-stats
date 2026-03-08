/**
 * FormSparkline — inline SVG sparkline showing form score trajectory.
 * Renders last N form scores as a small polyline.
 */

import React from 'react';

interface FormSnapshot {
  round: number;
  formScore: number;
}

interface FormSparklineProps {
  snapshots: FormSnapshot[];
  width?: number;
  height?: number;
}

export const FormSparkline: React.FC<FormSparklineProps> = ({
  snapshots,
  width = 80,
  height = 24,
}) => {
  if (snapshots.length === 0) return null;

  const maxScore = 1.5;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = snapshots.map((s, i) => {
    const x = padding + (snapshots.length > 1 ? (i / (snapshots.length - 1)) * innerWidth : innerWidth / 2);
    const y = padding + innerHeight - (s.formScore / maxScore) * innerHeight;
    return `${x},${y}`;
  }).join(' ');

  // Determine trend color
  const lastN = snapshots.slice(-3);
  let stroke = '#9e9e9e'; // grey (stable)
  if (lastN.length >= 2) {
    const first = lastN[0]!.formScore;
    const last = lastN[lastN.length - 1]!.formScore;
    if (last > first * 1.1) stroke = '#4caf50'; // green (up)
    else if (last < first * 0.9) stroke = '#f44336'; // red (down)
  }

  // Parse point coordinates for dot rendering
  const coords = snapshots.map((s, i) => ({
    x: padding + (snapshots.length > 1 ? (i / (snapshots.length - 1)) * innerWidth : innerWidth / 2),
    y: padding + innerHeight - (s.formScore / maxScore) * innerHeight,
  }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ verticalAlign: 'middle' }}>
      {snapshots.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2} fill={stroke} />
      ))}
    </svg>
  );
};
