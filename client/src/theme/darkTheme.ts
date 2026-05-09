import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4A7FD4' },
    secondary: { main: '#E8A020' },
    success: { main: '#66BB6A' },
    warning: { main: '#FFB74D' },
    error: { main: '#EF5350' },
    background: { default: '#0D1117', paper: '#161B22' },
    text: { primary: '#E6EDF3', secondary: '#8B949E' },
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
        root: { backgroundColor: '#161B22' },
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
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});
