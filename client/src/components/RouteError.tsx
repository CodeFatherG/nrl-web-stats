import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material';

interface RouteErrorProps {
  message: string;
  validOptions?: string[];
}

export function RouteError({ message, validOptions }: RouteErrorProps) {
  const handleGoHome = () => {
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Alert severity="warning">
        <AlertTitle>Navigation Error</AlertTitle>
        <Typography>{message}</Typography>
        {validOptions && validOptions.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Valid options: {validOptions.join(', ')}
          </Typography>
        )}
      </Alert>
      <Button
        variant="outlined"
        sx={{ mt: 2 }}
        onClick={handleGoHome}
      >
        Go to Season Overview
      </Button>
    </Box>
  );
}
