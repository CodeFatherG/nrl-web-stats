import { createTheme } from '@mui/material/styles';

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#041E42' },
    secondary: { main: '#E8A020' },
    success: { main: '#4CAF50' },
    warning: { main: '#FFC107' },
    error: { main: '#F44336' },
    background: { default: '#F4F6F9', paper: '#FFFFFF' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: '#041E42' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});
