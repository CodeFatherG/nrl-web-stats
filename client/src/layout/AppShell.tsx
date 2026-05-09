import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import { useAppContext } from '../hooks/useAppContext';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { NoDataState } from '../components/NoDataState';

export function AppShell() {
  const { status, error, refetch } = useAppContext();

  const content = () => {
    if (status === 'loading') return <LoadingState message="Loading NRL data…" />;
    if (status === 'error') return <ErrorState title="Connection Error" message={error ?? 'Failed to load'} onRetry={refetch} />;
    if (status === 'no-data') return <NoDataState onLoadData={() => refetch()} />;
    return <Outlet />;
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <TopBar />
      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: '64px', // AppBar height
          mb: { xs: '56px', sm: 0 }, // BottomNav height on mobile
          p: { xs: 2, sm: 2.5, md: 3 },
          minHeight: 'calc(100vh - 64px)',
          maxWidth: '100%',
          overflow: 'auto',
        }}
      >
        {content()}
      </Box>

      <BottomNav />
    </Box>
  );
}
