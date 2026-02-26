import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { StrengthBadge } from './StrengthBadge';
import { mockStrengthThresholds } from '../test/fixtures';

describe('StrengthBadge', () => {
  const thresholds = mockStrengthThresholds; // { p33: 320, p67: 400 }

  describe('rating display', () => {
    it('should display the rating value by default', () => {
      render(<StrengthBadge rating={350} thresholds={thresholds} />);
      expect(screen.getByText('350')).toBeInTheDocument();
    });

    it('should display category name when showValue is false', () => {
      render(<StrengthBadge rating={350} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });
  });

  // Lower ratings = fewer SC points = harder matchup
  // Higher ratings = more SC points = easier matchup
  describe('color categories', () => {
    it('should render with hard category for low ratings (fewer points)', () => {
      render(<StrengthBadge rating={280} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Hard')).toBeInTheDocument();
    });

    it('should render with medium category for mid ratings', () => {
      render(<StrengthBadge rating={350} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('should render with easy category for high ratings (more points)', () => {
      render(<StrengthBadge rating={450} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Easy')).toBeInTheDocument();
    });
  });

  describe('threshold boundaries', () => {
    it('should show hard at exactly p33', () => {
      render(<StrengthBadge rating={320} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Hard')).toBeInTheDocument();
    });

    it('should show medium just above p33', () => {
      render(<StrengthBadge rating={321} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('should show medium at exactly p67', () => {
      render(<StrengthBadge rating={400} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('should show easy just above p67', () => {
      render(<StrengthBadge rating={401} thresholds={thresholds} showValue={false} />);
      expect(screen.getByText('Easy')).toBeInTheDocument();
    });
  });
});
