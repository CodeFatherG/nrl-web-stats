import { useNavigate } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import SummarizeIcon from '@mui/icons-material/Summarize';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import EventBusyIcon from '@mui/icons-material/EventBusy';

const SECONDARY_NAV = [
  { path: '/supercoach', label: 'Supercoach', Icon: EmojiEventsIcon },
  { path: '/summary', label: 'Summary', Icon: SummarizeIcon },
  { path: '/casualty-ward', label: 'Casualty Ward', Icon: LocalHospitalIcon },
  { path: '/compare', label: 'Compare', Icon: CompareArrowsIcon },
  { path: '/bye', label: 'Bye Overview', Icon: EventBusyIcon },
];

interface MoreDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MoreDrawer({ open, onClose }: MoreDrawerProps) {
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}>
      <List>
        {SECONDARY_NAV.map(({ path, label, Icon }) => (
          <ListItemButton key={path} onClick={() => handleNav(path)}>
            <ListItemIcon><Icon /></ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
}
