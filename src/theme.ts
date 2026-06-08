import type { RaThemeOptions } from 'react-admin';

// Бренд Smenka. react-admin сам прогоняет options через MUI createTheme.
export const theme: RaThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: '#4A90D9' },
  },
  shape: { borderRadius: 12 },
};
