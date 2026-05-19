import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';

interface GSRBadgeProps {
  /** Normalized GSR: 1.0 = league avg, >1 = easier, <1 = harder */
  normalizedGSR: number;
  sampleSizeWarning?: boolean;
  showValue?: boolean;
}

function getGSRColor(value: number): { bg: string; text: string } {
  if (value >= 1.1) return { bg: '#2e7d32', text: '#ffffff' }; // dark green
  if (value >= 1.05) return { bg: '#388e3c', text: '#ffffff' }; // green
  if (value >= 0.95) return { bg: '#f57c00', text: '#ffffff' }; // amber
  if (value >= 0.9) return { bg: '#d32f2f', text: '#ffffff' };  // red
  return { bg: '#b71c1c', text: '#ffffff' };                    // dark red
}

export function GSRBadge({ normalizedGSR, sampleSizeWarning = false, showValue = true }: GSRBadgeProps) {
  const { bg, text } = getGSRColor(normalizedGSR);
  const label = showValue ? normalizedGSR.toFixed(2) : 'GSR';
  const tooltipText = sampleSizeWarning
    ? `GSR ${normalizedGSR.toFixed(2)} (⚠ small sample)`
    : `GSR ${normalizedGSR.toFixed(2)} · >1.0 = easier, <1.0 = harder`;

  return (
    <Tooltip title={tooltipText} arrow>
      <Chip
        label={label}
        size="small"
        sx={{
          backgroundColor: bg,
          color: text,
          fontWeight: 600,
          minWidth: 48,
          fontSize: '0.7rem',
          opacity: sampleSizeWarning ? 0.75 : 1,
          cursor: 'help',
        }}
      />
    </Tooltip>
  );
}
