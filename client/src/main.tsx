import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { nrlTheme } from './theme/nrlTheme';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={nrlTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
