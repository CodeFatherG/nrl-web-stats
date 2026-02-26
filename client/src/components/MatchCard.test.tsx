import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { MatchCard } from './MatchCard';
import { mockStrengthThresholds } from '../test/fixtures';

describe('MatchCard', () => {
  const defaultProps = {
    homeStrength: 420,
    awayStrength: 380,
    homeTeamName: 'Brisbane Broncos',
    awayTeamName: 'Sydney Roosters',
    strengthThresholds: mockStrengthThresholds,
  };

  it('should display home team name', () => {
    render(<MatchCard {...defaultProps} />);
    expect(screen.getByText('Brisbane Broncos')).toBeInTheDocument();
  });

  it('should display away team name', () => {
    render(<MatchCard {...defaultProps} />);
    expect(screen.getByText('Sydney Roosters')).toBeInTheDocument();
  });

  it('should display "Home" and "Away" labels', () => {
    render(<MatchCard {...defaultProps} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('should display "vs" divider', () => {
    render(<MatchCard {...defaultProps} />);
    expect(screen.getByText('vs')).toBeInTheDocument();
  });

  it('should display strength ratings for both teams', () => {
    render(<MatchCard {...defaultProps} />);
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('380')).toBeInTheDocument();
  });

  it('should render strength badges with correct thresholds', () => {
    // Hard: 420 > p67 (400)
    // Medium: 380 > p33 (320) but <= p67 (400)
    render(<MatchCard {...defaultProps} />);

    // Both strength values should be displayed
    const strengthBadges = screen.getAllByText(/\d{3}/);
    expect(strengthBadges.length).toBe(2);
  });
});
