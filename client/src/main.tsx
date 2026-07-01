import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeContextProvider } from './context/ThemeContext';
import { AppContextProvider } from './context/AppContext';
import { SidebarProvider } from './context/SidebarContext';
import { useThemeContext } from './hooks/useThemeContext';
import { lightTheme, darkTheme } from './theme';

import { AppShell } from './layout/AppShell';
import { OverviewView } from './views/OverviewView';
import { RoundView } from './views/RoundView';
import { TeamView } from './views/TeamView';
import { MatchDetailView } from './views/MatchDetailView';
import { PlayersView } from './views/PlayersView';
import { PlayerDetailView } from './views/PlayerDetailView';
import { SupercoachView } from './views/SupercoachView';
import { CompareView } from './views/CompareView';
import { CasualtyWardView } from './views/CasualtyWardView';
import { ByeView } from './views/ByeView';
import { RouteError } from './components/RouteError';

function SummaryRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/${search}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function ThemedApp() {
  const { mode } = useThemeContext();
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppContextProvider>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<OverviewView />} />
              <Route path="round" element={<RoundView />} />
              <Route path="round/:n" element={<RoundView />} />
              <Route path="teams" element={<TeamView />} />
              <Route path="team/:code" element={<TeamView />} />
              <Route path="players" element={<PlayersView />} />
              <Route path="player/:id" element={<PlayerDetailView />} />
              <Route path="match/:id" element={<MatchDetailView />} />
              <Route path="supercoach" element={<SupercoachView />} />
              <Route path="supercoach/:n" element={<SupercoachView />} />
              <Route path="compare" element={<CompareView />} />
              <Route path="compare/:ids" element={<CompareView />} />
              <Route path="summary" element={<SummaryRedirect />} />
              <Route path="casualty-ward" element={<CasualtyWardView />} />
              <Route path="bye" element={<ByeView />} />
              <Route path="*" element={<RouteError message="Page not found" />} />
            </Route>
          </Routes>
        </AppContextProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeContextProvider>
        <SidebarProvider>
          <ThemedApp />
        </SidebarProvider>
      </ThemeContextProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
