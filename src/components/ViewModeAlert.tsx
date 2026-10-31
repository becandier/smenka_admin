import { Alert } from '@mui/material';
import { useOrgAccess } from '../utils/useOrgAccess';

// Плашка на edit-формах, открытых с уровнем «просмотр» (access_profiles): кнопок сохранения
// нет — без пояснения редактируемые поля выглядели бы поломкой. Read-only подписки сюда не
// относится — для неё свой баннер.
export const ViewModeAlert = ({ section }: { section: string }) => {
  const { can } = useOrgAccess();
  if (can(section, 'manage')) return null;
  return (
    <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
      Режим просмотра: изменения недоступны
    </Alert>
  );
};
