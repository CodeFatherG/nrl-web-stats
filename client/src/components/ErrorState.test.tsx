import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../test/utils';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  const defaultProps = {
    title: 'Connection Error',
    message: 'Unable to connect to the server.',
    onRetry: vi.fn(),
  };

  it('should display error title', () => {
    render(<ErrorState {...defaultProps} />);
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
  });

  it('should display error message', () => {
    render(<ErrorState {...defaultProps} />);
    expect(screen.getByText('Unable to connect to the server.')).toBeInTheDocument();
  });

  it('should display default retry button label', () => {
    render(<ErrorState {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('should display custom retry button label', () => {
    render(<ErrorState {...defaultProps} retryLabel="Try Again" />);
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('should call onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState {...defaultProps} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should render error alert with severity error', () => {
    render(<ErrorState {...defaultProps} />);
    expect(screen.getByRole('alert')).toHaveClass('MuiAlert-standardError');
  });
});
