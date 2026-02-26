import { createTheme } from '@mui/material/styles';

export const nrlTheme = createTheme({
  palette: {
    primary: {
      main: '#041E42', // NRL Navy
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#FFFFFF',
      contrastText: '#041E42',
    },
    success: {
      main: '#4CAF50', // Easy fixtures (green)
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#FFC107', // Medium fixtures (yellow)
      contrastText: '#000000',
    },
    error: {
      main: '#F44336', // Hard fixtures (red)
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#041E42',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      color: '#041E42',
    },
    h5: {
      fontWeight: 600,
      color: '#041E42',
    },
    h6: {
      fontWeight: 600,
      color: '#041E42',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#041E42',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          textTransform: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
});
