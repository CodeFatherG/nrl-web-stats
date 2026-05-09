import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useAppContext } from '../hooks/useAppContext';
import { MoreDrawer } from './MoreDrawer';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { teams } = useAppContext();
  const [moreOpen, setMoreOpen] = useState(false);

  const firstTeamCode = teams[0]?.code ?? 'BRO';

  const getActiveValue = () => {
    const p = location.pathname;
    if (p === '/') return '/';
    if (p.startsWith('/round')) return '/round';
    if (p.startsWith('/team') || p.startsWith('/teams')) return '/teams';
    if (p.startsWith('/player') || p.startsWith('/players')) return '/players';
    return false;
  };

  return (
    <>
      <Paper
        elevation={3}
        sx={{
          display: { xs: 'block', sm: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: theme => theme.zIndex.appBar,
        }}
      >
        <BottomNavigation
          value={getActiveValue()}
          showLabels
          sx={{ overflowX: 'auto', '::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
        >
          <BottomNavigationAction label="Dashboard" value="/" icon={<DashboardIcon />} onClick={() => navigate('/')} sx={{ minWidth: 64, px: 0.5 }} />
          <BottomNavigationAction label="Round" value="/round" icon={<CalendarMonthIcon />} onClick={() => navigate('/round')} sx={{ minWidth: 64, px: 0.5 }} />
          <BottomNavigationAction label="Teams" value="/teams" icon={<GroupsIcon />} onClick={() => navigate(`/team/${firstTeamCode}`)} sx={{ minWidth: 64, px: 0.5 }} />
          <BottomNavigationAction label="Players" value="/players" icon={<PersonIcon />} onClick={() => navigate('/players')} sx={{ minWidth: 64, px: 0.5 }} />
          <BottomNavigationAction label="More" value="more" icon={<MoreHorizIcon />} onClick={() => setMoreOpen(true)} sx={{ minWidth: 64, px: 0.5 }} />
        </BottomNavigation>
      </Paper>
      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
