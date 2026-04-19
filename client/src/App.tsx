import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Container, AppBar, Toolbar, Typography, Box
} from '@mui/material';
import { LoadingState } from './components/LoadingState';
import { ErrorState } from './components/ErrorState';
import { NoDataState } from './components/NoDataState';
import { TabNavigation } from './components/TabNavigation';
import { RouteError } from './components/RouteError';
import { TeamScheduleView } from './views/TeamScheduleView';
import { RoundOverviewView } from './views/RoundOverviewView';
import { CompactSeasonView } from './views/CompactSeasonView';
import { ByeOverviewView } from './views/ByeOverviewView';
import { MatchDetailView } from './views/MatchDetailView';
import { PlayersSummaryView } from './views/PlayersSummaryView';
import { PlayerDetailView } from './views/PlayerDetailView';
import { CasualtyWardView } from './views/CasualtyWardView';
import { CompareView } from './views/CompareView';
import { useRouter } from './hooks/useRouter';
import { buildTeamUrl, buildRoundUrl, buildByeUrl, buildMatchUrl, buildHomeUrl, buildPlayersUrl, buildPlayerUrl, buildCasualtyWardUrl, buildCompareUrl, parseUrl, getValidTeamCodes } from './utils/routes';
import { getHealth, scrapeYear, getTeams, getTeamSchedule, getTeamStreaks, getRound, getAllTeamsRanking, getSeasonSummary, getTeamForm, getMatchOutlook, getSeasonPlayers } from './services/api';
import type { FormTrajectoryResponse, MatchOutlookResponse } from './services/api';
import type { Team, TeamScheduleResponse, RoundResponse, StrengthThresholds, FilterState, ActiveTab, AllTeamsRankingResponse, SeasonSummaryResponse, RoundViewMode, Streak, PlayerSeasonSummary } from './types';

type AppStatus = 'loading' | 'error' | 'no-data' | 'ready';

const defaultFilters: FilterState = {
  roundStart: 1,
  roundEnd: 27,
  venueFilter: 'all',
};

