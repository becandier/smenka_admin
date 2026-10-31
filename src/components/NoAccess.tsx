import type { ReactNode } from 'react';
import { Title } from 'react-admin';
import { Box, Typography } from '@mui/material';

// Единый экран «нет доступа» (access_profiles/admin.md, «Маршруты»): прямой переход по URL
// без права показывает один и тот же текст во всех разделах. `text` — для особых случаев
// (read-only подписки и т.п.), по умолчанию — «Нет доступа к разделу «{label}»…».
export const NoAccess = ({ label, text }: { label?: string; text?: ReactNode }) => (
  <Box sx={{ p: 3 }}>
    {label && <Title title={label} />}
    <Typography color="text.secondary">
      {text ??
        (label
          ? `Нет доступа к разделу «${label}». Обратитесь к администратору организации.`
          : 'Нет доступа к разделу. Обратитесь к администратору организации.')}
    </Typography>
  </Box>
);
