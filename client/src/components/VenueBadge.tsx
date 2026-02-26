import { Chip } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import FlightIcon from '@mui/icons-material/Flight';

interface VenueBadgeProps {
  isHome: boolean;
}

export function VenueBadge({ isHome }: VenueBadgeProps) {
  return (
    <Chip
      icon={isHome ? <HomeIcon /> : <FlightIcon />}
      label={isHome ? 'Home' : 'Away'}
      size="small"
      color={isHome ? 'primary' : 'default'}
      variant={isHome ? 'filled' : 'outlined'}
      sx={{ minWidth: 80 }}
    />
  );
}
