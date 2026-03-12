import { Box, CircularProgress, Alert, Typography, Grid } from '@mui/material';
import { RoundSelector } from '../components/RoundSelector';
import { MatchCard } from '../components/MatchCard';
import { ByeTeamsList } from '../components/ByeTeamsList';
import type { Team, RoundResponse, StrengthThresholds } from '../types';
import type { MatchOutlookResponse } from '../services/api';
import { createMatchId } from '../utils/matchId';

interface RoundOverviewViewProps {
  year: number;
  selectedRound: number;
  onRoundSelect: (round: number) => void;
  roundData: RoundResponse | null;
  teams: Team[];
  strengthThresholds: StrengthThresholds;
  loading: boolean;
  error: string | null;
  outlookData?: MatchOutlookResponse | null;
  onMatchClick?: (matchId: string) => void;
}

export function RoundOverviewView({
  year,
  selectedRound,
  onRoundSelect,
  roundData,
  teams,
  strengthThresholds,
  loading,
  error,
  outlookData,
  onMatchClick,
}: RoundOverviewViewProps) {
  const getTeamName = (code: string): string => {
    const team = teams.find((t) => t.code === code);
    return team?.name ?? code;
  };

  const getOutlookForMatch = (homeTeam: string, awayTeam: string) => {
    if (!outlookData) return undefined;
    return outlookData.matches.find(
      (m) => m.homeTeamCode === homeTeam && m.awayTeamCode === awayTeam
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3, maxWidth: 200 }}>
        <RoundSelector
          selectedRound={selectedRound}
          onSelect={onRoundSelect}
          disabled={loading}
        />
      </Box>

      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && roundData && (
        <>
          <Typography variant="h6" gutterBottom>
            Round {roundData.round} - {year} Season
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {roundData.matches.length} matches
          </Typography>

          <Grid container spacing={2}>
            {roundData.matches.map((match, index) => {
              const outlook = getOutlookForMatch(match.homeTeam, match.awayTeam);
              const matchId = createMatchId(year, roundData.round, match.homeTeam, match.awayTeam);
              return (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <MatchCard
                    homeStrength={match.homeStrength}
                    awayStrength={match.awayStrength}
                    homeTeamName={getTeamName(match.homeTeam)}
                    awayTeamName={getTeamName(match.awayTeam)}
                    strengthThresholds={strengthThresholds}
                    outlookLabel={outlook?.label}
                    outlookTooltip={outlook ? `Composite: ${outlook.compositeScore.toFixed(2)} (${outlook.factorsAvailable} factors)` : undefined}
                    scheduledTime={match.scheduledTime}
                    stadium={match.stadium}
                    weather={match.weather}
                    homeScore={match.homeScore}
                    awayScore={match.awayScore}
                    isComplete={match.isComplete}
                    onClick={onMatchClick ? () => onMatchClick(matchId) : undefined}
                  />
                </Grid>
              );
            })}
          </Grid>

          <ByeTeamsList teamCodes={roundData.byeTeams} teams={teams} />
        </>
      )}
    </Box>
  );
}
