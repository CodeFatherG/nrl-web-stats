import { type ReactNode, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme, useMediaQuery } from '@mui/material';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Grid from '@mui/material/Grid';
import { useAppContext } from '../hooks/useAppContext';
import { useMovementsQuery } from '../hooks/useMovementsQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
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

function makeColumns(extra?: { key: string; label: string; getValue: (r: AnyMovement) => string }[]) {
  return [
    { key: 'playerName', label: 'Player', align: 'left' as const, sortable: true,
      getValue: (r: AnyMovement) => r.playerName,
      renderCell: (r: AnyMovement) => <Typography variant="caption" fontWeight={600}>{r.playerName}</Typography> },
    { key: 'teamCode', label: 'Team', align: 'center' as const,
      renderCell: (r: AnyMovement) => <Typography variant="caption">{r.teamCode}</Typography> },
    ...(extra ?? []).map(e => ({
      key: e.key, label: e.label, align: 'left' as const,
      renderCell: (r: AnyMovement) => <Typography variant="caption">{e.getValue(r)}</Typography>,
    })),
  ];
}

export function SummaryView() {
  const { currentYear } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const year = Number(searchParams.get('year') ?? currentYear);
  const [hideInterchange, setHideInterchange] = useState(true);

  const movementsQuery = useMovementsQuery(year);

  if (movementsQuery.isLoading) return <SkeletonPage variant="cards" />;
  if (movementsQuery.isError) return <Alert severity="error">Failed to load player movements.</Alert>;

  const data = movementsQuery.data;

  if (!data || data.pending) {
    return (
      <Box>
        <PageHeader title="Summary" subtitle="Player Movements" />
        <Alert severity="info">Round data is still being processed. Please check back later.</Alert>
      </Box>
    );
  }

  if (data.noPreviousRound) {
    return (
      <Box>
        <PageHeader title="Summary" subtitle="Player Movements" />
        <Alert severity="info">No previous round data available yet.</Alert>
      </Box>
    );
  }

  // Promoted from interchange = previously jersey >=14 (we detect by replacingPlayerId presence vs. not)
  const promotedFiltered = hideInterchange
    ? data.promoted.filter(p => p.replacingPlayerId == null)
    : data.promoted;

  function renderSection<T extends AnyMovement>(
    title: string,
    items: T[],
    extra?: { key: string; label: string; getValue: (r: T) => string }[],
    actions?: ReactNode
  ) {
    if (items.length === 0) return null;
    return (
      <Grid item xs={12} sm={6} lg={4} key={title}>
        <SectionCard
          title={`${title} (${items.length})`}
          actions={actions}
        >
          {isMobile ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {items.map(r => (
                <Chip
                  key={r.playerId}
                  label={`${r.playerName} (${r.teamCode})`}
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(`/player/${r.playerId}`)}
                />
              ))}
            </Box>
          ) : (
            <DataTable
              columns={makeColumns(extra as { key: string; label: string; getValue: (r: AnyMovement) => string }[])}
              rows={items as AnyMovement[]}
              getRowKey={r => String(r.playerId)}
              emptyMessage="None"
              onRowClick={r => navigate(`/player/${r.playerId}`)}
            />
          )}
        </SectionCard>
      </Grid>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Player Movements Summary"
        subtitle={`Round ${data.round}, ${data.season}`}
      />

      <Grid container spacing={2}>
        {renderSection<InjuredRecord>('Injured', data.injured,
          [{ key: 'injury', label: 'Injury', getValue: (r: InjuredRecord) => r.injury ?? '—' }]
        )}
        {renderSection<DroppedRecord>('Dropped', data.dropped)}
        {renderSection<BenchedRecord>('Benched', data.benched,
          [{ key: 'jersey', label: 'Jersey', getValue: (r: BenchedRecord) => `${r.prevJersey}→${r.currentJersey}` }]
        )}
        {renderSection<ReturningFromInjuryRecord>('Returning from Injury', data.returningFromInjury,
          [{ key: 'injury', label: 'Injury', getValue: (r: ReturningFromInjuryRecord) => r.injury }]
        )}
        {renderSection<CoveringInjuryRecord>('Covering Injury', data.coveringInjury,
          [{ key: 'covering', label: 'Covering', getValue: (r: CoveringInjuryRecord) => r.coveringPlayerName }]
        )}
        {renderSection<PromotedRecord>('Promoted', promotedFiltered,
          [{ key: 'replacing', label: 'Replacing', getValue: (r: PromotedRecord) => r.replacingPlayerName ?? '—' }],
          <FormControlLabel
            control={<Checkbox size="small" checked={hideInterchange} onChange={e => setHideInterchange(e.target.checked)} />}
            label={<Typography variant="caption">Hide interchange</Typography>}
            sx={{ ml: 'auto' }}
          />
        )}
        {renderSection<PositionChangedRecord>('Position Changed', data.positionChanged,
          [
            { key: 'from', label: 'From', getValue: (r: PositionChangedRecord) => r.oldPosition },
            { key: 'to', label: 'To', getValue: (r: PositionChangedRecord) => r.newPosition },
          ]
        )}
      </Grid>
    </Box>
  );
}
