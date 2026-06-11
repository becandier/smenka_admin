import { AppBar, Layout as RaLayout, Menu, TitlePortal, usePermissions } from 'react-admin';
import { Divider } from '@mui/material';
import type { ReactNode } from 'react';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import PlaceIcon from '@mui/icons-material/Place';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import BarChartIcon from '@mui/icons-material/BarChart';
import CurrencyRubleIcon from '@mui/icons-material/CurrencyRuble';
import { OrgSwitcher } from '../components/OrgSwitcher';
import { useCurrentOrg } from '../orgContext';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import type { Permissions } from '../providers/authProvider';

const MyAppBar = () => (
  <AppBar>
    <TitlePortal />
    <OrgSwitcher />
  </AppBar>
);

const MyMenu = () => {
  const { permissions } = usePermissions<Permissions>();
  const { org } = useCurrentOrg();
  const isSuper = permissions?.role === 'super_admin';
  // org-меню показываем, только если в текущей орг роль owner/admin (super_admin — сквозной доступ).
  const myRole = useMyOrgRole();
  const canManage = isSuper || myRole === 'owner' || myRole === 'admin';
  const orgOpen = Boolean(org) && canManage;
  // Зарплата — только фактическим owner/admin организации; super_admin сквозным
  // доступом её не видит (не его рабочий инструмент, ТЗ payroll).
  const isOrgManager = myRole === 'owner' || myRole === 'admin';

  return (
    <Menu>
      {isSuper && <Menu.DashboardItem />}
      {isSuper && <Menu.Item to="/users" primaryText="Пользователи" leftIcon={<PeopleIcon />} />}
      {isSuper && (
        <Menu.Item to="/organizations" primaryText="Организации" leftIcon={<BusinessIcon />} />
      )}

      {orgOpen && <Divider sx={{ my: 1 }} />}
      {orgOpen && <Menu.Item to="/members" primaryText="Сотрудники" leftIcon={<GroupIcon />} />}
      {orgOpen && <Menu.Item to="/roles" primaryText="Роли" leftIcon={<BadgeIcon />} />}
      {orgOpen && <Menu.Item to="/work-locations" primaryText="Точки" leftIcon={<PlaceIcon />} />}
      {orgOpen && (
        <Menu.Item to="/checklist-templates" primaryText="Чек-листы" leftIcon={<ChecklistIcon />} />
      )}
      {orgOpen && <Menu.Item to="/org-shifts" primaryText="Смены" leftIcon={<AccessTimeIcon />} />}
      {/* Аудит — под orgOpen (включая super_admin со сквозным доступом): admin.md §RBAC
          даёт super_admin ленту в org-контексте. Это read-only ресурс как «Смены»/
          «Статистика», в отличие от «Зарплаты», которую super_admin намеренно не видит. */}
      {orgOpen && <Menu.Item to="/audit-logs" primaryText="Аудит" leftIcon={<HistoryIcon />} />}
      {orgOpen && <Menu.Item to="/settings" primaryText="Настройки" leftIcon={<SettingsIcon />} />}
      {orgOpen && (
        <Menu.Item to="/org-stats" primaryText="Статистика" leftIcon={<BarChartIcon />} />
      )}
      {orgOpen && isOrgManager && (
        <Menu.Item to="/payroll" primaryText="Зарплата" leftIcon={<CurrencyRubleIcon />} />
      )}
    </Menu>
  );
};

export const Layout = ({ children }: { children: ReactNode }) => (
  <RaLayout appBar={MyAppBar} menu={MyMenu}>
    {children}
  </RaLayout>
);
