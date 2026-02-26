import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { ByeTeamsList } from './ByeTeamsList';
import { mockTeams } from '../test/fixtures';

describe('ByeTeamsList', () => {
  const defaultProps = {
    teamCodes: ['DOL', 'CBY', 'WST'],
    teams: mockTeams,
  };

  it('should display bye teams count in header', () => {
    render(<ByeTeamsList {...defaultProps} />);
    expect(screen.getByText('Teams on Bye (3)')).toBeInTheDocument();
  });

  it('should display team names as chips', () => {
    render(<ByeTeamsList {...defaultProps} />);

    expect(screen.getByText('Dolphins')).toBeInTheDocument();
    expect(screen.getByText('Canterbury-Bankstown Bulldogs')).toBeInTheDocument();
    expect(screen.getByText('Wests Tigers')).toBeInTheDocument();
  });

  it('should render nothing when teamCodes is empty', () => {
    const { container } = render(<ByeTeamsList teamCodes={[]} teams={mockTeams} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render event busy icon', () => {
    const { container } = render(<ByeTeamsList {...defaultProps} />);
    expect(container.querySelector('[data-testid="EventBusyIcon"]')).toBeInTheDocument();
  });

  it('should display team code if team not found', () => {
    render(<ByeTeamsList teamCodes={['XXX']} teams={mockTeams} />);
    expect(screen.getByText('XXX')).toBeInTheDocument();
  });

  it('should handle single bye team', () => {
    render(<ByeTeamsList teamCodes={['BRI']} teams={mockTeams} />);
    expect(screen.getByText('Teams on Bye (1)')).toBeInTheDocument();
    expect(screen.getByText('Brisbane Broncos')).toBeInTheDocument();
  });
});
