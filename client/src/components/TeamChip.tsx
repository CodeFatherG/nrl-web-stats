import { Chip } from '@mui/material';
import type { TeamChipProps } from '../types';

/**
 * Clickable team code chip for the significant bye statistics table.
 * Displays a team code and supports highlighting when selected.
 */
export function TeamChip({ teamCode, isHighlighted, onClick }: TeamChipProps) {
  return (
    <Chip
      label={teamCode}
      size="small"
      onClick={() => onClick(teamCode)}
      data-highlighted={isHighlighted}
      sx={{
        cursor: 'pointer',
        fontWeight: isHighlighted ? 'bold' : 'normal',
        backgroundColor: isHighlighted ? 'primary.light' : 'grey.200',
        color: isHighlighted ? 'primary.contrastText' : 'text.primary',
        '&:hover': {
          backgroundColor: isHighlighted ? 'primary.main' : 'grey.300',
        },
        m: 0.25,
      }}
    />
  );
}
