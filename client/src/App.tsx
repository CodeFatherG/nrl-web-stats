import { useState, useEffect, useCallback, useMemo } from 'react';
import { Container, AppBar, Toolbar, Typography, Box } from '@mui/material';
import { LoadingState } from './components/LoadingState';
import { ErrorState } from './components/ErrorState';
import { NoDataState } from './components/NoDataState';
import { TabNavigation } from './components/TabNavigation';
import { TeamScheduleView } from './views/TeamScheduleView';
import { RoundOverviewView } from './views/RoundOverviewView';
import { getHealth, scrapeYear, getTeams, getTeamSchedule, getRound, getAllTeamsRanking } from './services/api';
import { calculateStrengthPercentiles } from './utils/strengthColors';
import type { Team, TeamScheduleResponse, RoundResponse, StrengthThresholds, FilterState, ActiveTab, AllTeamsRankingResponse } from './types';

type AppStatus = 'loading' | 'error' | 'no-data' | 'ready';

const defaultFilters: FilterState = {
  roundStart: 1,
  roundEnd: 27,
  venueFilter: 'all',
};

function App() {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadedYears, setLoadedYears] = useState<number[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scraping, setScraping] = useState(false);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>('team');

  // Team schedule state
  const [selectedTeamCode, setSelectedTeamCode] = useState<string | null>(null);
  const [teamSchedule, setTeamSchedule] = useState<TeamScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Round overview state
  const [selectedRound, setSelectedRound] = useState(1);
  const [roundData, setRoundData] = useState<RoundResponse | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);

  // Rankings state
  const [rankings, setRankings] = useState<AllTeamsRankingResponse | null>(null);

  // Calculate strength thresholds from loaded schedule data
  const strengthThresholds: StrengthThresholds = useMemo(() => {
    if (!teamSchedule) {
      return { p33: 300, p67: 400 }; // Default values
    }
    const ratings = teamSchedule.schedule
      .filter((f) => !f.isBye)
      .map((f) => f.strengthRating);
    return calculateStrengthPercentiles(ratings);
  }, [teamSchedule]);

  const checkServerHealth = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const health = await getHealth();
      setLoadedYears(health.loadedYears);

      if (health.loadedYears.length === 0) {
        setStatus('no-data');
      } else {
        const teamsResponse = await getTeams();
        setTeams(teamsResponse.teams);
        // Fetch rankings for the first loaded year
        const year = health.loadedYears[0];
        if (year !== undefined) {
          try {
            const rankingsData = await getAllTeamsRanking(year);
            setRankings(rankingsData);
          } catch {
            // Rankings are optional, don't fail if unavailable
          }
        }
        setStatus('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void checkServerHealth();
  }, [checkServerHealth]);

  const handleLoadData = async (year: number) => {
    setScraping(true);
    setError(null);

    try {
      await scrapeYear(year);
      await checkServerHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule data');
      setStatus('error');
    } finally {
      setScraping(false);
    }
  };

  const handleRetry = () => {
    void checkServerHealth();
  };

  const handleTeamSelect = useCallback(
    async (code: string) => {
      setSelectedTeamCode(code);
      setScheduleLoading(true);
      setScheduleError(null);

      try {
        const year = loadedYears[0]; // Use first loaded year
        const schedule = await getTeamSchedule(code, year);
        setTeamSchedule(schedule);
      } catch (err) {
        setScheduleError(
          err instanceof Error ? err.message : 'Failed to load team schedule'
        );
      } finally {
        setScheduleLoading(false);
      }
    },
    [loadedYears]
  );

  const handleRoundSelect = useCallback(
    async (round: number) => {
      setSelectedRound(round);
      setRoundLoading(true);
      setRoundError(null);

      try {
        const year = loadedYears[0]; // Use first loaded year
        if (year !== undefined) {
          const data = await getRound(year, round);
          setRoundData(data);
        }
      } catch (err) {
        setRoundError(
          err instanceof Error ? err.message : 'Failed to load round data'
        );
      } finally {
        setRoundLoading(false);
      }
    },
    [loadedYears]
  );

  // Load round data when switching to round tab
  useEffect(() => {
    if (activeTab === 'round' && !roundData && loadedYears.length > 0) {
      void handleRoundSelect(selectedRound);
    }
  }, [activeTab, roundData, loadedYears, selectedRound, handleRoundSelect]);

  if (status === 'loading') {
    return <LoadingState />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Connection Error"
        message={error ?? 'Unable to connect to the server. Please ensure the server is running.'}
        onRetry={handleRetry}
      />
    );
  }

  if (status === 'no-data') {
    return <NoDataState onLoadData={handleLoadData} loading={scraping} />;
  }

  const currentYear = loadedYears[0] ?? new Date().getFullYear();

  // Status === 'ready' - show dashboard
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            NRL Schedule Dashboard
          </Typography>
          <Typography variant="body2">
            {loadedYears.length > 0 ? `${loadedYears.join(', ')} Season` : ''}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'team' && (
          <TeamScheduleView
            teams={teams}
            selectedTeamCode={selectedTeamCode}
            onTeamSelect={handleTeamSelect}
            schedule={teamSchedule}
            strengthThresholds={strengthThresholds}
            loading={scheduleLoading}
            error={scheduleError}
            filters={filters}
            onFiltersChange={setFilters}
            rankings={rankings}
          />
        )}

        {activeTab === 'round' && (
          <RoundOverviewView
            year={currentYear}
            selectedRound={selectedRound}
            onRoundSelect={handleRoundSelect}
            roundData={roundData}
            teams={teams}
            strengthThresholds={strengthThresholds}
            loading={roundLoading}
            error={roundError}
          />
        )}
      </Container>
    </Box>
  );
}

export default App;
