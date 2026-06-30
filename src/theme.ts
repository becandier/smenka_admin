import type { RaThemeOptions } from 'react-admin';
import { brand, fontFamilySans } from './brand';

// Бренд Smenka. react-admin сам прогоняет options через MUI createTheme.
// Канон значений — docs/tasks/rebranding/brand_contract.md.
export const theme: RaThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: brand.blue, dark: brand.blueDeep, contrastText: brand.paper },
    secondary: { main: brand.blueMid },
    text: { primary: brand.ink, secondary: brand.muted },
    divider: brand.line,
    background: { default: brand.wash, paper: brand.paper },
    // error/warning/success/info — функциональные, оставляем дефолтные MUI.
  },
  shape: { borderRadius: 12 }, // control
  typography: {
    fontFamily: fontFamilySans,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: { fontWeight: 600, fontSize: '2.5rem', letterSpacing: '-0.03em' }, // display 40
    h2: { fontWeight: 600, fontSize: '1.625rem', letterSpacing: '-0.02em' }, // heading 26
    body1: { fontSize: '1.0625rem' }, // body 17
    button: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        // pressed = primary.dark (Deep Blue)
        containedPrimary: { '&:active': { backgroundColor: brand.blueDeep } },
      },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: 16 } }, // card radius
    },
  },
};
