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
import type { Theme } from '@mui/material/styles';
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
import PaidIcon from '@mui/icons-material/Paid';
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
  // Небольшой отступ сверху — секция физически отделена от группы уровня 2 даже
  // после того, как заголовок группы (subMenuHeaderSx) стал жирным и тёмным:
  // без него уровень 1 и уровень 2 визуально сближаются, admin_menu_hierarchy критерий №4.
  mt: 0.5,
} as const;

// Заголовок сворачиваемой подгруппы (уровень 2): иконка + название + шеврон.
// admin_menu_hierarchy п.1 — группа должна доминировать над вложенным пунктом:
// текст темнее (text.primary вместо приглушённого text.secondary у детей) и
// заметно жирнее (fontWeightBold из темы, а не дефолтный вес MenuItemLink).
// Свёрнутая группа, внутри которой открыта текущая страница (`active`, ТЗ п.3),
// дополнительно акцентируется бренд-цветом — иначе после ручного сворачивания
// пользователь теряет ориентир, в какой группе он находится. Оформлено как
// функция теми (а не статический объект + spread) — так и `theme.palette`/
// `theme.typography` типизируются полноценным `Theme`, без ручных мини-типов.
// В icon-режиме сайдбара текст и шеврон скрываются, остаётся только иконка с
// Tooltip (как у обычных Menu.Item — react-admin's MenuItemLink делает то же
// самое сама). `sidebarOpen` приходит пропом от MyMenu, а не из отдельного
// useSidebarState() — значение уже read один раз в родителе, второй подписки
// на стор не нужно.
const subMenuHeaderSx = (theme: Theme, active: boolean) => ({
  color: active ? theme.palette.primary.main : theme.palette.text.primary,
  fontWeight: theme.typography.fontWeightBold,
});

// Иконка группы не dense — совпадает по ширине с иконками вложенных Menu.Item
// (те тоже без dense) и с иконками одиночных пунктов меню верхнего уровня.
// Иконку саму по себе (размер/положение) не трогаем — она и так основной
// визуальный якорь уровня (ТЗ п.1), кроме цвета при активной свёрнутой группе.
const subMenuIconSx = (theme: Theme, active: boolean) => ({
  minWidth: theme.spacing(5),
  ...(active && { color: theme.palette.primary.main }),
});

// Контейнер вложенных пунктов (уровень 3, ТЗ п.2): подчинён группе —
// - отступ слева заметно больше, чем в v2 (pl 1 → 1.5, плюс ml до рельсы), текст
//   ребёнка стартует правее текста группы;
// - вертикальная линия-рельса (border) слева визуально привязывает детей к своей
//   группе и отделяет от соседних — цвет берём из палитры темы (`divider`),
//   не хардкодим.
// Уменьшение/приглушение самих иконок детей живёт отдельно, в childItemIconSx
// ниже — не здесь: это стиль конкретного Menu.Item, а не контейнера-списка.
const childListSx = (theme: Theme, sidebarOpen: boolean) => ({
  pl: sidebarOpen ? 1.5 : 0,
  ...(sidebarOpen && {
    ml: 2.5,
    borderLeft: `2px solid ${theme.palette.divider}`,
  }),
});

// Иконка вложенного пункта (уровень 3, ТЗ п.2): НЕ убрана совсем (вариант из ТЗ
// «убрать»), а уменьшена и приглушена (второй вариант, явно разрешённый ТЗ п.2
// и п.6) — полное удаление иконки оставило бы пункт пустым в icon-режиме
// сайдбара (там остаётся только иконка + Tooltip, текста нет вовсе, см.
// MenuItemLink), уменьшенная иконка продолжает работать как есть в обоих
// режимах без спецкейсов. Тот же приём покрывает и бейдж «Переработок»: он
// висит на иконке (Badge > MoreTimeIcon), иконка не удаляется — счётчик
// остаётся на месте и виден.
// Стиль вешается через `sx` прямо на каждый <Menu.Item> (а не CSS-селектором
// с родителя-контейнера): MenuItemLink пробрасывает `sx` из пропов напрямую в
// свой собственный `styled(MenuItem)` (`...rest`, MenuItemLink.tsx) — MUI
// сливает входящий `sx` поверх стилей styled-компонента в одну генерацию
// класса, это штатная документированная точка расширения самого MenuItemLink
// («Additional props are passed down to the underlying MUI <MenuItem>»).
// Таргетинг того же класса `RaMenuItemLink-icon` через sx родителя-List (первая
// версия этого фикса) конкурировал бы за специфичность с собственным правилом
// react-admin на тот же класс — победитель решался бы порядком вставки CSS-правил
// в emotion, а не гарантированным оверрайдом (code-review admin_menu_hierarchy).
// Класс не импортирован (react-admin не экспортирует MenuItemLinkClasses из
// публичного барреля 'react-admin'/'ra-ui-materialui') — строка используется как
// публично документированный стабильный слот-класс компонента.
const childItemIconSx = {
  '& .RaMenuItemLink-icon': {
    minWidth: '32px',
    opacity: 0.65,
  },
  '& .RaMenuItemLink-icon .MuiSvgIcon-root': {
    fontSize: '1.05rem',
  },
} as const;

type SubMenuProps = {
  name: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  // Текущий маршрут принадлежит одному из путей группы (см. useGroupOpen) —
  // используется только для акцента заголовка свёрнутой группы, ТЗ п.3.
  isActive: boolean;
  children: ReactNode;
};

