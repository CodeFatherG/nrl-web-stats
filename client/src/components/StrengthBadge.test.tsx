import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { StrengthBadge } from './StrengthBadge';
import { mockStrengthThresholds } from '../test/fixtures';

describe('StrengthBadge', () => {
  const thresholds = mockStrengthThresholds; // { p33: 320, p67: 400 }

  describe('rating display', () => {
    it('should display the rating value by default', () => {
      render(<StrengthBadge rating={350} category="medium" />);
      expect(screen.getByText('350')).toBeInTheDocument();
    });

    it('should display category name when showValue is false', () => {
      render(<StrengthBadge rating={350} category="medium" showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });
  });

  describe('color categories with pre-computed category', () => {
    it('should render with hard category', () => {
      render(<StrengthBadge rating={280} category="hard" showValue={false} />);
      expect(screen.getByText('Hard')).toBeInTheDocument();
    });

    it('should render with medium category', () => {
      render(<StrengthBadge rating={350} category="medium" showValue={false} />);
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('should render with easy category', () => {
      render(<StrengthBadge rating={450} category="easy" showValue={false} />);
      expect(screen.getByText('Easy')).toBeInTheDocument();
    });
  });

  describe('fallback to thresholds when no category provided', () => {
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
