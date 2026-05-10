import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../test/utils';
import { SectionCard } from './SectionCard';

describe('SectionCard', () => {
  it('renders children content', () => {
    render(<SectionCard><p>Child content</p></SectionCard>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders the title when provided', () => {
    render(<SectionCard title="Section Title"><p>body</p></SectionCard>);
    expect(screen.getByText('Section Title')).toBeInTheDocument();
  });

  it('renders the subtitle below the title when provided', () => {
    render(<SectionCard title="Title" subtitle="Subtitle text"><p>body</p></SectionCard>);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    render(<SectionCard title="Title"><p>body</p></SectionCard>);
    expect(screen.queryByText('Subtitle text')).not.toBeInTheDocument();
  });

  it('renders actions slot when provided', () => {
    render(
      <SectionCard title="Title" actions={<button>Action</button>}>
        <p>body</p>
      </SectionCard>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('does not render header or divider when no title and no actions are provided', () => {
    render(<SectionCard><p>Just content</p></SectionCard>);
    // No title element rendered — the subtitle1 Typography only appears with a title
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.getByText('Just content')).toBeInTheDocument();
  });

  it('renders actions without a title (header still renders)', () => {
    render(<SectionCard actions={<button>Act</button>}><p>body</p></SectionCard>);
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
  });
});
