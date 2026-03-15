import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, Chip, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { SelectChangeEvent } from '@mui/material';
import { SupercoachScoreTable } from '../components/SupercoachScoreTable';
import { CategoryBreakdown } from '../components/CategoryBreakdown';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { getSupercoachScores, getPlayerSupercoachSeason } from '../services/api';
import type { SupercoachScoreResponse, PlayerSeasonSupercoachResponse } from '../services/api';

interface SupercoachViewProps {
  year: number;
  selectedRound: number;
  onRoundSelect: (round: number) => void;
  teams: Array<{ code: string; name: string }>;
}

export function SupercoachView({ year, selectedRound, onRoundSelect, teams }: SupercoachViewProps) {
  const [data, setData] = useState<SupercoachScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<SupercoachScoreResponse['scores'][number] | null>(null);
  const [trendData, setTrendData] = useState<PlayerSeasonSupercoachResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const fetchScores = useCallback(async (round: number, team?: string) => {
    setLoading(true);
    setError(null);
    setSelectedPlayer(null);

    try {
      const result = await getSupercoachScores(year, round, team || undefined);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void fetchScores(selectedRound, teamFilter);
  }, [selectedRound, teamFilter, fetchScores]);

  // Fetch season trend when a player is selected
  useEffect(() => {
    if (!selectedPlayer) {
      setTrendData(null);
      return;
    }

    setTrendLoading(true);
    void getPlayerSupercoachSeason(year, selectedPlayer.playerId)
      .then(setTrendData)
      .catch(() => setTrendData(null))
      .finally(() => setTrendLoading(false));
  }, [selectedPlayer, year]);

  const handleRoundChange = (e: SelectChangeEvent<number>) => {
    const round = Number(e.target.value);
    onRoundSelect(round);
  };

  const handleTeamChange = (e: SelectChangeEvent<string>) => {
    setTeamFilter(e.target.value);
  };

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Round</InputLabel>
          <Select value={selectedRound} label="Round" onChange={handleRoundChange}>
            {Array.from({ length: 27 }, (_, i) => i + 1).map(r => (
              <MenuItem key={r} value={r}>Round {r}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Team</InputLabel>
          <Select value={teamFilter} label="Team" onChange={handleTeamChange}>
            <MenuItem value="">All Teams</MenuItem>
            {teams.map(t => (
              <MenuItem key={t.code} value={t.code}>{t.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {data && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={`${data.playersScored} players`} size="small" variant="outlined" />
            {!data.isComplete && (
              <Chip label="Incomplete round" size="small" color="warning" />
            )}
          </Box>
        )}
      </Box>

      {/* Validation banner */}
      {data && !data.isComplete && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Supplementary stats are not yet available for all players in this round.
          Scores marked "Partial" use primary stats only.
        </Alert>
      )}

      {data && data.validationSummary.totalDiscrepancies > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {data.validationSummary.totalDiscrepancies} data discrepancies and{' '}
          {data.validationSummary.unmatchedPlayers} unmatched players detected.
        </Alert>
      )}

      {/* Content */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {!loading && data && (
        <SupercoachScoreTable
          scores={data.scores}
          onPlayerClick={setSelectedPlayer}
        />
      )}

      {/* Player detail panel with category breakdown */}
      {selectedPlayer && (
        <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedPlayer.playerName} ({selectedPlayer.teamCode})
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total: {selectedPlayer.totalScore} | Match confidence: {selectedPlayer.matchConfidence}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setSelectedPlayer(null)} aria-label="Close detail panel">
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1, mb: 2 }}>
            {Object.entries(selectedPlayer.categoryTotals).map(([cat, total]) => (
              <Chip
                key={cat}
                label={`${cat}: ${total}`}
                size="small"
                color={total < 0 ? 'error' : total > 0 ? 'primary' : 'default'}
                variant="outlined"
              />
            ))}
          </Box>
          {/* Season trend chart */}
          {trendLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {trendData && !trendLoading && (
            <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
              <ScoreTrendChart data={trendData} />
            </Box>
          )}

          <CategoryBreakdown
            categories={selectedPlayer.categories}
            categoryTotals={selectedPlayer.categoryTotals}
            isComplete={selectedPlayer.isComplete}
          />

          {/* Validation warnings */}
          {selectedPlayer.validationWarnings.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="warning.main" gutterBottom>
                Data Validation Warnings ({selectedPlayer.validationWarnings.length})
              </Typography>
              {selectedPlayer.validationWarnings.map((w, i) => (
                <Alert key={i} severity="warning" sx={{ mb: 1 }} variant="outlined">
                  <Typography variant="body2">{w.message}</Typography>
                  {w.primaryValue !== null && w.supplementaryValue !== null && (
                    <Typography variant="caption" color="text.secondary">
                      Primary: {w.primaryValue} | Supplementary: {w.supplementaryValue}
                    </Typography>
                  )}
                </Alert>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
