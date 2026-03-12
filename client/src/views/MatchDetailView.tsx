import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Paper,
  Divider,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PlayerStatsTable } from '../components/PlayerStatsTable';
import { StrengthBadge } from '../components/StrengthBadge';
import { OutlookBadge } from '../components/OutlookBadge';
import { getMatchDetail, getMatchOutlook } from '../services/api';
import type { MatchOutlookResponse } from '../services/api';
import type { MatchDetailResponse, StrengthThresholds } from '../types';
import { formatMatchDate } from '../utils/formatMatchDate';

interface MatchDetailViewProps {
  matchId: string;
  onBack: () => void;
  strengthThresholds: StrengthThresholds;
}

export function MatchDetailView({ matchId, onBack, strengthThresholds }: MatchDetailViewProps) {
  const [match, setMatch] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outlookData, setOutlookData] = useState<MatchOutlookResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const data = await getMatchDetail(matchId);
        if (!cancelled) {
          setMatch(data);

          // Fetch outlook data (non-blocking)
          try {
            const outlook = await getMatchOutlook(data.year, data.round);
            if (!cancelled) setOutlookData(outlook);
          } catch {
            // Outlook is optional
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load match details');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => { cancelled = true; };
  }, [matchId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <IconButton onClick={onBack} sx={{ mb: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!match) return null;

  const isCompleted = match.status === 'Completed';
  const isInProgress = match.status === 'InProgress';
  const hasScore = match.homeScore != null && match.awayScore != null;

  // Find outlook for this specific match
  const matchOutlook = outlookData?.matches.find(
    (m) => m.homeTeamCode === match.homeTeamCode && m.awayTeamCode === match.awayTeamCode
  );

  return (
    <Box>
      {/* Back button */}
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={onBack} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          Back to overview
        </Typography>
      </Box>

      {/* Match header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Round {match.round} - {match.year} Season
            </Typography>
            {isInProgress && (
              <Chip label="Match In Progress" color="warning" size="small" sx={{ ml: 1 }} />
            )}
          </Box>
          {matchOutlook && (
            <OutlookBadge
              label={matchOutlook.label}
              tooltip={`Composite: ${matchOutlook.compositeScore.toFixed(2)} (${matchOutlook.factorsAvailable} factors)`}
            />
          )}
        </Box>

        {/* Teams and score */}
        <Box display="flex" justifyContent="center" alignItems="center" my={3} gap={3} flexWrap="wrap">
          {/* Home team */}
          <Box textAlign="center" minWidth={180}>
            <Typography variant="body2" color="text.secondary">Home</Typography>
            <Typography variant="h5" fontWeight={700}>{match.homeTeamName}</Typography>
            {match.homeStrengthRating != null && (
              <Box mt={0.5}>
                <StrengthBadge rating={match.homeStrengthRating} thresholds={strengthThresholds} />
              </Box>
            )}
          </Box>

          {/* Score or VS */}
          <Box textAlign="center" minWidth={100}>
            {hasScore ? (
              <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, py: 1.5, px: 3 }}>
                <Typography variant="h4" fontWeight={700}>
                  {match.homeScore} - {match.awayScore}
                </Typography>
              </Box>
            ) : (
              <Typography variant="h5" color="text.secondary" fontWeight={600}>
                vs
              </Typography>
            )}
          </Box>

          {/* Away team */}
          <Box textAlign="center" minWidth={180}>
            <Typography variant="body2" color="text.secondary">Away</Typography>
            <Typography variant="h5" fontWeight={700}>{match.awayTeamName}</Typography>
            {match.awayStrengthRating != null && (
              <Box mt={0.5}>
                <StrengthBadge rating={match.awayStrengthRating} thresholds={strengthThresholds} />
              </Box>
            )}
          </Box>
        </Box>

        {/* Match info: date, stadium, weather */}
        <Divider sx={{ my: 2 }} />
        <Box display="flex" gap={3} flexWrap="wrap" justifyContent="center">
          {match.scheduledTime && (
            <Typography variant="body2" color="text.secondary">
              {formatMatchDate(match.scheduledTime)}
            </Typography>
          )}
          {match.stadium && (
            <Typography variant="body2" color="text.secondary">
              {match.stadium}
            </Typography>
          )}
          {match.weather && (
            <Typography variant="body2" color="text.secondary">
              {match.weather}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Player Stats */}
      {(isCompleted || isInProgress) && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Player Statistics
          </Typography>
          {isInProgress && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Match is in progress — statistics may be incomplete.
            </Alert>
          )}

          <PlayerStatsTable
            players={match.homePlayerStats}
            teamName={match.homeTeamName}
            teamCode={match.homeTeamCode}
          />

          <PlayerStatsTable
            players={match.awayPlayerStats}
            teamName={match.awayTeamName}
            teamCode={match.awayTeamCode}
          />
        </>
      )}
    </Box>
  );
}
