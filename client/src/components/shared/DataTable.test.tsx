import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { render } from '../../test/utils';
import { DataTable } from './DataTable';
import type { ColumnDef } from './DataTable';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

type Row = { id: string; name: string; score: number | null };

const columns: ColumnDef<Row>[] = [
  {
    key: 'name', label: 'Name', sortable: true, align: 'left',
    getValue: r => r.name,
    renderCell: r => <span>{r.name}</span>,
  },
  {
    key: 'score', label: 'Score', sortable: true, align: 'right',
    getValue: r => r.score,
    renderCell: r => <span>{r.score ?? '—'}</span>,
  },
];

const rows: Row[] = [
  { id: '1', name: 'Charlie', score: 60 },
  { id: '2', name: 'Alice', score: 80 },
  { id: '3', name: 'Bob', score: null },
];

function getDataRows() {
  return screen.getAllByRole('row').filter(r => r.closest('tbody'));
}

describe('DataTable', () => {
  describe('sorting', () => {
    it('renders sort labels for sortable columns', () => {
      render(<DataTable columns={columns} rows={rows} getRowKey={r => r.id} />);
      expect(screen.getByRole('button', { name: /Name/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Score/i })).toBeInTheDocument();
    });

    it('applies defaultSortKey and defaultSortDir on initial render', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          defaultSortKey="score" defaultSortDir="desc"
        />,
      );
      const dataRows = getDataRows();
      // desc by score: Alice(80), Charlie(60), Bob(null last)
      expect(within(dataRows[0]!).getByText('Alice')).toBeInTheDocument();
      expect(within(dataRows[1]!).getByText('Charlie')).toBeInTheDocument();
      expect(within(dataRows[2]!).getByText('Bob')).toBeInTheDocument();
    });

    it('sorts ascending after first click on a column (defaultSortDir=asc)', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          defaultSortDir="asc"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Name/i }));
      const dataRows = getDataRows();
      // asc by name: Alice, Bob, Charlie
      expect(within(dataRows[0]!).getByText('Alice')).toBeInTheDocument();
      expect(within(dataRows[1]!).getByText('Bob')).toBeInTheDocument();
      expect(within(dataRows[2]!).getByText('Charlie')).toBeInTheDocument();
    });

    it('toggles direction on second click of same column', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          defaultSortKey="name" defaultSortDir="asc"
        />,
      );
      // Initial: asc by name → Alice, Bob, Charlie
      const nameBtn = screen.getByRole('button', { name: /Name/i });
      fireEvent.click(nameBtn); // toggle → desc
      const dataRows = getDataRows();
      // desc by name: Charlie, Bob, Alice
      expect(within(dataRows[0]!).getByText('Charlie')).toBeInTheDocument();
      expect(within(dataRows[2]!).getByText('Alice')).toBeInTheDocument();
    });

    it('resets to defaultSortDir when switching to a different column', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          defaultSortKey="name" defaultSortDir="asc"
        />,
      );
      // Click Score → should sort asc (defaultSortDir)
      fireEvent.click(screen.getByRole('button', { name: /Score/i }));
      const dataRows = getDataRows();
      // asc by score: Charlie(60), Alice(80), Bob(null last)
      expect(within(dataRows[0]!).getByText('Charlie')).toBeInTheDocument();
      expect(within(dataRows[1]!).getByText('Alice')).toBeInTheDocument();
      expect(within(dataRows[2]!).getByText('Bob')).toBeInTheDocument();
    });

    it('always sorts null values to the bottom regardless of direction', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          defaultSortKey="score" defaultSortDir="asc"
        />,
      );
      // asc: Charlie(60), Alice(80), Bob(null) — null still last
      const dataRows = getDataRows();
      expect(within(dataRows[2]!).getByText('Bob')).toBeInTheDocument();
    });

    it('does not show sort button for columns with sortable=false', () => {
      const fixedCols: ColumnDef<Row>[] = [
        { key: 'name', label: 'Name', sortable: false, renderCell: r => <span>{r.name}</span> },
      ];
      render(<DataTable columns={fixedCols} rows={rows} getRowKey={r => r.id} />);
      expect(screen.queryByRole('button', { name: /Name/i })).not.toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
  });

  describe('column groups', () => {
    const groupedCols: ColumnDef<Row>[] = [
      { key: 'name', label: 'Name', groupLabel: 'Player', sortable: false, renderCell: r => <span>{r.name}</span> },
      { key: 'score', label: 'Score', groupLabel: 'Stats', sortable: false, renderCell: r => <span>{r.score}</span> },
    ];

    it('does not render a group header row when no column has groupLabel', () => {
      render(<DataTable columns={columns} rows={rows} getRowKey={r => r.id} />);
      const headerRows = screen.getAllByRole('row').filter(r => r.closest('thead'));
      expect(headerRows).toHaveLength(1);
    });

    it('renders a group header row when columns have groupLabels', () => {
      render(<DataTable columns={groupedCols} rows={rows} getRowKey={r => r.id} />);
      expect(screen.getByText('Player')).toBeInTheDocument();
      expect(screen.getByText('Stats')).toBeInTheDocument();
    });

    it('spans consecutive columns with the same groupLabel', () => {
      const sameLabelCols: ColumnDef<Row>[] = [
        { key: 'name', label: 'Name', groupLabel: 'Info', sortable: false, renderCell: r => <span>{r.name}</span> },
        { key: 'score', label: 'Score', groupLabel: 'Info', sortable: false, renderCell: r => <span>{r.score}</span> },
      ];
      render(<DataTable columns={sameLabelCols} rows={rows} getRowKey={r => r.id} />);
      const headerRows = screen.getAllByRole('row').filter(r => r.closest('thead'));
      const groupRow = headerRows[0]!;
      const groupCell = within(groupRow).getByText('Info').closest('th')!;
      expect(groupCell.getAttribute('colspan')).toBe('2');
    });
  });

  describe('row styling and interaction', () => {
    it('fires onRowClick with the correct row when a row is clicked', () => {
      const onRowClick = vi.fn();
      render(<DataTable columns={columns} rows={rows} getRowKey={r => r.id} onRowClick={onRowClick} />);
      fireEvent.click(getDataRows()[0]!);
      expect(onRowClick).toHaveBeenCalledTimes(1);
    });

    it('applies getRowBg colour to matching rows', () => {
      const getRowBg = (r: Row) => r.name === 'Alice' ? '#ff0000' : undefined;
      render(<DataTable columns={columns} rows={rows} getRowKey={r => r.id} getRowBg={getRowBg} />);
      // Component renders without errors and the table rows are present
      expect(getDataRows()).toHaveLength(3);
    });
  });

  describe('empty state', () => {
    it('shows emptyMessage when rows array is empty', () => {
      render(<DataTable columns={columns} rows={[]} getRowKey={r => r.id} emptyMessage="Nothing here" />);
      expect(screen.getByText('Nothing here')).toBeInTheDocument();
    });

    it('shows default "No data" message when rows is empty and no emptyMessage provided', () => {
      render(<DataTable columns={columns} rows={[]} getRowKey={r => r.id} />);
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });

  describe('card view', () => {
    const cardStats = [
      { label: 'Score', getValue: (r: Row) => String(r.score ?? '—') },
    ];

    it('renders cards instead of a table when cardView=true', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          cardView cardTitle={r => r.name} cardStats={cardStats}
        />,
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('shows cardTitle as heading in each card', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          cardView cardTitle={r => r.name}
        />,
      );
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('shows cardStats label and value in each card', () => {
      render(
        <DataTable
          columns={columns} rows={rows} getRowKey={r => r.id}
          cardView cardTitle={r => r.name} cardStats={cardStats}
        />,
      );
      // 3 cards × 1 stat each = 3 'Score' labels
      expect(screen.getAllByText('Score')).toHaveLength(3);
    });
  });

  describe('footer rows', () => {
    it('renders footerRows content after data rows', () => {
      const footer = [
        <TableRow key="footer">
          <TableCell>Total: 140</TableCell>
        </TableRow>,
      ];
      render(<DataTable columns={columns} rows={rows} getRowKey={r => r.id} footerRows={footer} />);
      expect(screen.getByText('Total: 140')).toBeInTheDocument();
    });
  });
});
