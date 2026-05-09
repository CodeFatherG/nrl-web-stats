import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import { useCasualtyWardQuery } from '../hooks/useCasualtyWardQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import Chip from '@mui/material/Chip';
import type { CasualtyWardEntry } from '../services/api';

const RETURN_ORDER = (r: string) => {
  const n = Number(r.replace(/\D/g, ''));
  if (!isNaN(n) && n > 0) return n;
  if (r === 'TBC') return 1000;
  if (r.toLowerCase().includes('indefinite')) return 1001;
  if (r.toLowerCase().includes('next season')) return 1002;
  return 1003;
};

const COLUMNS = [
  { key: 'playerName', label: 'Player', align: 'left' as const, sortable: true,
    getValue: (e: CasualtyWardEntry) => e.playerName,
    renderCell: (e: CasualtyWardEntry) => (
      e.playerId ? (
        <Link component="button" variant="caption" onClick={() => {}}>
          {e.playerName}
        </Link>
      ) : (
        <Typography variant="caption">{e.playerName}</Typography>
      )
    ) },
  { key: 'teamCode', label: 'Team', align: 'center' as const,
    renderCell: (e: CasualtyWardEntry) => <Chip label={e.teamCode} size="small" variant="outlined" /> },
  { key: 'injury', label: 'Injury', align: 'left' as const,
    renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.injury}</Typography> },
  { key: 'startDate', label: 'Since', align: 'left' as const, hideOnMobile: true,
    renderCell: (e: CasualtyWardEntry) => <Typography variant="caption">{e.startDate}</Typography> },
];

export function CasualtyWardView() {
  const navigate = useNavigate();
  const query = useCasualtyWardQuery();

  const grouped = useMemo(() => {
    if (!query.data) return [];
    const groups = new Map<string, CasualtyWardEntry[]>();
    for (const e of query.data.entries) {
      const key = e.expectedReturn;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => RETURN_ORDER(a) - RETURN_ORDER(b));
  }, [query.data]);

  if (query.isLoading) return <SkeletonPage variant="table" />;
  if (query.isError) return <Alert severity="error">Failed to load casualty ward data.</Alert>;

  const total = query.data?.count ?? 0;

  return (
    <Box>
      <PageHeader title="Casualty Ward" subtitle={`${total} player${total !== 1 ? 's' : ''} currently injured`} />

      {grouped.length === 0 ? (
        <Alert severity="success">No current injuries on record.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {grouped.map(([returnDate, entries]) => (
            <SectionCard key={returnDate} title={`Expected Return: ${returnDate} (${entries.length})`}>
              <DataTable
                columns={COLUMNS.map(col =>
                  col.key === 'playerName'
                    ? {
                        ...col,
                        renderCell: (e: CasualtyWardEntry) =>
                          e.playerId ? (
                            <Link
                              component="button"
                              variant="caption"
                              onClick={() => navigate(`/player/${e.playerId}`)}
                            >
                              {e.playerName}
                            </Link>
                          ) : (
                            <Typography variant="caption">{e.playerName}</Typography>
                          ),
                      }
                    : col
                )}
                rows={entries}
                getRowKey={e => String(e.id)}
                emptyMessage="None"
              />
            </SectionCard>
          ))}
        </Box>
      )}
    </Box>
  );
}
