import { Chip } from '@mui/material';
import type { StrengthCategory, StrengthThresholds } from '../types';
import {
  getStrengthCategory,
  getStrengthColor,
  getStrengthTextColor,
} from '../utils/strengthColors';

interface StrengthBadgeProps {
  rating: number;
  thresholds: StrengthThresholds;
  showValue?: boolean;
}

export function StrengthBadge({
  rating,
  thresholds,
  showValue = true,
}: StrengthBadgeProps) {
  const category: StrengthCategory = getStrengthCategory(rating, thresholds);
  const backgroundColor = getStrengthColor(category);
  const textColor = getStrengthTextColor(category);

  return (
    <Chip
      label={showValue ? rating : category.charAt(0).toUpperCase() + category.slice(1)}
      size="small"
      sx={{
        backgroundColor,
        color: textColor,
        fontWeight: 600,
        minWidth: showValue ? 60 : 70,
      }}
    />
  );
}
