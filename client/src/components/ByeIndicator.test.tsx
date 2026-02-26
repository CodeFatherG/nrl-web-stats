import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { ByeIndicator } from './ByeIndicator';

describe('ByeIndicator', () => {
  it('should display "BYE" label', () => {
    render(<ByeIndicator />);
    expect(screen.getByText('BYE')).toBeInTheDocument();
  });

  it('should render event busy icon', () => {
    const { container } = render(<ByeIndicator />);
    expect(container.querySelector('[data-testid="EventBusyIcon"]')).toBeInTheDocument();
  });

  it('should render as a chip', () => {
    render(<ByeIndicator />);
    const chip = screen.getByText('BYE').closest('.MuiChip-root');
    expect(chip).toBeInTheDocument();
  });
});
