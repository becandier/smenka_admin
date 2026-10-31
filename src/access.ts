// Модель прав кабинета организации (access_profiles, ADR-006). Чистый модуль без React:
// его используют и хук useOrgAccess (меню, маршруты, кнопки), и authProvider.canAccess
// (встроенный гейтинг react-admin: CreateButton/DeleteButton/rowClick и т.п.).
//
// Источник прав — `my_permissions` из GET /organizations (вычисляет бэк): для owner/admin/
// super_admin — все разделы на максимальном уровне, для сотрудника — права его профиля
// доступа или {}. UI лишь прячет недоступное; окончательно доступ режет бэк (403 FORBIDDEN).
import type { OrgPermission, Permissions } from './providers/authProvider';

export type AccessLevel = 'view' | 'manage';
export type SectionPermissions = Record<string, AccessLevel>;

export interface AccessProfileRef {
  id: string;
  name: string;
}

// Русские названия разделов каталога (GET /access-permissions отдаёт только коды).
export const SECTION_LABELS: Record<string, string> = {
  shifts: 'Журнал смен',
  overtime: 'Заявки на переработку',
  schedules: 'Графики работы',
  members: 'Сотрудники',
  roles: 'Роли',
  checklist_instances: 'Заполненные чек-листы',
  checklist_templates: 'Шаблоны чек-листов',
  tests: 'Тесты',
  payroll: 'Зарплата',
  penalties: 'Штрафы',
  stats: 'Статистика',
  knowledge: 'База знаний',
  work_locations: 'Точки',
  invites: 'Инвайт-код',
  settings: 'Настройки',
  audit: 'Аудит',
};

export const GROUP_LABELS: Record<string, string> = {
  shifts: 'Смены',
  staff: 'Персонал',
  checklists: 'Чек-листы',
  tests: 'Тесты',
  finance: 'Финансы',
  organization: 'Организация',
};

// Неизвестный код (бэк добавил раздел раньше, чем админка узнала о нём) показываем как есть.
export const sectionLabel = (code: string): string => SECTION_LABELS[code] ?? code;
export const groupLabel = (code: string): string => GROUP_LABELS[code] ?? code;

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  view: 'просмотр',
  manage: 'управление',
};

// Ресурс react-admin / путь custom-route → раздел каталога.
export const RESOURCE_SECTIONS: Record<string, string> = {
  'org-shifts': 'shifts',
  'overtime-requests': 'overtime',
  'work-schedules': 'schedules',
  members: 'members',
  roles: 'roles',
  'checklist-instances': 'checklist_instances',
  'checklist-templates': 'checklist_templates',
  'test-templates': 'tests',
  'test-assignments': 'tests',
  '/payroll': 'payroll',
  adjustments: 'payroll',
  'adjustment-categories': 'payroll',
  'penalty-templates': 'penalties',
  penalties: 'penalties',
  '/org-stats': 'stats',
  '/knowledge': 'knowledge',
  'knowledge/nodes': 'knowledge',
  'work-locations': 'work_locations',
  '/invite-code': 'invites',
  '/settings': 'settings',
  settings: 'settings',
  'audit-logs': 'audit',
};

// Вне каталога: только полный администратор организации.
export const FULL_ONLY_TARGETS = new Set(['access-profiles', '/tariff']);
// Платформенные ресурсы — только super_admin.
export const SUPER_ONLY_TARGETS = new Set([
  'users',
  'organizations',
  'subscriptions',
  'payments',
  '/platform-settings',
]);

// Названия для экрана «Нет доступа» у целей вне каталога.
const TARGET_LABELS: Record<string, string> = {
  'access-profiles': 'Профили доступа',
  '/tariff': 'Тариф',
};

export const targetLabel = (target: string): string => {
  const section = RESOURCE_SECTIONS[target];
  if (section) return sectionLabel(section);
  return TARGET_LABELS[target] ?? target;
};

// Исключения super_admin, существовавшие до профилей (финансы, тесты, переработки скрыты от
// него в меню и на экранах, бэк запрещает ему ручные начисления): can() для super_admin без
// роли owner/admin в организации по этим разделам возвращает false — так прежние условия
// `isOrgManager` сохраняются в одном месте, а не размазываются по компонентам.
const SUPER_EXCLUDED_SECTIONS = new Set(['overtime', 'tests', 'payroll', 'penalties']);

// Системные роли участника, дающие полный доступ к кабинету.
const FULL_MEMBER_ROLES = new Set(['owner', 'admin']);

export interface OrgAccess {
  hasOrg: boolean;
  isSuper: boolean;
  myRole: string | null;
  // Фактический owner/admin выбранной организации (без сквозного доступа super_admin).
  isOrgManager: boolean;
  // Полный администратор кабинета: super_admin, owner или admin.
  isFull: boolean;
  permissions: SectionPermissions;
  accessProfile: AccessProfileRef | null;
  // Есть ли вообще вход в кабинет выбранной организации.
  hasCabinet: boolean;
  can: (section: string, level?: AccessLevel) => boolean;
}

const isLevel = (value: unknown): value is AccessLevel => value === 'view' || value === 'manage';

