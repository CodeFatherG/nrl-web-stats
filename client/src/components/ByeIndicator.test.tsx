import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { ByeIndicator } from './ByeIndicator';

describe('ByeIndicator', () => {
  it('renders a disabled button', () => {
    render(<ByeIndicator />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('renders the EventBusyIcon SVG', () => {
    const { container } = render(<ByeIndicator />);
    expect(container.querySelector('[data-testid="EventBusyIcon"]')).toBeInTheDocument();
  });

  it('renders only one interactive element', () => {
    render(<ByeIndicator />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
