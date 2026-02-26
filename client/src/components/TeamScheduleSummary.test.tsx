import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { TeamScheduleSummary } from './TeamScheduleSummary';

describe('TeamScheduleSummary', () => {
  const defaultProps = {
    team: { code: 'BRI', name: 'Brisbane Broncos' },
    totalStrength: 3330,
    byeRounds: [5],
    fixtureCount: 10,
  };

  it('should display team name', () => {
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText('Brisbane Broncos')).toBeInTheDocument();
  });

  it('should display fixture count and bye count', () => {
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText('10 fixtures • 1 bye weeks')).toBeInTheDocument();
  });

  it('should display total strength value', () => {
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText('3330')).toBeInTheDocument();
  });

  it('should display "Strength of Schedule" label', () => {
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText('Strength of Schedule')).toBeInTheDocument();
  });

  it('should display average strength per match', () => {
    // Average strength = 3330 / (10 - 1 bye) = 370
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText(/Avg: 370 per match/)).toBeInTheDocument();
  });

  it('should display rank when provided', () => {
    render(
      <TeamScheduleSummary
        {...defaultProps}
        rank={5}
        totalTeams={17}
        category="easy"
      />
    );
    expect(screen.getByText(/Rank: 5\/17/)).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('should display bye rounds as chips', () => {
    render(<TeamScheduleSummary {...defaultProps} />);
    expect(screen.getByText('R5')).toBeInTheDocument();
  });

  it('should display multiple bye rounds', () => {
    render(
      <TeamScheduleSummary
        {...defaultProps}
        byeRounds={[5, 12, 18]}
        fixtureCount={27}
      />
    );

    expect(screen.getByText('R5')).toBeInTheDocument();
    expect(screen.getByText('R12')).toBeInTheDocument();
    expect(screen.getByText('R18')).toBeInTheDocument();
  });

  it('should not display bye rounds section when empty', () => {
    render(<TeamScheduleSummary {...defaultProps} byeRounds={[]} />);
    expect(screen.queryByText('Bye Rounds:')).not.toBeInTheDocument();
  });
});
