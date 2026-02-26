import { Chip } from '@mui/material';
import EventBusyIcon from '@mui/icons-material/EventBusy';

export function ByeIndicator() {
  return (
    <Chip
      icon={<EventBusyIcon />}
      label="BYE"
      size="small"
      sx={{
        backgroundColor: '#9E9E9E',
        color: '#FFFFFF',
        fontWeight: 600,
      }}
    />
  );
}
