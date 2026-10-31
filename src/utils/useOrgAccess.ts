import { useMemo } from 'react';
import { usePermissions } from 'react-admin';
import { useCurrentOrg } from '../orgContext';
import type { Permissions } from '../providers/authProvider';
import { computeOrgAccess, type OrgAccess } from '../access';
import { useIsReadOnly } from '../subscription/SubscriptionContext';

// Эффективные права в выбранной организации (access_profiles, admin.md «Модель прав»):
// isFull — super_admin/owner/admin; can(section, level) — по my_permissions профиля.
// Без выбранной организации всё false.
export const useOrgAccess = (): OrgAccess => {
  const { permissions } = usePermissions<Permissions>();
  const { org } = useCurrentOrg();
  const orgId = org?.id ?? null;
  return useMemo(() => computeOrgAccess(permissions, orgId), [permissions, orgId]);
};

// «Только чтение» для мутаций раздела: read-only подписки (как раньше) ИЛИ нет права
// «управление» на раздел. Заменяет useIsReadOnly() в экранах, которые теперь открываются
// и обладателям профиля с уровнем «просмотр» — их пишущие кнопки прячутся тем же путём.
export const useSectionReadOnly = (section: string): boolean => {
  const isReadOnly = useIsReadOnly();
  const { can } = useOrgAccess();
  return isReadOnly || !can(section, 'manage');
};
