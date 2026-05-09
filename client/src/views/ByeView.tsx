import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import { useAppContext } from '../hooks/useAppContext';
import { useSeasonSummaryQuery } from '../hooks/useSeasonQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { ByeOverviewGrid } from '../components/ByeOverviewGrid';
import { SignificantByeStats } from '../components/SignificantByeStats';
import { buildByeGridData, buildSignificantByeRounds } from '../utils/byeGridUtils';

export function ByeView() {
  const { currentYear, teams } = useAppContext();
  const [searchParams] = useSearchParams();
  const year = Number(searchParams.get('year') ?? currentYear);

  const [roundRange, setRoundRange] = useState<[number, number]>([1, 27]);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<number | null>(null);

  const seasonQuery = useSeasonSummaryQuery(year);

  const byeGridData = useMemo(() => {
    if (!seasonQuery.data) return null;
    return buildByeGridData(seasonQuery.data, teams, highlightedColumn, highlightedRow);
  }, [seasonQuery.data, teams, highlightedColumn, highlightedRow]);

  const significantRounds = useMemo(() => {
    if (!byeGridData) return [];
    return buildSignificantByeRounds(byeGridData.byeCountByRound, byeGridData.byeMap, teams, roundRange);
  }, [byeGridData, teams, roundRange]);

  if (seasonQuery.isLoading) return <SkeletonPage variant="table" />;
  if (seasonQuery.isError) return <Alert severity="error">Failed to load season data.</Alert>;
  if (!byeGridData) return null;

  return (
    <Box>
      <PageHeader title="Bye Overview" subtitle={`${year} Season`} />

      <Box sx={{ px: 2, mb: 3 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Round Range: {roundRange[0]}–{roundRange[1]}
        </Typography>
        <Slider
          value={roundRange}
          onChange={(_, v) => setRoundRange(v as [number, number])}
          min={1}
          max={27}
          step={1}
          valueLabelDisplay="auto"
          marks
        />
      </Box>

      <SectionCard noPadding sx={{ mb: 2, overflowX: 'auto' }}>
        <ByeOverviewGrid
          byeGridData={byeGridData}
          highlightedRow={highlightedRow}
          highlightedColumn={highlightedColumn}
          roundRange={roundRange}
          onRowClick={code => setHighlightedRow(prev => prev === code ? null : code)}
          onColumnClick={round => setHighlightedColumn(prev => prev === round ? null : round)}
        />
      </SectionCard>

      {significantRounds.length > 0 && (
        <SectionCard title="Rounds with Many Byes">
          <SignificantByeStats
            significantRounds={significantRounds}
            highlightedTeam={highlightedRow}
            onTeamClick={code => setHighlightedRow(prev => prev === code ? null : code)}
          />
        </SectionCard>
      )}
    </Box>
  );
}