function App() {
  const { route, navigate, isPopState } = useRouter();

  const [status, setStatus] = useState<AppStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadedYears, setLoadedYears] = useState<number[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scraping, setScraping] = useState(false);

  // Tab navigation state — initialised from route
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (route.type === 'team') return 'team';
    if (route.type === 'bye') return 'bye';
    if (route.type === 'players' || route.type === 'player') return 'player';
    if (route.type === 'casualtyWard') return 'casualtyWard';
    if (route.type === 'compare') return 'compare';
    return 'round';
  });

  // Comparison set state — initialised from route
  const [comparisonPlayerIds, setComparisonPlayerIds] = useState<string[]>(() =>
    route.type === 'compare' ? route.playerIds : []
  );

  // Match detail view state — initialised from route
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(() =>
    route.type === 'match' ? route.matchId : null
  );

  // Player detail view state — initialised from route
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(() =>
    route.type === 'player' ? route.playerId : null
  );

  // Player summary data
  const [playerSummaryData, setPlayerSummaryData] = useState<PlayerSeasonSummary[] | null>(null);
  const [playerSummaryLoading, setPlayerSummaryLoading] = useState(false);

  // Team schedule state — initialised from route
  const [selectedTeamCode, setSelectedTeamCode] = useState<string | null>(() =>
    route.type === 'team' ? route.teamCode : null
  );
  const [teamSchedule, setTeamSchedule] = useState<TeamScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Round overview state — initialised from route
  const [selectedRound, setSelectedRound] = useState(() =>
    route.type === 'round' ? route.roundNumber : 1
  );

  const [roundData, setRoundData] = useState<RoundResponse | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);

  // Season summary state (compact view) — initialised from route
  const [roundViewMode, setRoundViewMode] = useState<RoundViewMode>(() =>
    route.type === 'round' ? 'detailed' : 'compact'
  );
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

  // Track initial mount to skip first route effect
  const isInitialMount = useRef(true);

  // Apply route state on popstate (back/forward navigation)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isPopState) return;

    if (route.type === 'home') {
      setActiveTab('round');
      setRoundViewMode('compact');
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'round') {
      setActiveTab('round');
      setRoundViewMode('detailed');
      setSelectedRound(route.roundNumber);
      setRoundData(null);
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'team') {
      setActiveTab('team');
      setSelectedTeamCode(route.teamCode);
      setTeamSchedule(null);
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'bye') {
      setActiveTab('bye');
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'match') {
      setSelectedMatchId(route.matchId);
      setSelectedPlayerId(null);
    } else if (route.type === 'players') {
      setActiveTab('player');
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'player') {
      setActiveTab('player');
      setSelectedMatchId(null);
      setSelectedPlayerId(route.playerId);
    } else if (route.type === 'casualtyWard') {
      setActiveTab('casualtyWard');
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    } else if (route.type === 'compare') {
      setActiveTab('compare');
      setComparisonPlayerIds(route.playerIds);
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
    }
  }, [route, isPopState]);

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
    navigate(buildMatchUrl(matchId));
    setSelectedMatchId(matchId);
  }, [navigate]);

  const handleMatchDetailBack = useCallback(() => {
    if (window.history.length <= 1) {
      navigate(buildHomeUrl());
      setSelectedMatchId(null);
      setActiveTab('round');
      setRoundViewMode('compact');
    } else {
      window.history.back();
    }
  }, [navigate]);

  const fetchRankingsForYear = useCallback(async (year: number) => {
    try {
      const rankingsData = await getAllTeamsRanking(year);
      setRankings(rankingsData);
    } catch {
      // Rankings are optional, don't fail if unavailable
    }
  }, []);

  const checkServerHealth = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const health = await getHealth();
      // Sort descending so loadedYears[0] is always the most recent year
      setLoadedYears([...health.loadedYears].sort((a, b) => b - a));

      if (health.loadedYears.length === 0) {
        setStatus('no-data');
      } else {
        const teamsResponse = await getTeams();
        setTeams(teamsResponse.teams);
        const year = health.loadedYears[0];
        if (year !== undefined) {
          await fetchRankingsForYear(year);
        }
        setStatus('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
      setStatus('error');
    }
  }, [fetchRankingsForYear]);

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
      const targetUrl = buildTeamUrl(code);
      if (window.location.pathname !== targetUrl) {
        navigate(targetUrl);
      }
      setSelectedTeamCode(code);
      setScheduleLoading(true);
      setScheduleError(null);
      setTeamStreaks([]);
      setTeamFormData(null);

      try {
        const year = loadedYears[0];
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
    [loadedYears, navigate]
  );

  const handleRoundSelect = useCallback(
    async (round: number) => {
      const targetUrl = buildRoundUrl(round);
      if (window.location.pathname !== targetUrl) {
        navigate(targetUrl);
      }
      setSelectedRound(round);
      setRoundLoading(true);
      setRoundError(null);
      setMatchOutlookData(null);

      try {
        const year = loadedYears[0];
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
    [loadedYears, navigate]
  );

  const fetchSeasonSummary = useCallback(async (yearOverride?: number) => {
    const year = yearOverride ?? loadedYears[0];
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
      navigate(buildRoundUrl(round));
      setRoundViewMode('detailed');
      void handleRoundSelect(round);
    },
    [navigate, handleRoundSelect]
  );

  // Tab change handler — pushes URL for each tab
  const handleTabChange = useCallback(
    (tab: ActiveTab) => {
      setActiveTab(tab);
      setSelectedMatchId(null);
      setSelectedPlayerId(null);
      if (tab === 'team') {
        const code = selectedTeamCode ?? teams[0]?.code ?? 'BRO';
        navigate(buildTeamUrl(code));
        if (!selectedTeamCode) {
          setSelectedTeamCode(code);
        }
      } else if (tab === 'round') {
        if (roundViewMode === 'detailed') {
          navigate(buildRoundUrl(selectedRound));
        } else {
          navigate(buildHomeUrl());
        }
      } else if (tab === 'bye') {
        navigate(buildByeUrl());
      } else if (tab === 'player') {
        navigate(buildPlayersUrl());
      } else if (tab === 'casualtyWard') {
        navigate(buildCasualtyWardUrl());
      } else if (tab === 'compare') {
        navigate(buildCompareUrl(comparisonPlayerIds));
      }
    },
    [navigate, selectedTeamCode, roundViewMode, selectedRound, teams, comparisonPlayerIds]
  );

  // Round view mode change handler — pushes URL
  const handleRoundViewModeChange = useCallback(
    (mode: RoundViewMode) => {
      setRoundViewMode(mode);
      if (mode === 'detailed') {
        navigate(buildRoundUrl(selectedRound));
      } else {
        navigate(buildHomeUrl());
      }
    },
    [navigate, selectedRound]
  );

  // Load round data when switching to round tab in detailed mode
  useEffect(() => {
    if (activeTab === 'round' && roundViewMode === 'detailed' && !roundData && loadedYears.length > 0) {
      void handleRoundSelect(selectedRound);
    }
  }, [activeTab, roundViewMode, roundData, loadedYears, selectedRound, handleRoundSelect]);

  // Load team data when team tab is active with a selected team but no schedule data
  useEffect(() => {
    if (activeTab === 'team' && selectedTeamCode && loadedYears.length > 0 && !scheduleLoading &&
        (!teamSchedule || teamSchedule.team.code !== selectedTeamCode)) {
      void handleTeamSelect(selectedTeamCode);
    }
  }, [activeTab, selectedTeamCode, loadedYears.length, scheduleLoading, teamSchedule, handleTeamSelect]);

  // Load season summary when switching to compact view or bye overview
  useEffect(() => {
    const needsSeasonSummary =
      (activeTab === 'round' && roundViewMode === 'compact') ||
      activeTab === 'bye';

    if (needsSeasonSummary && !seasonSummary && loadedYears.length > 0) {
      void fetchSeasonSummary();
    }
  }, [activeTab, roundViewMode, seasonSummary, loadedYears, fetchSeasonSummary]);

  // Load player summary data when switching to player tab
  useEffect(() => {
    if (activeTab === 'player' && !playerSummaryData && !playerSummaryLoading && loadedYears.length > 0) {
      const year = loadedYears[0]!;
      setPlayerSummaryLoading(true);
      getSeasonPlayers(year)
        .then(data => setPlayerSummaryData(data.players))
        .catch(() => setPlayerSummaryData([]))
        .finally(() => setPlayerSummaryLoading(false));
    }
  }, [activeTab, playerSummaryData, playerSummaryLoading, loadedYears]);

  const handlePlayerClick = useCallback(
    (playerId: string) => {
      navigate(buildPlayerUrl(playerId));
      setSelectedPlayerId(playerId);
    },
    [navigate]
  );

  const handlePlayerDetailBack = useCallback(() => {
    if (window.history.length <= 1) {
      navigate(buildPlayersUrl());
      setSelectedPlayerId(null);
      setActiveTab('player');
    } else {
      window.history.back();
    }
  }, [navigate]);

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

  // Route error rendering for invalid URLs
  const renderRouteError = () => {
    if (route.type !== 'notFound') return null;
    const path = route.path;
    if (path.startsWith('/team/')) {
      const code = path.split('/')[2] ?? '';
      return <RouteError message={`Team not found: ${code.toUpperCase()}`} validOptions={getValidTeamCodes()} />;
    }
    if (path.startsWith('/round/')) {
      return <RouteError message="Round must be between 1 and 27" />;
    }
    return <RouteError message="Page not found" />;
  };

  // Status === 'ready' - show dashboard
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            NRL Schedule Dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        {/* Player Detail View — replaces tab content when a player is selected */}
        {selectedPlayerId ? (
          <PlayerDetailView
            playerId={selectedPlayerId}
            onBack={handlePlayerDetailBack}
            onNavigate={(url) => {
              const r = parseUrl(url);
              const ids = r.type === 'compare' ? r.playerIds : [];
              setComparisonPlayerIds(ids);
              setSelectedPlayerId(null);
              setActiveTab('compare');
              navigate(url);
            }}
            teams={teams}
            year={currentYear}
            loadedYears={loadedYears}
          />
        ) : selectedMatchId ? (
          <MatchDetailView
            matchId={selectedMatchId}
            onBack={handleMatchDetailBack}
            strengthThresholds={strengthThresholds}
            onPlayerClick={handlePlayerClick}
          />
        ) : route.type === 'notFound' ? (
          <>
            <TabNavigation
              activeTab={activeTab}
              onTabChange={handleTabChange}
              roundViewMode={roundViewMode}
              onRoundViewModeChange={handleRoundViewModeChange}
            />
            {renderRouteError()}
          </>
        ) : (
          <>
            <TabNavigation
              activeTab={activeTab}
              onTabChange={handleTabChange}
              roundViewMode={roundViewMode}
              onRoundViewModeChange={handleRoundViewModeChange}
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
                year={currentYear}
                loadedYears={loadedYears}
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
                loadedYears={loadedYears}
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

            {activeTab === 'player' && (
              <PlayersSummaryView
                players={playerSummaryData ?? []}
                teams={teams}
                onPlayerClick={handlePlayerClick}
                loading={playerSummaryLoading}
                loadedYears={loadedYears}
              />
            )}

            {activeTab === 'casualtyWard' && (
              <CasualtyWardView
                teams={teams}
                onPlayerClick={handlePlayerClick}
              />
            )}

            {activeTab === 'compare' && (
              <CompareView
                playerIds={comparisonPlayerIds}
                year={currentYear}
                onNavigate={(url) => {
                  const r = parseUrl(url);
                  const ids = r.type === 'compare' ? r.playerIds : [];
                  setComparisonPlayerIds(ids);
                  navigate(url);
                }}
              />
            )}
          </>
        )}
      </Container>
    </Box>
  );
}

export default App;
