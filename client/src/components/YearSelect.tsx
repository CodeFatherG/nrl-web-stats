import { FormControl, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

interface YearSelectProps {
  loadedYears: number[];
  value: number;
  onChange: (year: number) => void;
  size?: 'small' | 'medium';
}

export function YearSelect({ loadedYears, value, onChange, size = 'small' }: YearSelectProps) {
  if (loadedYears.length <= 1) return null;

  const sorted = [...loadedYears].sort((a, b) => b - a);

  return (
    <FormControl size={size} sx={{ minWidth: 110 }}>
      <Select
        value={value}
        onChange={(e: SelectChangeEvent<number>) => onChange(Number(e.target.value))}
      >
        {sorted.map((y) => (
          <MenuItem key={y} value={y}>{y}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
