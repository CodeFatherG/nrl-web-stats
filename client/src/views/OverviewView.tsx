import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppContext } from '../hooks/useAppContext';
import { useMovementsQuery } from '../hooks/useMovementsQuery';
import { useRoundDashboardQuery } from '../hooks/useRoundDashboardQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { DataTable, type ColumnDef } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { getTeamBackground } from '../utils/teamColors';
import { RoundMatchesGSRCard } from '../components/summary/RoundMatchesGSRCard';
import { BreakEvenTile } from '../components/summary/BreakEvenTile';
import { TopProjectionsTile } from '../components/summary/TopProjectionsTile';
import type {
  InjuredRecord,
  DroppedRecord,
  BenchedRecord,
  ReturningFromInjuryRecord,
  CoveringInjuryRecord,
  PromotedRecord,
  PositionChangedRecord,
} from '../types';

type AnyMovement = { playerId: number; playerName: string; teamCode: string };

function baseColumns<T extends AnyMovement>(): ColumnDef<T>[] {
  return [
    {
      key: 'playerName', label: 'Player', align: 'left', sortable: true,
      getValue: (r: T) => r.playerName,
      renderCell: (r: T) => <Typography variant="caption" fontWeight={600}>{r.playerName}</Typography>,
    },
    {
      key: 'teamCode', label: 'Team', align: 'center', sortable: true,
      getValue: (r: T) => r.teamCode,
      renderCell: (r: T) => <Typography variant="caption">{r.teamCode}</Typography>,
    },
  ] as ColumnDef<T>[];
}

