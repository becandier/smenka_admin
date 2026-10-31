import type { ReactNode } from 'react';
import { usePermissions } from 'react-admin';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useCurrentOrg } from '../orgContext';
import { useOrgAccess } from '../utils/useOrgAccess';
import { SUPER_ONLY_TARGETS, canAccessTarget, targetLabel, type AccessLevel } from '../access';
import { NoAccess } from './NoAccess';

// Обёртка маршрута org-кабинета (access_profiles/admin.md, «Маршруты»): пускает внутрь только
// при праве на раздел цели (`target` — ресурс react-admin или путь custom-route из карты
// src/access.ts), иначе — единый экран NoAccess. Без выбранной организации — подсказка
// выбрать её. Тот же расчёт, что у меню и authProvider.canAccess.
export const RequireAccess = ({
  target,
  level = 'view',
  children,
}: {
  target: string;
  level?: AccessLevel;
  children: ReactNode;
}) => {
  const { isPending } = usePermissions();
  const { org } = useCurrentOrg();
  const access = useOrgAccess();

  if (isPending) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!org && !SUPER_ONLY_TARGETS.has(target)) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Выберите организацию в переключателе сверху, чтобы открыть раздел.
        </Typography>
      </Box>
    );
  }
  if (!canAccessTarget(access, target, level)) {
    return <NoAccess label={targetLabel(target)} />;
  }
  return <>{children}</>;
};
