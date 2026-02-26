import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

interface RoundSelectorProps {
  selectedRound: number;
  onSelect: (round: number) => void;
  disabled?: boolean;
}

const ROUNDS = Array.from({ length: 27 }, (_, i) => i + 1);

export function RoundSelector({
  selectedRound,
  onSelect,
  disabled = false,
}: RoundSelectorProps) {
  const handleChange = (event: SelectChangeEvent<number>) => {
    onSelect(Number(event.target.value));
  };

  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id="round-selector-label">Select Round</InputLabel>
      <Select
        labelId="round-selector-label"
        id="round-selector"
        value={selectedRound}
        label="Select Round"
        onChange={handleChange}
      >
        {ROUNDS.map((round) => (
          <MenuItem key={round} value={round}>
            Round {round}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
