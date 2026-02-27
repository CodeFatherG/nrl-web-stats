import { IconButton } from '@mui/material';
import EventBusyIcon from '@mui/icons-material/EventBusy';

export function ByeIndicator() {
  return (
    <IconButton
      sx={{
        backgroundColor: '#9E9E9E',
        color: '#FFFFFF',
      }}
      disabled={true}
    >
      <EventBusyIcon/>
    </IconButton>
  );
}
