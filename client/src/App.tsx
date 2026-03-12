import { useState, useEffect, useCallback, useMemo } from 'react';
import { Container, AppBar, Toolbar, Typography, Box } from '@mui/material';
import { LoadingState } from './components/LoadingState';
import { ErrorState } from './components/ErrorState';
import { NoDataState } from './components/NoDataState';
import { TabNavigation } from './components/TabNavigation';
import { TeamScheduleView } from './views/TeamScheduleView';
import { RoundOverviewView } from './views/RoundOverviewView';
import { CompactSeasonView } from './views/CompactSeasonView';
import { ByeOverviewView } from './views/ByeOverviewView';
import { MatchDetailView } from './views/MatchDetailView';
import { getHealth, scrapeYear, getTeams, getTeamSchedule, getTeamStreaks, getRound, getAllTeamsRanking, getSeasonSummary, getTeamForm, getMatchOutlook } from './services/api';
import type { FormTrajectoryResponse, MatchOutlookResponse } from './services/api';
import type { Team, TeamScheduleResponse, RoundResponse, StrengthThresholds, FilterState, ActiveTab, AllTeamsRankingResponse, SeasonSummaryResponse, RoundViewMode, Streak } from './types';

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('round');

  // Match detail view state
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

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

  // Season summary state (compact view)
  const [roundViewMode, setRoundViewMode] = useState<RoundViewMode>('compact');
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummaryResponse | null>(null);
  const [seasonSummaryLoading, setSeasonSummaryLoading] = useState(false);
  const [seasonSummaryError, setSeasonSummaryError] = useState<string | null>(null);

  // Rankings state
  const [rankings, setRankings] = useState<AllTeamsRankingResponse | null>(null);

  // Streak analysis state
  const [teamStreaks, setTeamStreaks] = useState<Streak[]>([]);

  // Analytics state
  const [teamFormData, setTeamFormData] = useState<FormTrajectoryResponse | null>(null);
  const [matchOutlookData, setMatchOutlookData] = useState<MatchOutlookResponse | null>(null);

  // Use server-provided season-wide thresholds
  const strengthThresholds: StrengthThresholds = useMemo(() => {
    if (rankings?.thresholds) {
      return rankings.thresholds;
    }
    if (teamSchedule?.thresholds) {
      return teamSchedule.thresholds;
    }
    return { p33: 300, p67: 400 };
  }, [rankings, teamSchedule]);

  const handleMatchClick = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
  }, []);

  const handleMatchDetailBack = useCallback(() => {
    setSelectedMatchId(null);
  }, []);

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
      setTeamStreaks([]);
      setTeamFormData(null);

      try {
        const year = loadedYears[0]; // Use first loaded year
        const schedule = await getTeamSchedule(code, year);
        setTeamSchedule(schedule);

        // Fetch streak and form data (non-blocking — schedule still displays if these fail)
        if (year !== undefined) {
          try {
            const streaksResponse = await getTeamStreaks(year, code);
            setTeamStreaks(streaksResponse.streaks);
          } catch {
            // Streaks are optional enhancement, don't fail the whole view
          }
          try {
            const formResponse = await getTeamForm(year, code);
            setTeamFormData(formResponse);
          } catch {
            // Form data is optional, don't fail the whole view
          }
        }
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
      setMatchOutlookData(null);

      try {
        const year = loadedYears[0]; // Use first loaded year
        if (year !== undefined) {
          const data = await getRound(year, round);
          setRoundData(data);
          try {
            const outlook = await getMatchOutlook(year, round);
            setMatchOutlookData(outlook);
          } catch {
            // Outlook data is optional, don't fail the round view
          }
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

  const fetchSeasonSummary = useCallback(async () => {
    const year = loadedYears[0];
    if (year === undefined) return;

    setSeasonSummaryLoading(true);
    setSeasonSummaryError(null);

    try {
      const data = await getSeasonSummary(year);
      setSeasonSummary(data);
    } catch (err) {
      setSeasonSummaryError(
        err instanceof Error ? err.message : 'Failed to load season summary'
      );
    } finally {
      setSeasonSummaryLoading(false);
    }
  }, [loadedYears]);

  const handleRoundClickFromCompact = useCallback(
    (round: number) => {
      setRoundViewMode('detailed');
      void handleRoundSelect(round);
    },
    [handleRoundSelect]
  );

  // Load round data when switching to round tab in detailed mode
  useEffect(() => {
    if (activeTab === 'round' && roundViewMode === 'detailed' && !roundData && loadedYears.length > 0) {
      void handleRoundSelect(selectedRound);
    }
  }, [activeTab, roundViewMode, roundData, loadedYears, selectedRound, handleRoundSelect]);

  // Load season summary when switching to compact view or bye overview
  useEffect(() => {
    const needsSeasonSummary =
      (activeTab === 'round' && roundViewMode === 'compact') ||
      activeTab === 'bye';

    if (needsSeasonSummary && !seasonSummary && loadedYears.length > 0) {
      void fetchSeasonSummary();
    }
  }, [activeTab, roundViewMode, seasonSummary, loadedYears, fetchSeasonSummary]);

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
        {/* Match Detail View — replaces tab content when a match is selected */}
        {selectedMatchId ? (
          <MatchDetailView
            matchId={selectedMatchId}
            onBack={handleMatchDetailBack}
            strengthThresholds={strengthThresholds}
          />
        ) : (
          <>
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              roundViewMode={roundViewMode}
              onRoundViewModeChange={setRoundViewMode}
            />

            {activeTab === 'team' && (
              <TeamScheduleView
                teams={teams}
                selectedTeamCode={selectedTeamCode}
                onTeamSelect={handleTeamSelect}
                schedule={teamSchedule}
                loading={scheduleLoading}
                error={scheduleError}
                filters={filters}
                onFiltersChange={setFilters}
                rankings={rankings}
                streaks={teamStreaks}
                formData={teamFormData}
                onMatchClick={handleMatchClick}
              />
            )}

            {activeTab === 'round' && roundViewMode === 'detailed' && (
              <RoundOverviewView
                year={currentYear}
                selectedRound={selectedRound}
                onRoundSelect={handleRoundSelect}
                roundData={roundData}
                teams={teams}
                strengthThresholds={strengthThresholds}
                loading={roundLoading}
                error={roundError}
                outlookData={matchOutlookData}
                onMatchClick={handleMatchClick}
              />
            )}

            {activeTab === 'round' && roundViewMode === 'compact' && (
              <CompactSeasonView
                year={currentYear}
                seasonData={seasonSummary}
                loading={seasonSummaryLoading}
                error={seasonSummaryError}
                onRetry={fetchSeasonSummary}
                onRoundClick={handleRoundClickFromCompact}
                onMatchClick={handleMatchClick}
              />
            )}

            {activeTab === 'bye' && (
              <ByeOverviewView
                teams={teams}
                seasonSummary={seasonSummary}
                loading={seasonSummaryLoading}
                error={seasonSummaryError}
                onRetry={fetchSeasonSummary}
              />
            )}
          </>
        )}
      </Container>
    </Box>
  );
}

export default App;
