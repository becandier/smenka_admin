import { describe, expect, it } from 'vitest';
import {
  FULL_ONLY_TARGETS,
  MENU_ORDER,
  ORG_CUSTOM_ROUTES,
  ORG_RESOURCES,
  RESOURCE_SECTIONS,
  SECTION_LABELS,
  SUPER_ONLY_TARGETS,
  actionLevel,
  canAccessTarget,
  canSeePath,
  pathTarget,
  computeOrgAccess,
  firstCabinetPath,
  isOrgManageable,
  parseSectionPermissions,
} from './access';
import type { OrgPermission, Permissions } from './providers/authProvider';

const org = (over: Partial<OrgPermission>): OrgPermission => ({
  id: 'o1',
  name: 'Org',
  my_role: 'employee',
  my_permissions: {},
  my_access_profile: null,
  ...over,
});

const perms = (role: string, o: OrgPermission[]): Permissions => ({ role, organizations: o });

describe('computeOrgAccess', () => {
  it('без выбранной организации всё запрещено', () => {
    const a = computeOrgAccess(perms('user', [org({ my_role: 'owner' })]), null);
    expect(a.isFull).toBe(false);
    expect(a.can('members')).toBe(false);
  });

  it('owner/admin — полный доступ', () => {
    const a = computeOrgAccess(perms('user', [org({ my_role: 'admin' })]), 'o1');
    expect(a.isFull).toBe(true);
    expect(a.can('payroll', 'manage')).toBe(true);
    expect(canAccessTarget(a, 'access-profiles', 'manage')).toBe(true);
  });

  it('профиль: view не даёт manage, раздела нет — нет доступа', () => {
    const a = computeOrgAccess(
      perms('user', [org({ my_permissions: { shifts: 'view', payroll: 'manage' } })]),
      'o1',
    );
    expect(a.isFull).toBe(false);
    expect(a.hasCabinet).toBe(true);
    expect(a.can('shifts')).toBe(true);
    expect(a.can('shifts', 'manage')).toBe(false);
    expect(a.can('payroll')).toBe(true);
    expect(a.can('penalties')).toBe(false);
    expect(canAccessTarget(a, 'access-profiles')).toBe(false);
    expect(canAccessTarget(a, '/tariff')).toBe(false);
    expect(canAccessTarget(a, 'org-shifts', actionLevel('org-shifts', 'list'))).toBe(true);
  });

  it('super_admin без членства не видит финансы/тесты/переработки', () => {
    const a = computeOrgAccess(perms('super_admin', []), 'o1');
    expect(a.isFull).toBe(true);
    expect(a.can('members', 'manage')).toBe(true);
    expect(a.can('payroll')).toBe(false);
    expect(a.can('tests')).toBe(false);
    expect(a.can('overtime')).toBe(false);
    expect(canAccessTarget(a, 'users')).toBe(true);
  });

  it('super_admin-владелец организации видит финансы', () => {
    const a = computeOrgAccess(perms('super_admin', [org({ my_role: 'owner' })]), 'o1');
    expect(a.can('payroll', 'manage')).toBe(true);
  });
});

describe('actionLevel', () => {
  it('карточка сотрудника, настройки и справочники открываются на просмотр', () => {
    expect(actionLevel('members', 'edit')).toBe('view');
    expect(actionLevel('settings', 'edit')).toBe('view');
    expect(actionLevel('roles', 'edit')).toBe('view');
    expect(actionLevel('work-schedules', 'edit')).toBe('view');
    expect(actionLevel('access-profiles', 'edit')).toBe('manage');
    expect(actionLevel('roles', 'create')).toBe('manage');
    expect(actionLevel('members', 'delete')).toBe('manage');
    expect(actionLevel('roles', 'list')).toBe('view');
  });
});

describe('firstCabinetPath', () => {
  it('полный админ — в «Сотрудники», профиль — в первый доступный пункт', () => {
    const full = computeOrgAccess(perms('user', [org({ my_role: 'owner' })]), 'o1');
    expect(firstCabinetPath(full)).toBe('/members');
    const profile = computeOrgAccess(
      perms('user', [org({ my_permissions: { audit: 'view', stats: 'view' } })]),
      'o1',
    );
    expect(firstCabinetPath(profile)).toBe('/org-stats');
  });
});

