import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

interface SupercoachPositionChipsProps {
  scPosition: string | null | undefined;
  size?: 'small' | 'medium';
}

// Split on comma, NOT slash — `5/8` is a valid single SC position that contains a slash.
function splitScPosition(scPosition: string): string[] {
  return scPosition
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
}

export function SupercoachPositionChips({ scPosition, size = 'small' }: SupercoachPositionChipsProps) {
  if (!scPosition) return null;
  const positions = splitScPosition(scPosition);
  if (positions.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5}>
      {positions.map(p => (
        <Chip key={p} label={p} size={size} variant="outlined" />
      ))}
    </Stack>
  );
}
