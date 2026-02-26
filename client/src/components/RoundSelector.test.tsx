import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { RoundSelector } from './RoundSelector';

describe('RoundSelector', () => {
  const defaultProps = {
    selectedRound: 1,
    onSelect: vi.fn(),
  };

  it('should render with label', () => {
    render(<RoundSelector {...defaultProps} />);
    expect(screen.getByLabelText('Select Round')).toBeInTheDocument();
  });

  it('should display selected round', () => {
    render(<RoundSelector {...defaultProps} selectedRound={5} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Round 5');
  });

  it('should render all 27 rounds as options', async () => {
    render(<RoundSelector {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await userEvent.click(select);

    // Use getAllByRole to find menu items since "Round 1" appears both in
    // the select display and the dropdown menu
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(27);
    expect(options[0]).toHaveTextContent('Round 1');
    expect(options[13]).toHaveTextContent('Round 14');
    expect(options[26]).toHaveTextContent('Round 27');
  });

  it('should call onSelect when round is selected', async () => {
    const onSelect = vi.fn();
    render(<RoundSelector {...defaultProps} onSelect={onSelect} />);

    const select = screen.getByRole('combobox');
    await userEvent.click(select);
    await userEvent.click(screen.getByText('Round 10'));

    expect(onSelect).toHaveBeenCalledWith(10);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<RoundSelector {...defaultProps} disabled={true} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-disabled', 'true');
  });
});
