import { useState } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';
import type { PlayerSeasonSummary } from '../types';

interface PlayerSearchInputProps {
  allPlayers: PlayerSeasonSummary[];
  excludeIds: string[];
  onSelect: (playerId: string) => void;
  disabled?: boolean;
}

export function PlayerSearchInput({
  allPlayers,
  excludeIds,
  onSelect,
  disabled = false,
}: PlayerSearchInputProps) {
  const [inputValue, setInputValue] = useState('');

  const options = allPlayers.filter((p) => !excludeIds.includes(p.playerId));

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => option.playerName}
      filterOptions={(opts, state) => {
        const q = state.inputValue.toLowerCase();
        return opts.filter((o) => o.playerName.toLowerCase().includes(q));
      }}
      inputValue={inputValue}
      onInputChange={(_event, value) => setInputValue(value)}
      onChange={(_event, value) => {
        if (value) {
          onSelect(value.playerId);
          setInputValue('');
        }
      }}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search players"
          placeholder="Type a player name..."
          size="small"
          fullWidth
        />
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.playerId}>
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {option.playerName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.teamCode} · {option.position}
            </Typography>
          </Box>
        </Box>
      )}
      noOptionsText={allPlayers.length === 0 ? 'Loading players…' : 'No players found'}
      isOptionEqualToValue={(option, value) => option.playerId === value.playerId}
    />
  );
}
