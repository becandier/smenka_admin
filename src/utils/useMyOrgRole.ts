import { usePermissions } from 'react-admin';
import { useCurrentOrg } from '../orgContext';
import type { Permissions } from '../providers/authProvider';

// Фактическая роль текущего пользователя в выбранной организации (owner/admin/...).
// super_admin без членства → null: payroll и правка ставок гейтятся по org-роли,
// а не по сквозному платформенному доступу (ТЗ payroll, RBAC).
export const useMyOrgRole = (): string | null => {
  const { permissions } = usePermissions<Permissions>();
  const { org } = useCurrentOrg();
  if (!org) return null;
  return permissions?.organizations?.find((o) => o.id === org.id)?.my_role ?? null;
};
