import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../test/utils';
import { VenueBadge } from './VenueBadge';

describe('VenueBadge', () => {
  describe('home venue', () => {
    it('should display "Home" label when isHome is true', () => {
      render(<VenueBadge isHome={true} />);
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('should render home icon when isHome is true', () => {
      const { container } = render(<VenueBadge isHome={true} />);
      // MUI Home icon has a data-testid
      expect(container.querySelector('[data-testid="HomeIcon"]')).toBeInTheDocument();
    });
  });

  describe('away venue', () => {
    it('should display "Away" label when isHome is false', () => {
      render(<VenueBadge isHome={false} />);
      expect(screen.getByText('Away')).toBeInTheDocument();
    });

    it('should render flight icon when isHome is false', () => {
      const { container } = render(<VenueBadge isHome={false} />);
      expect(container.querySelector('[data-testid="FlightIcon"]')).toBeInTheDocument();
    });
  });
});
