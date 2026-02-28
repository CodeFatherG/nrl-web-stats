import { Chip } from '@mui/material';
import type { StrengthCategory, StrengthThresholds } from '../types';
import {
  getStrengthCategory,
  getStrengthColor,
  getStrengthTextColor,
} from '../utils/strengthColors';

interface StrengthBadgeProps {
  rating: number;
  /** Pre-computed category (preferred). If provided, thresholds are ignored. */
  category?: StrengthCategory;
  /** Thresholds for computing category from rating. Used only when category is not provided. */
  thresholds?: StrengthThresholds;
  showValue?: boolean;
}

export function StrengthBadge({
  rating,
  category: categoryProp,
  thresholds,
  showValue = true,
}: StrengthBadgeProps) {
  const category: StrengthCategory = categoryProp
    ?? (thresholds ? getStrengthCategory(rating, thresholds) : 'medium');
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
