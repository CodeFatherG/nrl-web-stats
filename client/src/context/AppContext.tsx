import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { getHealth, getTeams } from '../services/api';
import type { Team } from '../types';

type AppStatus = 'loading' | 'error' | 'no-data' | 'ready';

interface AppContextValue {
  status: AppStatus;
  loadedYears: number[];
  teams: Team[];
  currentYear: number;
  error: string | null;
  setCurrentYear: (year: number) => void;
  refetch: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [loadedYears, setLoadedYears] = useState<number[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  useEffect(() => {
    setStatus('loading');
    setError(null);

    Promise.all([getHealth(), getTeams()])
      .then(([health, teamsData]) => {
        if (health.loadedYears.length === 0) {
          setStatus('no-data');
          return;
        }
        setLoadedYears(health.loadedYears);
        setCurrentYear(Math.max(...health.loadedYears));
        setTeams(teamsData.teams);
        setStatus('ready');
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setStatus('error');
      });
  }, [refetchTrigger]);

  return (
    <AppContext.Provider value={{ status, loadedYears, teams, currentYear, error, setCurrentYear, refetch }}>
      {children}
    </AppContext.Provider>
  );
}
