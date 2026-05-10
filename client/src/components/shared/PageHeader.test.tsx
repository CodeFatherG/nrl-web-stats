import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../test/utils';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders title as an h5 heading', () => {
    render(<PageHeader title="Round Overview" />);
    expect(screen.getByRole('heading', { level: 5, name: 'Round Overview' })).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<PageHeader title="Players" subtitle="2025 Season" />);
    expect(screen.getByText('2025 Season')).toBeInTheDocument();
  });

  it('does not render subtitle element when omitted', () => {
    render(<PageHeader title="Players" />);
    expect(screen.queryByText('2025 Season')).not.toBeInTheDocument();
  });

  it('renders the actions slot when provided', () => {
    render(<PageHeader title="Rounds" actions={<button>Export</button>} />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('does not render an actions container when actions are omitted', () => {
    render(<PageHeader title="Rounds" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
