import { useState, type ReactNode, useCallback } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';

export interface ColumnDef<T> {
  key: string;
  label: string;
  groupLabel?: string;
  sticky?: boolean;
  hideOnMobile?: boolean;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  renderCell?: (row: T, rowIndex: number) => ReactNode;
  getValue?: (row: T) => number | string | null | undefined;
  format?: (v: number) => string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  stickyHeader?: boolean;
  maxHeight?: string | number;
  onRowClick?: (row: T) => void;
  footerRows?: ReactNode[];
  cardView?: boolean;
  cardTitle?: (row: T) => string;
  cardStats?: Array<{ label: string; getValue: (row: T) => string }>;
  emptyMessage?: string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  dense?: boolean;
  getRowBg?: (row: T) => string | undefined;
}

function getCellValue<T>(row: T, col: ColumnDef<T>): string | number | null {
  if (col.getValue) {
    const v = col.getValue(row);
    return v == null ? null : v;
  }
  const v = (row as Record<string, unknown>)[col.key];
  return v == null ? null : typeof v === 'number' || typeof v === 'string' ? v : String(v);
}

function formatValue<T>(col: ColumnDef<T>, val: string | number | null): string {
  if (val == null) return '—';
  if (typeof val === 'number' && col.format) return col.format(val);
  return String(val);
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  stickyHeader = true,
  maxHeight = 600,
  onRowClick,
  footerRows,
  cardView = false,
  cardTitle,
  cardStats,
  emptyMessage = 'No data',
  defaultSortKey,
  defaultSortDir = 'desc',
  dense = false,
  getRowBg,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const handleSort = useCallback((key: string) => {
    setSortDir(prev => sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : defaultSortDir);
    setSortKey(key);
  }, [sortKey, defaultSortDir]);

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = getCellValue(a, columns.find(c => c.key === sortKey)!);
        const bv = getCellValue(b, columns.find(c => c.key === sortKey)!);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : rows;

  // Detect if any column has a groupLabel (double header needed)
  const hasGroups = columns.some(c => c.groupLabel);

  // Build group header spans
  const groupSpans: Array<{ label: string; span: number }> = [];
  if (hasGroups) {
    let current: { label: string; span: number } | null = null;
    for (const col of columns) {
      const g = col.groupLabel ?? '';
      if (current && current.label === g) {
        current.span++;
      } else {
        if (current) groupSpans.push(current);
        current = { label: g, span: 1 };
      }
    }
    if (current) groupSpans.push(current);
  }

  if (cardView && cardTitle) {
    if (rows.length === 0) {
      return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{emptyMessage}</Typography>;
    }
    return (
      <Grid container spacing={1.5}>
        {sortedRows.map(row => (
          <Grid item xs={12} sm={6} md={4} key={getRowKey(row)}>
            <Card
              variant="outlined"
              sx={{ cursor: onRowClick ? 'pointer' : 'default', '&:hover': onRowClick ? { boxShadow: 2 } : {} }}
              onClick={() => onRowClick?.(row)}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  {cardTitle(row)}
                </Typography>
                {(cardStats ?? []).map(({ label, getValue }) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="caption" fontWeight={600}>{getValue(row)}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight, borderRadius: 2 }}>
      <Table
        stickyHeader={stickyHeader}
        size="small"
        sx={dense ? { '& .MuiTableCell-root': { py: '2px', px: '6px', fontSize: '0.7rem' } } : {}}
      >
        <TableHead>
          {hasGroups && (
            <TableRow>
              {groupSpans.map((g, i) => (
                <TableCell
                  key={i}
                  colSpan={g.span}
                  align="center"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 0.5,
                  }}
                >
                  {g.label}
                </TableCell>
              ))}
            </TableRow>
          )}
          <TableRow>
            {columns.map(col => (
              <TableCell
                key={col.key}
                align={col.align ?? 'right'}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  width: col.width,
                  display: { xs: col.hideOnMobile ? 'none' : 'table-cell', sm: 'table-cell' },
                  ...(col.sticky ? {
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    bgcolor: 'background.paper',
                    borderRight: '1px solid',
                    borderColor: 'divider',
                  } : {}),
                }}
              >
                {col.sortable !== false ? (
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : 'desc'}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                ) : col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row, rowIndex) => {
              const rowBg = getRowBg?.(row);
              const defaultBg = rowIndex % 2 === 1 ? 'action.hover' : 'background.paper';
              const bg = rowBg ?? defaultBg;
              return (
                <TableRow
                  key={getRowKey(row)}
                  hover={!rowBg && !!onRowClick}
                  onClick={() => onRowClick?.(row)}
                  sx={{ cursor: onRowClick ? 'pointer' : 'default', bgcolor: bg }}
                >
                  {columns.map(col => {
                    const val = col.renderCell ? null : getCellValue(row, col);
                    return (
                      <TableCell
                        key={col.key}
                        align={col.align ?? 'right'}
                        sx={{
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          display: { xs: col.hideOnMobile ? 'none' : 'table-cell', sm: 'table-cell' },
                          color: val === 0 ? 'text.disabled' : undefined,
                          ...(col.sticky ? {
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            bgcolor: bg,
                            borderRight: '1px solid',
                            borderColor: 'divider',
                          } : {}),
                        }}
                      >
                        {col.renderCell ? col.renderCell(row, rowIndex) : formatValue(col, val)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
          {footerRows}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
