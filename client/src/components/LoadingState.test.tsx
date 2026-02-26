import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('should display default loading message', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading NRL schedule data...')).toBeInTheDocument();
  });

  it('should display custom loading message', () => {
    render(<LoadingState message="Custom loading message" />);
    expect(screen.getByText('Custom loading message')).toBeInTheDocument();
  });

  it('should render circular progress indicator', () => {
    render(<LoadingState />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