const SubMenu = ({ name, icon, open, onToggle, sidebarOpen, isActive, children }: SubMenuProps) => {
  // Акцент нужен именно у свёрнутой активной группы: пока группа открыта,
  // активный пункт внутри уже подсвечен самим MenuItemLink (ТЗ п.3 говорит
  // явно про «свёрнутую» группу — раскрытая и так читается через дочерний пункт).
  const showActiveAccent = isActive && !open;

  const header = (
    <MenuItem onClick={onToggle} sx={(theme) => subMenuHeaderSx(theme, showActiveAccent)}>
      <ListItemIcon sx={(theme) => subMenuIconSx(theme, showActiveAccent)}>{icon}</ListItemIcon>
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
        <List component="div" disablePadding sx={(theme) => childListSx(theme, sidebarOpen)}>
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
// Третий элемент (isActive) идёт наружу для SubMenu — акцент свёрнутой активной
// группы (ТЗ admin_menu_hierarchy п.3) использует тот же matchPath, что и
// авто-раскрытие, а не отдельное вычисление.
const useGroupOpen = (paths: string[]) => {
  const { pathname } = useLocation();
  const isActive = paths.some((p) => matchPath({ path: p, end: false }, pathname) !== null);
  const [open, setOpen] = useState(isActive);
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);
  return [open, setOpen, isActive] as const;
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
  return (
    <Menu.Item
      to="/overtime-requests"
      primaryText="Переработки"
      leftIcon={icon}
      sx={childItemIconSx}
    />
  );
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
  const [shiftsOpen, setShiftsOpen, shiftsActive] = useGroupOpen([
    '/org-shifts',
    '/overtime-requests',
    '/work-schedules',
  ]);
  const [staffOpen, setStaffOpen, staffActive] = useGroupOpen(['/members', '/roles']);
  const [checklistsOpen, setChecklistsOpen, checklistsActive] = useGroupOpen([
    '/checklist-instances',
    '/checklist-templates',
  ]);
  const [testsOpen, setTestsOpen, testsActive] = useGroupOpen([
    '/test-templates',
    '/test-assignments',
  ]);
  const [financeOpen, setFinanceOpen, financeActive] = useGroupOpen([
    '/payroll',
    '/penalty-templates',
    '/adjustments',
  ]);

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
          {showPlatform && <Divider sx={{ my: 1.5 }} />}
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
            isActive={shiftsActive}
          >
            {/* Было «Смены» — тавтология с названием группы (ТЗ п.5). */}
            <Menu.Item
              to="/org-shifts"
              primaryText="Журнал смен"
              leftIcon={<AccessTimeIcon />}
              sx={childItemIconSx}
            />
            {isOrgManager && <OvertimeMenuItem />}
            <Menu.Item
              to="/work-schedules"
              primaryText="Графики работы"
              leftIcon={<ScheduleIcon />}
              sx={childItemIconSx}
            />
          </SubMenu>

          {/* Персонал: сотрудники и роли (роли — перенос из секции «Организация»). */}
          <SubMenu
            name="Персонал"
            icon={<GroupIcon />}
            open={staffOpen}
            onToggle={() => setStaffOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
            isActive={staffActive}
          >
            <Menu.Item
              to="/members"
              primaryText="Сотрудники"
              leftIcon={<GroupIcon />}
              sx={childItemIconSx}
            />
            <Menu.Item to="/roles" primaryText="Роли" leftIcon={<BadgeIcon />} sx={childItemIconSx} />
          </SubMenu>

          {/* Чек-листы: реестр экземпляров (checklist_reports) и шаблоны. */}
          <SubMenu
            name="Чек-листы"
            icon={<FactCheckIcon />}
            open={checklistsOpen}
            onToggle={() => setChecklistsOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
            isActive={checklistsActive}
          >
            {/* Было «Чек-листы» — тавтология с названием группы (ТЗ п.5). */}
            <Menu.Item
              to="/checklist-instances"
              primaryText="Заполненные чек-листы"
              leftIcon={<FactCheckIcon />}
              sx={childItemIconSx}
            />
            <Menu.Item
              to="/checklist-templates"
              primaryText="Шаблоны чек-листов"
              leftIcon={<ChecklistIcon />}
              sx={childItemIconSx}
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
              isActive={testsActive}
            >
              {/* Было «Тесты» — тавтология с названием группы (ТЗ п.5). */}
              <Menu.Item
                to="/test-templates"
                primaryText="Шаблоны тестов"
                leftIcon={<QuizIcon />}
                sx={childItemIconSx}
              />
              <Menu.Item
                to="/test-assignments"
                primaryText="Результаты тестов"
                leftIcon={<PollIcon />}
                sx={childItemIconSx}
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
              isActive={financeActive}
            >
              <Menu.Item
                to="/payroll"
                primaryText="Зарплата"
                leftIcon={<CurrencyRubleIcon />}
                sx={childItemIconSx}
              />
              <Menu.Item
                to="/penalty-templates"
                primaryText="Шаблоны штрафов"
                leftIcon={<MoneyOffIcon />}
                sx={childItemIconSx}
              />
              {/* manual_time_entry §4.1: рядом с «Зарплата» и «Шаблоны штрафов». */}
              <Menu.Item
                to="/adjustments"
                primaryText="Начисления"
                leftIcon={<PaidIcon />}
                sx={childItemIconSx}
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
          {(showPlatform || showOps) && <Divider sx={{ my: 1.5 }} />}
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
