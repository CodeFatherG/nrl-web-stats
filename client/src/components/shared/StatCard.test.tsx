import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../test/utils';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders label and value text', () => {
    render(<StatCard label="SC Average" value="84.5" />);
    expect(screen.getByText('SC Average')).toBeInTheDocument();
    expect(screen.getByText('84.5')).toBeInTheDocument();
  });

  it('renders numeric value', () => {
    render(<StatCard label="Games" value={22} />);
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('renders subValue below the main value when provided', () => {
    render(<StatCard label="Price" value="$850k" subValue="+$50k this week" />);
    expect(screen.getByText('+$50k this week')).toBeInTheDocument();
  });

  it('does not render subValue element when omitted', () => {
    render(<StatCard label="Price" value="$850k" />);
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
  });

  it('renders a trend up icon when trend="up"', () => {
    render(<StatCard label="Trend" value="100" trend="up" />);
    // TrendingUpIcon renders as an SVG; check at least one SVG is present
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders a trend down icon when trend="down"', () => {
    render(<StatCard label="Trend" value="100" trend="down" />);
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders a neutral trend icon when trend="neutral"', () => {
    render(<StatCard label="Trend" value="100" trend="neutral" />);
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders no additional SVG when trend is not provided', () => {
    const { container: withTrend } = render(<StatCard label="A" value="1" trend="up" />);
    const countWith = withTrend.querySelectorAll('svg').length;
    // re-render without trend
    const { container: noTrend } = render(<StatCard label="A" value="1" />);
    const countWithout = noTrend.querySelectorAll('svg').length;
    expect(countWith).toBeGreaterThan(countWithout);
  });

  it('renders the icon prop content when provided', () => {
    render(<StatCard label="Info" value="42" icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders without crashing when no optional props are provided', () => {
    expect(() => render(<StatCard label="Min" value="0" />)).not.toThrow();
  });
});
