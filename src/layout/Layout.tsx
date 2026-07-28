import {
  AppBar,
  Layout as RaLayout,
  Menu,
  TitlePortal,
  usePermissions,
  useGetList,
  useSidebarState,
} from 'react-admin';
import {
  Badge,
  Box,
  Collapse,
  Divider,
  List,
  ListItemIcon,
  ListSubheader,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import PlaceIcon from '@mui/icons-material/Place';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SettingsIcon from '@mui/icons-material/Settings';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BarChartIcon from '@mui/icons-material/BarChart';
import CurrencyRubleIcon from '@mui/icons-material/CurrencyRuble';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import QuizIcon from '@mui/icons-material/Quiz';
import PollIcon from '@mui/icons-material/Poll';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { OrgSwitcher } from '../components/OrgSwitcher';
import { OAUTH_LOGIN_ENABLED } from '../config';
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

// Подзаголовок секции меню. Рендерится только когда сайдбар развёрнут (иначе
// длинные названия «Организация»/«Операционка» обрезаются в узкой icon-колонке —
// в icon-режиме секция обозначена только сгруппированными иконками ниже) и когда
// в ней есть хотя бы один доступный по RBAC пункт (вызывающий код решает, монтировать
// ли секцию целиком).
const groupSx = {
  bgcolor: 'transparent',
  color: 'text.secondary',
  lineHeight: '36px',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
} as const;

// Заголовок сворачиваемой подгруппы: иконка + название + шеврон. В icon-режиме
// сайдбара текст и шеврон скрываются, остаётся только иконка с Tooltip (как у
// обычных Menu.Item — react-admin's MenuItemLink делает то же самое сама).
// `sidebarOpen` приходит пропом от MyMenu, а не из отдельного useSidebarState() —
// значение уже read один раз в родителе, второй подписки на стор не нужно.
const subMenuHeaderSx = {
  color: 'text.secondary',
} as const;

// Иконка группы не dense — совпадает по ширине с иконками вложенных Menu.Item
// (те тоже без dense) и с иконками одиночных пунктов меню верхнего уровня.
const subMenuIconSx = {
  minWidth: (theme: { spacing: (n: number) => string }) => theme.spacing(5),
} as const;

type SubMenuProps = {
  name: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  children: ReactNode;
};

const SubMenu = ({ name, icon, open, onToggle, sidebarOpen, children }: SubMenuProps) => {
  const header = (
    <MenuItem onClick={onToggle} sx={subMenuHeaderSx}>
      <ListItemIcon sx={subMenuIconSx}>{icon}</ListItemIcon>
      {sidebarOpen && (
        <>
          <Typography variant="inherit" noWrap sx={{ flexGrow: 1 }}>
            {name}
          </Typography>
          {open ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </>
      )}
    </MenuItem>
  );

  return (
    <>
      {/* Пустой title у MUI Tooltip отключает подсказку (см. Tooltip.js: `!title` →
          возвращает children без обёртки) — разворачивать header дважды не нужно. */}
      <Tooltip title={sidebarOpen ? '' : name} placement="right">
        {header}
      </Tooltip>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding sx={{ pl: sidebarOpen ? 1 : 0 }}>
          {children}
        </List>
      </Collapse>
    </>
  );
};

// Свёрнута по умолчанию; автораскрывается, если текущий маршрут принадлежит
// одному из путей группы (заход/перезагрузка на странице внутри группы). После
// авто-раскрытия пользователь может свернуть группу обратно вручную — эффект
// только открывает, никогда не закрывает через RBAC/навигацию. matchPath (react-router)
// вместо ручного startsWith — тот же механизм, что использует MenuItemLink (useMatch)
// для подсветки активного пункта, корректно учитывает границы сегментов пути.
const useGroupOpen = (paths: string[]) => {
  const { pathname } = useLocation();
  const isActive = paths.some((p) => matchPath({ path: p, end: false }, pathname) !== null);
  const [open, setOpen] = useState(isActive);
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);
  return [open, setOpen] as const;
};

// Пункт меню «Переработки» с бейджем непросмотренных заявок (status=pending, admin.md).
// perPage:1 — нужен только total; сам список грузит отдельный экран OvertimeRequestList.
const OvertimeMenuItem = () => {
  const { total } = useGetList('overtime-requests', {
    pagination: { page: 1, perPage: 1 },
    filter: { status: 'pending' },
  });
  const icon =
    total && total > 0 ? (
      <Badge badgeContent={total} color="warning" max={99}>
        <MoreTimeIcon />
      </Badge>
    ) : (
      <MoreTimeIcon />
    );
  return <Menu.Item to="/overtime-requests" primaryText="Переработки" leftIcon={icon} />;
};

const MyMenu = () => {
  const { permissions } = usePermissions<Permissions>();
  const { org } = useCurrentOrg();
  const [sidebarOpen] = useSidebarState();
  const isSuper = permissions?.role === 'super_admin';
  // org-меню показываем, только если в текущей орг роль owner/admin (super_admin — сквозной доступ).
  const myRole = useMyOrgRole();
  const canManage = isSuper || myRole === 'owner' || myRole === 'admin';
  const orgOpen = Boolean(org) && canManage;
  // Зарплата — только фактическим owner/admin организации; super_admin сквозным
  // доступом её не видит (не его рабочий инструмент, ТЗ payroll).
  const isOrgManager = myRole === 'owner' || myRole === 'admin';

  // Видимость секций. Пустая секция не монтируется целиком (вместе с подзаголовком
  // и разделителем) — критерий приёмки №3 admin_menu_grouping.
  const showPlatform = isSuper;
  const showOps = orgOpen;
  const showOrg = orgOpen;

  // Состояние сворачиваемых подгрупп «Операционки». Хуки вызываются безусловно
  // (правило хуков) — видимость самих групп по RBAC решается уже в JSX ниже.
  const [shiftsOpen, setShiftsOpen] = useGroupOpen([
    '/org-shifts',
    '/overtime-requests',
    '/work-schedules',
  ]);
  const [staffOpen, setStaffOpen] = useGroupOpen(['/members', '/roles']);
  const [checklistsOpen, setChecklistsOpen] = useGroupOpen([
    '/checklist-instances',
    '/checklist-templates',
  ]);
  const [testsOpen, setTestsOpen] = useGroupOpen(['/test-templates', '/test-assignments']);
  const [financeOpen, setFinanceOpen] = useGroupOpen(['/payroll', '/penalty-templates']);

  return (
    <Menu>
      {/* 1. Платформа — только super_admin */}
      {showPlatform && (
        <>
          {sidebarOpen && (
            <ListSubheader disableSticky sx={groupSx}>
              Платформа
            </ListSubheader>
          )}
          <Menu.DashboardItem />
          <Menu.Item to="/users" primaryText="Пользователи" leftIcon={<PeopleIcon />} />
          <Menu.Item to="/organizations" primaryText="Организации" leftIcon={<BusinessIcon />} />
          {/* Настройки платформы — первый экран будущего раздела платформенных интеграций
              (сейчас только «Провайдеры входа», oauth_login). Скрыт за OAUTH_LOGIN_ENABLED:
              пока OAuth-вход выключен, раздел провайдеров входа в меню не показываем. */}
          {OAUTH_LOGIN_ENABLED && (
            <Menu.Item
              to="/platform-settings"
              primaryText="Настройки платформы"
              leftIcon={<AdminPanelSettingsIcon />}
            />
          )}
        </>
      )}

      {/* 2. Операционка — ежедневные инструменты org-кабинета, сгруппированы в
          сворачиваемые подсписки (SubMenu), чтобы не перегружать плоский список. */}
      {showOps && (
        <>
          {showPlatform && <Divider sx={{ my: 1 }} />}
          {sidebarOpen && (
            <ListSubheader disableSticky sx={groupSx}>
              Операционка
            </ListSubheader>
          )}

          {/* Смены: сама смена, переработки (только owner/admin), графики работы. */}
          <SubMenu
            name="Смены"
            icon={<AccessTimeIcon />}
            open={shiftsOpen}
            onToggle={() => setShiftsOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
          >
            <Menu.Item to="/org-shifts" primaryText="Смены" leftIcon={<AccessTimeIcon />} />
            {isOrgManager && <OvertimeMenuItem />}
            <Menu.Item to="/work-schedules" primaryText="Графики работы" leftIcon={<ScheduleIcon />} />
          </SubMenu>

          {/* Персонал: сотрудники и роли (роли — перенос из секции «Организация»). */}
          <SubMenu
            name="Персонал"
            icon={<GroupIcon />}
            open={staffOpen}
            onToggle={() => setStaffOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
          >
            <Menu.Item to="/members" primaryText="Сотрудники" leftIcon={<GroupIcon />} />
            <Menu.Item to="/roles" primaryText="Роли" leftIcon={<BadgeIcon />} />
          </SubMenu>

          {/* Чек-листы: реестр экземпляров (checklist_reports) и шаблоны. */}
          <SubMenu
            name="Чек-листы"
            icon={<FactCheckIcon />}
            open={checklistsOpen}
            onToggle={() => setChecklistsOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
          >
            <Menu.Item
              to="/checklist-instances"
              primaryText="Чек-листы"
              leftIcon={<FactCheckIcon />}
            />
            <Menu.Item
              to="/checklist-templates"
              primaryText="Шаблоны чек-листов"
              leftIcon={<ChecklistIcon />}
            />
          </SubMenu>

          {/* Тесты (employee_tests) — только owner/admin, как зарплата и штрафы
              (не платформенная фича, super_admin сквозным доступом не видит). */}
          {isOrgManager && (
            <SubMenu
              name="Тесты"
              icon={<QuizIcon />}
              open={testsOpen}
              onToggle={() => setTestsOpen((o) => !o)}
              sidebarOpen={sidebarOpen}
            >
              <Menu.Item to="/test-templates" primaryText="Тесты" leftIcon={<QuizIcon />} />
              <Menu.Item
                to="/test-assignments"
                primaryText="Результаты тестов"
                leftIcon={<PollIcon />}
              />
            </SubMenu>
          )}

          {/* Финансы — только owner/admin (super_admin не ведёт штрафы/зарплату
              конкретной организации). */}
          {isOrgManager && (
            <SubMenu
              name="Финансы"
              icon={<CurrencyRubleIcon />}
              open={financeOpen}
              onToggle={() => setFinanceOpen((o) => !o)}
              sidebarOpen={sidebarOpen}
            >
              <Menu.Item to="/payroll" primaryText="Зарплата" leftIcon={<CurrencyRubleIcon />} />
              <Menu.Item
                to="/penalty-templates"
                primaryText="Шаблоны штрафов"
                leftIcon={<MoneyOffIcon />}
              />
            </SubMenu>
          )}

          <Menu.Item to="/org-stats" primaryText="Статистика" leftIcon={<BarChartIcon />} />
          {/* База знаний — owner/admin своей org + super_admin (сквозной доступ);
              видимость совпадает с гейтингом showOps (org выбрана и роль управляющая). */}
          <Menu.Item to="/knowledge" primaryText="База знаний" leftIcon={<MenuBookIcon />} />
        </>
      )}

      {/* 3. Организация — настройка, трогают редко. Инвайт-код и Аудит нет в таблицах
          ТЗ admin_menu_grouping, но их нельзя убирать («набор ресурсов не меняется»),
          поэтому они здесь, среди редких конфиг/надзорных пунктов. «Роли» перенесены
          в группу «Персонал» секции «Операционка». */}
      {showOrg && (
        <>
          {(showPlatform || showOps) && <Divider sx={{ my: 1 }} />}
          {sidebarOpen && (
            <ListSubheader disableSticky sx={groupSx}>
              Организация
            </ListSubheader>
          )}
          <Menu.Item to="/work-locations" primaryText="Точки" leftIcon={<PlaceIcon />} />
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
