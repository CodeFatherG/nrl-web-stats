import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { nrlTheme } from '../theme/nrlTheme';

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={nrlTheme}>{children}</ThemeProvider>;
}

export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from '@testing-library/react';
export { renderWithTheme as render };
