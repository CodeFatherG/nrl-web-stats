import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { NoDataState } from './NoDataState';

describe('NoDataState', () => {
  const defaultProps = {
    onLoadData: vi.fn(),
  };

  it('should display "No Schedule Data Loaded" title', () => {
    render(<NoDataState {...defaultProps} />);
    expect(screen.getByText('No Schedule Data Loaded')).toBeInTheDocument();
  });

  it('should display description text', () => {
    render(<NoDataState {...defaultProps} />);
    expect(
      screen.getByText(/Load the NRL schedule data to view team schedules/i)
    ).toBeInTheDocument();
  });

  it('should have year selector with current year selected by default', () => {
    render(<NoDataState {...defaultProps} />);
    const currentYear = new Date().getFullYear();
    expect(screen.getByRole('combobox')).toHaveTextContent(currentYear.toString());
  });

  it('should have "Load Schedule" button', () => {
    render(<NoDataState {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Load Schedule/i })).toBeInTheDocument();
  });

  it('should call onLoadData with selected year when button is clicked', async () => {
    const onLoadData = vi.fn();
    render(<NoDataState onLoadData={onLoadData} />);

    fireEvent.click(screen.getByRole('button', { name: /Load Schedule/i }));

    const currentYear = new Date().getFullYear();
    expect(onLoadData).toHaveBeenCalledWith(currentYear);
  });

  it('should allow selecting different year', async () => {
    const onLoadData = vi.fn();
    render(<NoDataState onLoadData={onLoadData} />);

    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    // Open year dropdown
    const select = screen.getByRole('combobox');
    await userEvent.click(select);

    // Select last year
    await userEvent.click(screen.getByText(lastYear.toString()));

    // Click load
    fireEvent.click(screen.getByRole('button', { name: /Load Schedule/i }));

    expect(onLoadData).toHaveBeenCalledWith(lastYear);
  });

  describe('loading state', () => {
    it('should show "Loading..." text when loading', () => {
      render(<NoDataState {...defaultProps} loading={true} />);
      expect(screen.getByRole('button', { name: /Loading/i })).toBeInTheDocument();
    });

    it('should disable button when loading', () => {
      render(<NoDataState {...defaultProps} loading={true} />);
      expect(screen.getByRole('button', { name: /Loading/i })).toBeDisabled();
    });

    it('should disable year selector when loading', () => {
      render(<NoDataState {...defaultProps} loading={true} />);
      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-disabled', 'true');
    });

    it('should show progress indicator when loading', () => {
      render(<NoDataState {...defaultProps} loading={true} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});
