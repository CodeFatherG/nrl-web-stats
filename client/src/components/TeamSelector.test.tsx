import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { TeamSelector } from './TeamSelector';
import { mockTeams } from '../test/fixtures';

describe('TeamSelector', () => {
  const defaultProps = {
    teams: mockTeams,
    selectedCode: null,
    onSelect: vi.fn(),
  };

  it('should render with label', () => {
    render(<TeamSelector {...defaultProps} />);
    expect(screen.getByLabelText('Select Team')).toBeInTheDocument();
  });

  it('should render all teams as options', async () => {
    render(<TeamSelector {...defaultProps} />);

    // Open the select dropdown
    const select = screen.getByRole('combobox');
    await userEvent.click(select);

    // Check that all teams are listed
    expect(screen.getByText('Brisbane Broncos')).toBeInTheDocument();
    expect(screen.getByText('Melbourne Storm')).toBeInTheDocument();
    expect(screen.getByText('Penrith Panthers')).toBeInTheDocument();
  });

  it('should display selected team', () => {
    render(<TeamSelector {...defaultProps} selectedCode="BRI" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Brisbane Broncos');
  });

  it('should call onSelect when team is selected', async () => {
    const onSelect = vi.fn();
    render(<TeamSelector {...defaultProps} onSelect={onSelect} />);

    // Open dropdown and select a team
    const select = screen.getByRole('combobox');
    await userEvent.click(select);
    await userEvent.click(screen.getByText('Melbourne Storm'));

    expect(onSelect).toHaveBeenCalledWith('MEL');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<TeamSelector {...defaultProps} disabled={true} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-disabled', 'true');
  });
});