function MovementSection<T extends AnyMovement>({
  title,
  items,
  columns,
  onNavigate,
  actions,
  sectionId,
  expanded,
  onChange,
}: {
  title: string;
  items: T[];
  columns: ColumnDef<T>[];
  onNavigate: (id: number) => void;
  actions?: ReactNode;
  sectionId: string;
  expanded: boolean;
  onChange: (sectionId: string, isExpanded: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => onChange(sectionId, isExpanded)}
      disableGutters
      elevation={0}
      sx={{
        border: 0,
        '&::before': { display: 'none' },
        '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: '6px', alignItems: 'center', gap: 1 } }}
      >
        <Typography variant="body2" fontWeight={600}>{title}</Typography>
        <Chip label={items.length} size="small" color="primary" sx={{ height: 18, fontSize: '0.7rem' }} />
        {actions && (
          <Box sx={{ ml: 'auto', mr: 1 }} onClick={e => e.stopPropagation()}>
            {actions}
          </Box>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={r => String(r.playerId)}
          stickyHeader={false}
          maxHeight="40vh"
          defaultSortKey="teamCode"
          defaultSortDir="asc"
          dense
          getRowBg={r => getTeamBackground(r.teamCode)}
          onRowClick={r => onNavigate(r.playerId)}
        />
      </AccordionDetails>
    </Accordion>
  );
}

export function OverviewView() {
  const { currentYear } = useAppContext();
  const navigate = useNavigate();
  const [hideInterchange, setHideInterchange] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | false>(false);

  const handleSectionChange = (id: string, isExpanded: boolean) =>
    setExpandedSection(isExpanded ? id : false);

  const movementsQuery = useMovementsQuery(currentYear);
  const movementsRound = movementsQuery.data && movementsQuery.data.available ? movementsQuery.data.round : 0;
  const dashboardQuery = useRoundDashboardQuery(currentYear, movementsRound);

  if (movementsQuery.isLoading) return <SkeletonPage variant="cards" />;
  if (movementsQuery.isError) return <Alert severity="error">Failed to load player movements.</Alert>;

  const data = movementsQuery.data;

  if (!data || !data.available) {
    return (
      <Box>
        <PageHeader title="Overview" subtitle="Player Movements" />
        <Alert severity="info">Round data is still being processed. Please check back later.</Alert>
      </Box>
    );
  }

  if (data.noPreviousRound) {
    return (
      <Box>
        <PageHeader title="Overview" subtitle={`Round ${data.round}, ${data.season}`} />
        <RoundMatchesGSRCard
          year={currentYear}
          round={data.round}
          title={`Current — Round ${data.round}`}
        />
        <DashboardTiles dashboardQuery={dashboardQuery} />
        <Alert severity="info" sx={{ mt: 2 }}>No previous round data available yet for player movements.</Alert>
      </Box>
    );
  }

  const promotedFiltered = hideInterchange
    ? data.promoted.filter(p => p.position.toLowerCase().trim() !== 'interchange')
    : data.promoted;

  const goToPlayer = (id: number) => navigate(`/player/${id}`);

  const injuredCols: ColumnDef<InjuredRecord>[] = [
    ...baseColumns<InjuredRecord>(),
    { key: 'lastPosition', label: 'Pos', align: 'center', sortable: true,
      getValue: r => r.lastPosition,
      renderCell: r => <Typography variant="caption">{r.lastPosition}</Typography> },
    { key: 'injury', label: 'Injury', align: 'left', sortable: true,
      getValue: r => r.injury ?? '—',
      renderCell: r => <Typography variant="caption">{r.injury ?? '—'}</Typography> },
    { key: 'expectedReturn', label: 'Expected Return', align: 'left', sortable: true,
      getValue: r => r.expectedReturn,
      renderCell: r => <Typography variant="caption">{r.expectedReturn}</Typography> },
  ];

  const droppedCols: ColumnDef<DroppedRecord>[] = [
    ...baseColumns<DroppedRecord>(),
    { key: 'lastPosition', label: 'Pos', align: 'center', sortable: true,
      getValue: r => r.lastPosition,
      renderCell: r => <Typography variant="caption">{r.lastPosition}</Typography> },
    { key: 'lastJersey', label: '#', align: 'center', sortable: true,
      getValue: r => r.lastJersey,
      renderCell: r => <Typography variant="caption">{r.lastJersey}</Typography> },
  ];

  const benchedCols: ColumnDef<BenchedRecord>[] = [
    ...baseColumns<BenchedRecord>(),
    { key: 'position', label: 'Pos', align: 'center', sortable: false,
      renderCell: r => <Typography variant="caption">{r.prevPosition}→{r.currentPosition}</Typography> },
    { key: 'jersey', label: '#', align: 'center', sortable: false,
      renderCell: r => <Typography variant="caption">{r.prevJersey}→{r.currentJersey}</Typography> },
    { key: 'consecutiveRoundsBenched', label: 'Wks', align: 'center', sortable: true,
      getValue: r => r.consecutiveRoundsBenched,
      renderCell: r => <Typography variant="caption">{r.consecutiveRoundsBenched}</Typography> },
    { key: 'replacedByPlayerName', label: 'Replaced By', align: 'left', sortable: true,
      getValue: r => r.replacedByPlayerName ?? '—',
      renderCell: r => <Typography variant="caption">{r.replacedByPlayerName ?? '—'}</Typography> },
  ];

  const returningCols: ColumnDef<ReturningFromInjuryRecord>[] = [
    ...baseColumns<ReturningFromInjuryRecord>(),
    { key: 'currentPosition', label: 'Pos', align: 'center', sortable: true,
      getValue: r => r.currentPosition,
      renderCell: r => <Typography variant="caption">{r.currentPosition}{r.positionChanged ? ` (was ${r.lastPosition})` : ''}</Typography> },
    { key: 'currentJersey', label: '#', align: 'center', sortable: true,
      getValue: r => r.currentJersey,
      renderCell: r => <Typography variant="caption">{r.currentJersey}</Typography> },
    { key: 'injury', label: 'Injury', align: 'left', sortable: true,
      getValue: r => r.injury,
      renderCell: r => <Typography variant="caption">{r.injury}</Typography> },
    { key: 'roundsOut', label: 'Wks Out', align: 'center', sortable: true,
      getValue: r => r.roundsOut,
      renderCell: r => <Typography variant="caption">{r.roundsOut}</Typography> },
  ];

  const coveringCols: ColumnDef<CoveringInjuryRecord>[] = [
    ...baseColumns<CoveringInjuryRecord>(),
    { key: 'movement', label: 'Movement', align: 'center', sortable: false,
      renderCell: r => (
        <Typography variant="caption">
          {r.prevPosition ? `${r.prevPosition} → ${r.currentPosition}` : r.currentPosition}
        </Typography>
      ) },
    { key: 'coveringPlayerName', label: 'Covering (injured)', align: 'left', sortable: true,
      getValue: r => r.coveringPlayerName,
      renderCell: r => <Typography variant="caption">{r.coveringPlayerName} ({r.coveringLastPosition})</Typography> },
  ];

  const promotedCols: ColumnDef<PromotedRecord>[] = [
    ...baseColumns<PromotedRecord>(),
    { key: 'position', label: 'Pos', align: 'center', sortable: true,
      getValue: r => r.position,
      renderCell: r => <Typography variant="caption">{r.position}</Typography> },
    { key: 'currentJersey', label: '#', align: 'center', sortable: true,
      getValue: r => r.currentJersey,
      renderCell: r => <Typography variant="caption">{r.currentJersey}</Typography> },
    { key: 'replacingPlayerName', label: 'Replacing', align: 'left', sortable: true,
      getValue: r => r.replacingPlayerName ?? '—',
      renderCell: r => <Typography variant="caption">{r.replacingPlayerName ?? '—'}</Typography> },
  ];

  const positionCols: ColumnDef<PositionChangedRecord>[] = [
    ...baseColumns<PositionChangedRecord>(),
    { key: 'currentJersey', label: '#', align: 'center', sortable: true,
      getValue: r => r.currentJersey,
      renderCell: r => <Typography variant="caption">{r.currentJersey}</Typography> },
    { key: 'oldPosition', label: 'From', align: 'center', sortable: true,
      getValue: r => r.oldPosition,
      renderCell: r => <Typography variant="caption">{r.oldPosition}</Typography> },
    { key: 'newPosition', label: 'To', align: 'center', sortable: true,
      getValue: r => r.newPosition,
      renderCell: r => <Typography variant="caption">{r.newPosition}</Typography> },
  ];

  return (
    <Box>
      <PageHeader
        title="Overview"
        subtitle={`Round ${data.round}, ${data.season}`}
      />

      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        <Grid item xs={12} md={data.round > 1 ? 6 : 12}>
          <RoundMatchesGSRCard
            year={currentYear}
            round={data.round}
            title={`Current — Round ${data.round}`}
          />
        </Grid>
        {data.round > 1 && (
          <Grid item xs={12} md={6}>
            <RoundMatchesGSRCard
              year={currentYear}
              round={data.round - 1}
              title={`Last — Round ${data.round - 1}`}
              subtitle="Final scores"
            />
          </Grid>
        )}
      </Grid>

      <DashboardTiles dashboardQuery={dashboardQuery} />

      <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
        Player Movements
      </Typography>

      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <MovementSection<InjuredRecord>
          title="Injured" items={data.injured}
          columns={injuredCols} onNavigate={goToPlayer}
          sectionId="injured"
          expanded={expandedSection === 'injured'}
          onChange={handleSectionChange}
        />
        <MovementSection<DroppedRecord>
          title="Dropped" items={data.dropped}
          columns={droppedCols} onNavigate={goToPlayer}
          sectionId="dropped"
          expanded={expandedSection === 'dropped'}
          onChange={handleSectionChange}
        />
        <MovementSection<BenchedRecord>
          title="Benched" items={data.benched}
          columns={benchedCols} onNavigate={goToPlayer}
          sectionId="benched"
          expanded={expandedSection === 'benched'}
          onChange={handleSectionChange}
        />
        <MovementSection<ReturningFromInjuryRecord>
          title="Returning from Injury" items={data.returningFromInjury}
          columns={returningCols} onNavigate={goToPlayer}
          sectionId="returning"
          expanded={expandedSection === 'returning'}
          onChange={handleSectionChange}
        />
        <MovementSection<CoveringInjuryRecord>
          title="Covering Injury" items={data.coveringInjury}
          columns={coveringCols} onNavigate={goToPlayer}
          sectionId="covering"
          expanded={expandedSection === 'covering'}
          onChange={handleSectionChange}
        />
        <MovementSection<PromotedRecord>
          title="Promoted" items={promotedFiltered}
          columns={promotedCols} onNavigate={goToPlayer}
          sectionId="promoted"
          expanded={expandedSection === 'promoted'}
          onChange={handleSectionChange}
          actions={
            <FormControlLabel
              control={<Checkbox size="small" checked={hideInterchange} onChange={e => setHideInterchange(e.target.checked)} />}
              label={<Typography variant="caption">Hide interchange</Typography>}
            />
          }
        />
        <MovementSection<PositionChangedRecord>
          title="Position Changed" items={data.positionChanged}
          columns={positionCols} onNavigate={goToPlayer}
          sectionId="positionChanged"
          expanded={expandedSection === 'positionChanged'}
          onChange={handleSectionChange}
        />
      </Box>
    </Box>
  );
}

type DashboardQueryResult = ReturnType<typeof useRoundDashboardQuery>;

function DashboardTiles({ dashboardQuery }: { dashboardQuery: DashboardQueryResult }) {
  if (dashboardQuery.isLoading) {
    return (
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3].map(i => (
          <Grid item xs={12} md={6} key={i}>
            <SkeletonPage variant="cards" />
          </Grid>
        ))}
      </Grid>
    );
  }
  if (dashboardQuery.isError) {
    return <Alert severity="warning" sx={{ mb: 2 }}>Failed to load round dashboard.</Alert>;
  }
  const dash = dashboardQuery.data;
  if (!dash || !dash.available) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Round dashboard is being computed — check back shortly.
      </Alert>
    );
  }
  const { breakEvens, scorers, captains } = dash.data;
  // Backend precomputes top 100; we display top 10 today. Bump the slice
  // here when surfacing a deeper list (e.g. behind a "show more" control).
  const VISIBLE = 10;
  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid item xs={12} sm={6} lg={3}>
        <TopProjectionsTile title="Top 10 Projected Scorers" rows={scorers.slice(0, VISIBLE)} />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <TopProjectionsTile title="Top 10 Projected Captains" rows={captains.slice(0, VISIBLE)} />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <BreakEvenTile title="Top 10 Break Evens" rows={breakEvens.top.slice(0, VISIBLE)} />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <BreakEvenTile title="Bottom 10 Break Evens" rows={breakEvens.bottom.slice(0, VISIBLE)} />
      </Grid>
    </Grid>
  );
}
