import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { getTeamBackground } from '../../utils/teamColors';
import type { DashboardBreakEvenRow } from '../../services/api';

interface BreakEvenTileProps {
  title: string;
  rows: DashboardBreakEvenRow[];
}

function formatPrice(price: number): string {
  return `$${Math.round(price / 1000)}k`;
}

export function BreakEvenTile({ title, rows }: BreakEvenTileProps) {
  const navigate = useNavigate();

  const columns: ColumnDef<DashboardBreakEvenRow>[] = [
    {
      key: 'playerName', label: 'Player', align: 'left', sortable: true,
      getValue: r => r.playerName,
      renderCell: r => (
        <Box sx={{ lineHeight: 1.15 }}>
          <Typography variant="caption" fontWeight={600} sx={{ display: 'block' }}>{r.playerName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
            {r.teamCode}{r.scPosition ? ` · ${r.scPosition}` : ''}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'price', label: 'Price', align: 'right', sortable: true,
      getValue: r => r.price,
      renderCell: r => <Typography variant="caption">{formatPrice(r.price)}</Typography>,
    },
    {
      key: 'breakEven', label: 'BE', align: 'right', sortable: true,
      getValue: r => r.breakEven,
      renderCell: r => <Typography variant="caption" fontWeight={700}>{r.breakEven}</Typography>,
    },
  ];

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', height: '100%' }}>
      <Box sx={{ px: 1.25, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.72rem' }}>{title}</Typography>
      </Box>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={r => `${r.playerName}-${r.teamCode}`}
        stickyHeader={false}
        dense
        maxHeight="40vh"
        getRowBg={r => getTeamBackground(r.teamCode)}
        onRowClick={r => {
          if (r.playerId) navigate(`/player/${r.playerId}`);
        }}
        emptyMessage="No data"
      />
    </Paper>
  );
}
