import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { useCasualtyWardQuery } from '../hooks/useCasualtyWardQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { getTeamBackground } from '../utils/teamColors';
import type { CasualtyWardEntry } from '../services/api';

const RETURN_SORT = (r: string) => {
  const n = Number(r.replace(/\D/g, ''));
  if (!isNaN(n) && n > 0) return n;
  if (r === 'TBC') return 1000;
  if (r.toLowerCase().includes('next season')) return 1001;
  if (r.toLowerCase().includes('indefinite')) return 1002;
  return 1003;
};

export function CasualtyWardView() {
  const navigate = useNavigate();
  const query = useCasualtyWardQuery();

  if (query.isLoading) return <SkeletonPage variant="table" />;
  if (query.isError) return <Alert severity="error">Failed to load casualty ward data.</Alert>;

  const entries = [...(query.data?.entries ?? [])].sort(
    (a, b) => RETURN_SORT(a.expectedReturn) - RETURN_SORT(b.expectedReturn)
  );
  const total = query.data?.count ?? 0;

  const columns = [
    { key: 'playerName', label: 'Player', align: 'left' as const, sortable: true,
      getValue: (e: CasualtyWardEntry) => e.playerName,
      renderCell: (e: CasualtyWardEntry) => (
        <Typography
          variant="caption" fontWeight={600}
          sx={{ cursor: e.playerId ? 'pointer' : 'default', textDecoration: e.playerId ? 'underline' : 'none' }}
          onClick={() => e.playerId && navigate(`/player/${e.playerId}`)}
        >
          {e.playerName}
        </Typography>
      ) },
    { key: 'teamCode', label: 'Team', align: 'center' as const, sortable: true,
      getValue: (e: CasualtyWardEntry) => e.teamCode,
      renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.teamCode}</Typography> },
    { key: 'injury', label: 'Injury', align: 'left' as const, sortable: true,
      getValue: (e: CasualtyWardEntry) => e.injury,
      renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.injury}</Typography> },
    { key: 'expectedReturn', label: 'Expected Return', align: 'left' as const, sortable: true,
      getValue: (e: CasualtyWardEntry) => RETURN_SORT(e.expectedReturn),
      renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.expectedReturn}</Typography> },
    { key: 'startDate', label: 'Since', align: 'left' as const, sortable: true, hideOnMobile: true,
      getValue: (e: CasualtyWardEntry) => e.startDate,
      renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.startDate}</Typography> },
  ];

  return (
    <Box>
      <PageHeader title="Casualty Ward" subtitle={`${total} player${total !== 1 ? 's' : ''} currently injured`} />

      {entries.length === 0 ? (
        <Alert severity="success">No current injuries on record.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={entries}
          getRowKey={e => String(e.id)}
          stickyHeader
          maxHeight="75vh"
          defaultSortKey="expectedReturn"
          defaultSortDir="asc"
          dense
          getRowBg={e => getTeamBackground(e.teamCode)}
          onRowClick={e => e.playerId && navigate(`/player/${e.playerId}`)}
        />
      )}
    </Box>
  );
}
