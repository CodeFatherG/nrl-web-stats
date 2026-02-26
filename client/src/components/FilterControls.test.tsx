import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../test/utils';
import { FilterControls } from './FilterControls';
import type { FilterState } from '../types';

describe('FilterControls', () => {
  const defaultFilters: FilterState = {
    roundStart: 1,
    roundEnd: 27,
    venueFilter: 'all',
  };

  const defaultProps = {
    filters: defaultFilters,
    onFiltersChange: vi.fn(),
  };

  it('should display round range label', () => {
    render(<FilterControls {...defaultProps} />);
    expect(screen.getByText(/Round Range: 1 - 27/)).toBeInTheDocument();
  });

  it('should display venue filter buttons', () => {
    render(<FilterControls {...defaultProps} />);
    expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Away/i })).toBeInTheDocument();
  });

  it('should call onFiltersChange when venue filter changes', () => {
    const onFiltersChange = vi.fn();
    render(<FilterControls {...defaultProps} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Home/i }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      venueFilter: 'home',
    });
  });

  it('should disable the clear button when no active filters', () => {
    render(<FilterControls {...defaultProps} hasActiveFilters={false} />);
    const clearButton = screen.getByRole('button', { name: /Clear Filters/i });
    expect(clearButton).toBeDisabled();
  });

  it('should show clear button when filters are active', () => {
    render(<FilterControls {...defaultProps} hasActiveFilters={true} />);
    expect(screen.getByRole('button', { name: /Clear Filters/i })).toBeInTheDocument();
  });

  it('should reset filters when clear button is clicked', () => {
    const onFiltersChange = vi.fn();
    const activeFilters: FilterState = {
      roundStart: 5,
      roundEnd: 15,
      venueFilter: 'home',
    };

    render(
      <FilterControls
        filters={activeFilters}
        onFiltersChange={onFiltersChange}
        hasActiveFilters={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Clear Filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      roundStart: 1,
      roundEnd: 27,
      venueFilter: 'all',
    });
  });

  it('should be disabled when disabled prop is true', () => {
    render(<FilterControls {...defaultProps} disabled={true} />);

    // Check venue buttons are disabled
    expect(screen.getByRole('button', { name: /All/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Home/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Away/i })).toBeDisabled();
  });

  it('should display current filter values', () => {
    const customFilters: FilterState = {
      roundStart: 5,
      roundEnd: 15,
      venueFilter: 'away',
    };

    render(<FilterControls {...defaultProps} filters={customFilters} />);
    expect(screen.getByText(/Round Range: 5 - 15/)).toBeInTheDocument();
  });
});