// Нормализация ответа бэка: берём только известные уровни, остальное отбрасываем.
export const parseSectionPermissions = (raw: unknown): SectionPermissions => {
  const result: SectionPermissions = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [section, level] of Object.entries(raw as Record<string, unknown>)) {
    if (isLevel(level)) result[section] = level;
  }
  return result;
};

export const parseAccessProfileRef = (raw: unknown): AccessProfileRef | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name } = raw as { id?: unknown; name?: unknown };
  if (typeof id !== 'string' || id === '') return null;
  return { id, name: typeof name === 'string' ? name : '' };
};

export const levelAllows = (granted: AccessLevel | undefined, required: AccessLevel): boolean =>
  granted === 'manage' || (required === 'view' && granted === 'view');

// Организация считается «управляемой» (видна в OrgSwitcher, ведёт в кабинет), если
// пользователь в ней owner/admin или у него непустые права профиля.
export const isOrgManageable = (o: OrgPermission): boolean =>
  (o.my_role !== null && FULL_MEMBER_ROLES.has(o.my_role)) ||
  Object.keys(o.my_permissions).length > 0;

const NO_ACCESS = (): boolean => false;

export const computeOrgAccess = (
  perms: Permissions | null | undefined,
  orgId: string | null | undefined,
): OrgAccess => {
  const isSuper = perms?.role === 'super_admin';
  if (!orgId) {
    return {
      hasOrg: false,
      isSuper,
      myRole: null,
      isOrgManager: false,
      isFull: false,
      permissions: {},
      accessProfile: null,
      hasCabinet: false,
      can: NO_ACCESS,
    };
  }
  const entry = perms?.organizations?.find((o) => o.id === orgId);
  const myRole = entry?.my_role ?? null;
  const isOrgManager = myRole !== null && FULL_MEMBER_ROLES.has(myRole);
  const isFull = isSuper || isOrgManager;
  const permissions = entry?.my_permissions ?? {};
  const can = (section: string, level: AccessLevel = 'view'): boolean => {
    if (isSuper && !isOrgManager && SUPER_EXCLUDED_SECTIONS.has(section)) return false;
    if (isFull) return true;
    return levelAllows(permissions[section], level);
  };
  return {
    hasOrg: true,
    isSuper,
    myRole,
    isOrgManager,
    isFull,
    permissions,
    accessProfile: entry?.my_access_profile ?? null,
    hasCabinet: isFull || Object.keys(permissions).length > 0,
    can,
  };
};

// Доступ к ресурсу/маршруту по карте выше. Неизвестная цель (вспомогательные ресурсы вроде
// `plans`) — разрешена: решает бэк, UI не должен ломаться на технических ресурсах.
export const canAccessTarget = (
  access: OrgAccess,
  target: string,
  level: AccessLevel = 'view',
): boolean => {
  if (SUPER_ONLY_TARGETS.has(target)) return access.isSuper;
  if (FULL_ONLY_TARGETS.has(target)) return access.hasOrg && access.isFull;
  const section = RESOURCE_SECTIONS[target];
  if (!section) return true;
  return access.can(section, level);
};

// Действия react-admin, которым хватает чтения; остальные (create/edit/delete/clone/…) —
// управление. Исключение — «карточки», где edit-страница служит и просмотром: карточка
// сотрудника (действия внутри гейтятся отдельно) и singleton-настройки.
const VIEW_ACTIONS = new Set(['list', 'show', 'export', 'read']);
const VIEW_EDIT_RESOURCES = new Set(['members', 'settings']);

export const actionLevel = (resource: string, action: string): AccessLevel => {
  if (VIEW_ACTIONS.has(action)) return 'view';
  if (action === 'edit' && VIEW_EDIT_RESOURCES.has(resource)) return 'view';
  return 'manage';
};

// Порядок пунктов меню кабинета — для редиректа «в первый доступный раздел».
export const MENU_ORDER: string[] = [
  '/org-shifts',
  '/overtime-requests',
  '/work-schedules',
  '/members',
  '/roles',
  '/access-profiles',
  '/checklist-instances',
  '/checklist-templates',
  '/test-templates',
  '/test-assignments',
  '/payroll',
  '/penalty-templates',
  '/adjustments',
  '/adjustment-categories',
  '/org-stats',
  '/knowledge',
  '/work-locations',
  '/invite-code',
  '/settings',
  '/tariff',
  '/audit-logs',
];

// Путь пункта меню → цель карты (ресурс без ведущего «/» или custom-route как есть).
export const pathTarget = (path: string): string =>
  RESOURCE_SECTIONS[path] || FULL_ONLY_TARGETS.has(path) ? path : path.replace(/^\//, '');

export const canSeePath = (access: OrgAccess, path: string): boolean =>
  canAccessTarget(access, pathTarget(path));

// Куда вести при входе в кабинет: полного администратора — по-прежнему в «Сотрудники»,
// обладателя профиля — в первый доступный пункт меню.
export const firstCabinetPath = (access: OrgAccess): string => {
  if (access.isFull) return '/members';
  return MENU_ORDER.find((path) => canSeePath(access, path)) ?? '/';
};
