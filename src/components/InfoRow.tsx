import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

// Строка «подпись: значение» в карточках детали (смена, план, старт без геопроверки).
// Общий компонент: карточки живут в разных модулях, а выглядеть должны одинаково.
export const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ minWidth: 160 }} color="text.secondary">
      {label}
    </Typography>
    <Typography>{children}</Typography>
  </Box>
);
