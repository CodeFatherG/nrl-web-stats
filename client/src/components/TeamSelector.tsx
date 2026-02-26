import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { Team } from '../types';

interface TeamSelectorProps {
  teams: Team[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  disabled?: boolean;
}

export function TeamSelector({
  teams,
  selectedCode,
  onSelect,
  disabled = false,
}: TeamSelectorProps) {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onSelect(event.target.value);
  };

  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id="team-selector-label">Select Team</InputLabel>
      <Select
        labelId="team-selector-label"
        id="team-selector"
        value={selectedCode ?? ''}
        label="Select Team"
        onChange={handleChange}
      >
        {teams.map((team) => (
          <MenuItem key={team.code} value={team.code}>
            {team.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
