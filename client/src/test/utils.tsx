import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../theme/lightTheme';

function AllTheProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from '@testing-library/react';
export { renderWithTheme as render };