describe('parse/isOrgManageable', () => {
  it('отбрасывает неизвестные уровни', () => {
    expect(parseSectionPermissions({ shifts: 'view', x: 'admin', y: 1 })).toEqual({
      shifts: 'view',
    });
    expect(parseSectionPermissions(null)).toEqual({});
  });

  it('сотрудник без профиля — не управляемая организация', () => {
    expect(isOrgManageable(org({}))).toBe(false);
    expect(isOrgManageable(org({ my_permissions: { shifts: 'view' } }))).toBe(true);
    expect(isOrgManageable(org({ my_role: 'owner' }))).toBe(true);
  });
});

describe('полнота карты прав', () => {
  it('каждый org-ресурс и custom-route привязан к разделу или помечен «только полный админ»', () => {
    for (const target of [...ORG_RESOURCES, ...ORG_CUSTOM_ROUTES]) {
      const known = target in RESOURCE_SECTIONS || FULL_ONLY_TARGETS.has(target);
      expect(known, `нет записи в RESOURCE_SECTIONS/FULL_ONLY_TARGETS: ${target}`).toBe(true);
    }
  });

  it('разделы карты — коды каталога с русскими названиями', () => {
    for (const section of Object.values(RESOURCE_SECTIONS)) {
      expect(SECTION_LABELS[section], section).toBeDefined();
    }
  });

  it('каждый пункт меню ведёт на зарегистрированную цель', () => {
    const registered = new Set<string>([...ORG_RESOURCES, ...ORG_CUSTOM_ROUTES]);
    for (const path of MENU_ORDER) {
      expect(registered.has(pathTarget(path)), path).toBe(true);
    }
  });
});

describe('pathTarget', () => {
  it('путь ресурса → имя ресурса, custom-route и полные цели — как есть', () => {
    expect(pathTarget('/org-shifts')).toBe('org-shifts');
    expect(pathTarget('/members')).toBe('members');
    expect(pathTarget('/access-profiles')).toBe('access-profiles');
    expect(pathTarget('/payroll')).toBe('/payroll');
    expect(pathTarget('/tariff')).toBe('/tariff');
  });
});

describe('canAccessTarget', () => {
  const profile = computeOrgAccess(
    perms('user', [org({ my_permissions: { members: 'view', roles: 'manage' } })]),
    'o1',
  );
  const owner = computeOrgAccess(perms('user', [org({ my_role: 'owner' })]), 'o1');
  const superAdmin = computeOrgAccess(perms('super_admin', []), 'o1');

  it('платформенные цели — только super_admin', () => {
    for (const target of SUPER_ONLY_TARGETS) {
      expect(canAccessTarget(owner, target)).toBe(false);
      expect(canAccessTarget(profile, target)).toBe(false);
      expect(canAccessTarget(superAdmin, target)).toBe(true);
    }
  });

  it('цели вне каталога — только полный администратор с выбранной организацией', () => {
    for (const target of FULL_ONLY_TARGETS) {
      expect(canAccessTarget(owner, target, 'manage')).toBe(true);
      expect(canAccessTarget(superAdmin, target)).toBe(true);
      expect(canAccessTarget(profile, target)).toBe(false);
      expect(canAccessTarget(computeOrgAccess(perms('super_admin', []), null), target)).toBe(false);
    }
  });

  it('уровни раздела: view/manage', () => {
    expect(canAccessTarget(profile, 'members', actionLevel('members', 'edit'))).toBe(true);
    expect(canAccessTarget(profile, 'members', actionLevel('members', 'create'))).toBe(false);
    expect(canAccessTarget(profile, 'members', actionLevel('members', 'delete'))).toBe(false);
    expect(canAccessTarget(profile, 'roles', actionLevel('roles', 'delete'))).toBe(true);
    expect(canAccessTarget(profile, '/payroll')).toBe(false);
  });

  it('неизвестная вспомогательная цель — решает бэк', () => {
    expect(canAccessTarget(profile, 'plans')).toBe(true);
    expect(canAccessTarget(profile, 'access-permissions')).toBe(true);
  });

  it('видимость пунктов меню', () => {
    expect(canSeePath(profile, '/members')).toBe(true);
    expect(canSeePath(profile, '/access-profiles')).toBe(false);
    expect(canSeePath(profile, '/org-shifts')).toBe(false);
  });
});
