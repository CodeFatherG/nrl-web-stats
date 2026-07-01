import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { getTeamBackground } from '../../utils/teamColors';
import type { DashboardProjectionRow } from '../../services/api';

interface TopProjectionsTileProps {
  title: string;
  rows: DashboardProjectionRow[];
}

export function TopProjectionsTile({ title, rows }: TopProjectionsTileProps) {
  const navigate = useNavigate();

  const columns: ColumnDef<DashboardProjectionRow>[] = [
    {
      key: 'playerName', label: 'Player', align: 'left', sortable: true,
      getValue: r => r.playerName,
      renderCell: r => (
        <Box sx={{ lineHeight: 1.15 }}>
          <Typography variant="caption" fontWeight={600} sx={{ display: 'block' }}>{r.playerName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
            {r.teamCode} vs {r.opponent}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'baseTotal', label: 'Base', align: 'right', sortable: true,
      getValue: r => r.baseTotal,
      renderCell: r => (
        <Typography variant="caption" color="text.secondary">{r.baseTotal.toFixed(0)}</Typography>
      ),
    },
    {
      key: 'adjustedTotal', label: 'Adj', align: 'right', sortable: true,
      getValue: r => r.adjustedTotal,
      renderCell: r => {
        const d = r.adjustedTotal - r.baseTotal;
        const sign = d > 0 ? '+' : '';
        const color = d > 0.5 ? 'success.main' : d < -0.5 ? 'error.main' : 'text.secondary';
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
            <Typography variant="caption" fontWeight={700}>{r.adjustedTotal.toFixed(0)}</Typography>
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color }}>{sign}{d.toFixed(1)}</Typography>
          </Box>
        );
      },
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
        getRowKey={r => r.playerId}
        stickyHeader={false}
        dense
        maxHeight="40vh"
        defaultSortKey="adjustedTotal"
        defaultSortDir="desc"
        getRowBg={r => getTeamBackground(r.teamCode)}
        onRowClick={r => navigate(`/player/${r.playerId}`)}
        emptyMessage="No projections available"
      />
    </Paper>
  );
}
