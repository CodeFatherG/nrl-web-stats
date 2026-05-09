import Chip from '@mui/material/Chip';

interface InjuryStatusChipProps {
  status: 'injured' | 'recovering' | 'available';
  label?: string;
  size?: 'small' | 'medium';
}

const CONFIG = {
  injured: { color: 'error' as const, defaultLabel: 'Injured' },
  recovering: { color: 'warning' as const, defaultLabel: 'Recovering' },
  available: { color: 'success' as const, defaultLabel: 'Available' },
};

export function InjuryStatusChip({ status, label, size = 'small' }: InjuryStatusChipProps) {
  const { color, defaultLabel } = CONFIG[status];
  return <Chip label={label ?? defaultLabel} color={color} size={size} />;
}
