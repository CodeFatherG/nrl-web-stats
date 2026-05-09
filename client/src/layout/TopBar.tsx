import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useThemeContext } from '../hooks/useThemeContext';
import { useAppContext } from '../hooks/useAppContext';
import { useSidebarContext } from '../context/SidebarContext';
import { DRAWER_WIDTH, DRAWER_WIDTH_COLLAPSED } from './Sidebar';

export function TopBar() {
  const { mode, toggleMode } = useThemeContext();
  const { currentYear } = useAppContext();
  const { collapsed } = useSidebarContext();

  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: theme => theme.zIndex.drawer + 1,
        ml: { sm: `${drawerWidth}px` },
        width: { sm: `calc(100% - ${drawerWidth}px)` },
        transition: 'margin-left 0.2s ease, width 0.2s ease',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <Typography
          variant="h6"
          noWrap
          sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.5px' }}
        >
          NRL {currentYear}
        </Typography>

        <IconButton onClick={toggleMode} color="inherit" size="small" aria-label="Toggle dark mode">
          {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
