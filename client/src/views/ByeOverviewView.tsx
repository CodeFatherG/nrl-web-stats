import { useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Typography, Paper, Slider, Button } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import { ByeOverviewGrid } from '../components/ByeOverviewGrid';
import { SignificantByeStats } from '../components/SignificantByeStats';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { buildByeGridData, buildSignificantByeRounds } from '../utils/byeGridUtils';
import type { Team, SeasonSummaryResponse } from '../types';

interface ByeOverviewViewProps {
  teams: Team[];
  seasonSummary: SeasonSummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const DEFAULT_ROUND_RANGE: [number, number] = [1, 27];

export function ByeOverviewView({
  teams,
  seasonSummary,
  loading,
  error,
  onRetry,
}: ByeOverviewViewProps) {
  // State for highlighting (main grid)
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<number | null>(null);

  // State for highlighting (statistics table)
  const [highlightedStatTeam, setHighlightedStatTeam] = useState<string | null>(null);

  // State for round filtering
  const [roundRange, setRoundRange] = useState<[number, number]>(DEFAULT_ROUND_RANGE);

  // Build grid data from season summary
  const byeGridData = useMemo(() => {
    if (!seasonSummary || teams.length === 0) {
      return null;
    }
    return buildByeGridData(seasonSummary, teams, highlightedColumn, highlightedRow);
  }, [seasonSummary, teams, highlightedColumn, highlightedRow]);

  // Build significant bye rounds data (rounds with >2 byes)
  const significantByeRounds = useMemo(() => {
    if (!byeGridData) {
      return [];
    }
    return buildSignificantByeRounds(
      byeGridData.byeCountByRound,
      byeGridData.byeMap,
      byeGridData.teams,
      roundRange
    );
  }, [byeGridData, roundRange]);

  // Handle row header click with toggle and mutual exclusion
  const handleRowClick = useCallback((teamCode: string) => {
    setHighlightedColumn(null); // Clear column highlight (mutual exclusion)
    setHighlightedRow((prev) => (prev === teamCode ? null : teamCode)); // Toggle
  }, []);

  // Handle column header click with toggle and mutual exclusion
  const handleColumnClick = useCallback((round: number) => {
    setHighlightedRow(null); // Clear row highlight (mutual exclusion)
    setHighlightedColumn((prev) => (prev === round ? null : round)); // Toggle
  }, []);

  // Handle team chip click in statistics table with toggle
  const handleStatTeamClick = useCallback((teamCode: string) => {
    setHighlightedStatTeam((prev) => (prev === teamCode ? null : teamCode)); // Toggle
  }, []);

  // Handle round range slider change
  const handleRoundRangeChange = useCallback(
    (_event: Event, value: number | number[]) => {
      const newRange = value as [number, number];
      setRoundRange(newRange);
    },
    []
  );

  // Clear highlights when filtered out of view
  useEffect(() => {
    if (highlightedColumn !== null) {
      if (highlightedColumn < roundRange[0] || highlightedColumn > roundRange[1]) {
        setHighlightedColumn(null);
      }
    }
  }, [roundRange, highlightedColumn]);

  // Reset filters
  const handleClearFilters = useCallback(() => {
    setRoundRange(DEFAULT_ROUND_RANGE);
    setHighlightedRow(null);
    setHighlightedColumn(null);
    setHighlightedStatTeam(null);
  }, []);

  const isFiltered = roundRange[0] !== 1 || roundRange[1] !== 27;

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to Load Bye Data"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  if (!byeGridData) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">
          No bye data available. Please load schedule data first.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Bye Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        View bye distribution across all teams and rounds. Click a team name to highlight their row, or a round number to highlight that column.
      </Typography>

      {/* Filter Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Round Range
            </Typography>
            <Slider
              value={roundRange}
              onChange={handleRoundRangeChange}
              min={1}
              max={27}
              marks={[
                { value: 1, label: '1' },
                { value: 14, label: '14' },
                { value: 27, label: '27' },
              ]}
              valueLabelDisplay="auto"
              aria-label="Round range filter"
            />
          </Box>
            <Button
              variant="outlined"
              size="small"
              disabled={!isFiltered}
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
            >
              Clear
            </Button>
        </Box>
      </Paper>

      {/* Bye Grid */}
      <ByeOverviewGrid
        byeGridData={byeGridData}
        highlightedRow={highlightedRow}
        highlightedColumn={highlightedColumn}
        roundRange={roundRange}
        onRowClick={handleRowClick}
        onColumnClick={handleColumnClick}
      />

      {/* Significant Bye Statistics Table */}
      <SignificantByeStats
        significantRounds={significantByeRounds}
        highlightedTeam={highlightedStatTeam}
        onTeamClick={handleStatTeamClick}
      />
    </Box>
  );
}
