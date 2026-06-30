import { AppBar, Layout as RaLayout, Menu, TitlePortal, usePermissions } from 'react-admin';
import { Box, Divider, ListSubheader } from '@mui/material';
import type { ReactNode } from 'react';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import PlaceIcon from '@mui/icons-material/Place';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SettingsIcon from '@mui/icons-material/Settings';
import BarChartIcon from '@mui/icons-material/BarChart';
import CurrencyRubleIcon from '@mui/icons-material/CurrencyRuble';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { OrgSwitcher } from '../components/OrgSwitcher';
import { useCurrentOrg } from '../orgContext';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import type { Permissions } from '../providers/authProvider';

// AppBar — фирменный синий (primary). Лок-ап слева у TitlePortal; на синем фоне —
// версия -inverse (белая). Бренд-цвета берём из темы, не хардкодом.
const MyAppBar = () => (
  <AppBar color="primary">
    <Box
      component="img"
      src="/smenka-lockup-inverse.svg"
      alt="Smenka"
      sx={{ height: 26, mr: 2, display: 'block' }}
    />
    <TitlePortal />
    <OrgSwitcher />
  </AppBar>
);

// Подзаголовок группы меню. Рендерится только когда в группе есть хотя бы один
// доступный по RBAC пункт (вызывающий код решает, монтировать ли группу целиком).
const groupSx = {
  bgcolor: 'transparent',
  color: 'text.secondary',
  lineHeight: '36px',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
} as const;

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

  // Видимость групп. Пустая группа не монтируется целиком (вместе с подзаголовком
  // и разделителем) — критерий приёмки №3 admin_menu_grouping.
  const showPlatform = isSuper;
  const showOps = orgOpen;
  const showOrg = orgOpen;

  return (
    <Menu>
      {/* 1. Платформа — только super_admin */}
      {showPlatform && (
        <>
          <ListSubheader disableSticky sx={groupSx}>
            Платформа
          </ListSubheader>
          <Menu.DashboardItem />
          <Menu.Item to="/users" primaryText="Пользователи" leftIcon={<PeopleIcon />} />
          <Menu.Item to="/organizations" primaryText="Организации" leftIcon={<BusinessIcon />} />
        </>
      )}

      {/* 2. Операционка — ежедневные инструменты org-кабинета */}
      {showOps && (
        <>
          {showPlatform && <Divider sx={{ my: 1 }} />}
          <ListSubheader disableSticky sx={groupSx}>
            Операционка
          </ListSubheader>
          <Menu.Item to="/org-shifts" primaryText="Смены" leftIcon={<AccessTimeIcon />} />
          <Menu.Item to="/members" primaryText="Сотрудники" leftIcon={<GroupIcon />} />
          <Menu.Item
            to="/checklist-templates"
            primaryText="Чек-листы"
            leftIcon={<ChecklistIcon />}
          />
          <Menu.Item to="/org-stats" primaryText="Статистика" leftIcon={<BarChartIcon />} />
          {/* База знаний — owner/admin своей org + super_admin (сквозной доступ);
              видимость совпадает с гейтингом showOps (org выбрана и роль управляющая). */}
          <Menu.Item to="/knowledge" primaryText="База знаний" leftIcon={<MenuBookIcon />} />
          {/* Зарплата и Шаблоны штрафов — только для owner/admin (super_admin не ведёт
              штрафы/зарплату конкретной организации). */}
          {isOrgManager && (
            <Menu.Item to="/payroll" primaryText="Зарплата" leftIcon={<CurrencyRubleIcon />} />
          )}
          {isOrgManager && (
            <Menu.Item
              to="/penalty-templates"
              primaryText="Шаблоны штрафов"
              leftIcon={<MoneyOffIcon />}
            />
          )}
        </>
      )}

      {/* 3. Организация — настройка, трогают редко. Инвайт-код и Аудит нет в таблицах
          ТЗ admin_menu_grouping, но их нельзя убирать («набор ресурсов не меняется»),
          поэтому они здесь, среди редких конфиг/надзорных пунктов. */}
      {showOrg && (
        <>
          {(showPlatform || showOps) && <Divider sx={{ my: 1 }} />}
          <ListSubheader disableSticky sx={groupSx}>
            Организация
          </ListSubheader>
          <Menu.Item to="/work-locations" primaryText="Точки" leftIcon={<PlaceIcon />} />
          <Menu.Item to="/roles" primaryText="Роли" leftIcon={<BadgeIcon />} />
          <Menu.Item to="/invite-code" primaryText="Инвайт-код" leftIcon={<VpnKeyIcon />} />
          <Menu.Item to="/settings" primaryText="Настройки" leftIcon={<SettingsIcon />} />
          <Menu.Item to="/audit-logs" primaryText="Аудит" leftIcon={<HistoryIcon />} />
        </>
      )}
    </Menu>
  );
};

export const Layout = ({ children }: { children: ReactNode }) => (
  <RaLayout appBar={MyAppBar} menu={MyMenu}>
    {children}
  </RaLayout>
);
