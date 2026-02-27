import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../test/utils';
import { TabNavigation } from './TabNavigation';

describe('TabNavigation', () => {
  const defaultProps = {
    activeTab: 'team' as const,
    onTabChange: vi.fn(),
  };

  it('should render team, round, and bye tabs', () => {
    render(<TabNavigation {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /Team Schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Round Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Bye Overview/i })).toBeInTheDocument();
  });

  it('should highlight team tab when activeTab is team', () => {
    render(<TabNavigation {...defaultProps} activeTab="team" />);
    const teamTab = screen.getByRole('tab', { name: /Team Schedule/i });
    expect(teamTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should highlight round tab when activeTab is round', () => {
    render(<TabNavigation {...defaultProps} activeTab="round" />);
    const roundTab = screen.getByRole('tab', { name: /Round Overview/i });
    expect(roundTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should call onTabChange with "team" when team tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation activeTab="round" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Team Schedule/i }));

    expect(onTabChange).toHaveBeenCalledWith('team');
  });

  it('should call onTabChange with "round" when round tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation activeTab="team" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Round Overview/i }));

    expect(onTabChange).toHaveBeenCalledWith('round');
  });

  it('should highlight bye tab when activeTab is bye', () => {
    render(<TabNavigation {...defaultProps} activeTab="bye" />);
    const byeTab = screen.getByRole('tab', { name: /Bye Overview/i });
    expect(byeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should call onTabChange with "bye" when bye tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation activeTab="team" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Bye Overview/i }));

    expect(onTabChange).toHaveBeenCalledWith('bye');
  });

  it('should have proper accessibility attributes', () => {
    render(<TabNavigation {...defaultProps} />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-label', 'Schedule view tabs');

    const teamTab = screen.getByRole('tab', { name: /Team Schedule/i });
    expect(teamTab).toHaveAttribute('id', 'tab-team');
    expect(teamTab).toHaveAttribute('aria-controls', 'tabpanel-team');

    const roundTab = screen.getByRole('tab', { name: /Round Overview/i });
    expect(roundTab).toHaveAttribute('id', 'tab-round');
    expect(roundTab).toHaveAttribute('aria-controls', 'tabpanel-round');

    const byeTab = screen.getByRole('tab', { name: /Bye Overview/i });
    expect(byeTab).toHaveAttribute('id', 'tab-bye');
    expect(byeTab).toHaveAttribute('aria-controls', 'tabpanel-bye');
  });
});
