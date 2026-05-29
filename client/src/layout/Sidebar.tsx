import { NavLink } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { SvgIconComponent } from '@mui/icons-material';
import { useAppContext } from '../hooks/useAppContext';
import { useSidebarContext } from '../context/SidebarContext';

export const DRAWER_WIDTH = 240;
export const DRAWER_WIDTH_COLLAPSED = 64;

interface NavItem {
  path: string;
  label: string;
  Icon: SvgIconComponent;
}

const PRIMARY_NAV: NavItem[] = [
  { path: '/', label: 'Overview', Icon: DashboardIcon },
  { path: '/round', label: 'Round', Icon: CalendarMonthIcon },
  { path: '/teams', label: 'Teams', Icon: GroupsIcon },
  { path: '/players', label: 'Players', Icon: PersonIcon },
  { path: '/supercoach', label: 'Supercoach', Icon: EmojiEventsIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { path: '/casualty-ward', label: 'Casualty Ward', Icon: LocalHospitalIcon },
  { path: '/compare', label: 'Compare', Icon: CompareArrowsIcon },
  { path: '/bye', label: 'Bye Overview', Icon: EventBusyIcon },
];

function NavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { Icon, label, path } = item;
  const isExact = path === '/';

  return (
    <NavLink
      to={path}
      end={isExact}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      {({ isActive }) => (
        <Tooltip title={collapsed ? label : ''} placement="right" arrow>
          <ListItemButton
            selected={isActive}
            sx={{
              minHeight: 48,
              px: 2,
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 1,
              mx: 0.5,
              mb: 0.25,
              '&.Mui-selected': {
                bgcolor: 'action.selected',
                color: 'primary.main',
                '& .MuiListItemIcon-root': { color: 'primary.main' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            {!collapsed && <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />}
          </ListItemButton>
        </Tooltip>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { teams } = useAppContext();
  const { collapsed, toggle } = useSidebarContext();

  const firstTeamCode = teams[0]?.code ?? 'BRO';
  const primaryWithTeam = PRIMARY_NAV.map(item =>
    item.path === '/teams' ? { ...item, path: `/team/${firstTeamCode}` } : item
  );

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 0.5 }}>
      <Toolbar />
      <List sx={{ flexGrow: 1, py: 0 }}>
        {primaryWithTeam.map(item => (
          <NavItem key={item.path} item={item} collapsed={collapsed} />
        ))}
      </List>
      <Divider sx={{ mx: 1 }} />
      <List sx={{ py: 0.5 }}>
        {SECONDARY_NAV.map(item => (
          <NavItem key={item.path} item={item} collapsed={collapsed} />
        ))}
      </List>
      <Divider sx={{ mx: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', p: 0.5 }}>
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton onClick={toggle} size="small" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', sm: 'block' },
        width: drawerWidth,
        flexShrink: 0,
        transition: 'width 0.2s ease',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          overflowX: 'hidden',
          boxSizing: 'border-box',
          border: 'none',
          borderRight: '1px solid',
          borderColor: 'divider',
          transition: 'width 0.2s ease',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
