import { describe, expect, it } from 'vitest';
import {
  actionLevel,
  canAccessTarget,
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
  it('карточка сотрудника и настройки открываются на просмотр', () => {
    expect(actionLevel('members', 'edit')).toBe('view');
    expect(actionLevel('settings', 'edit')).toBe('view');
    expect(actionLevel('roles', 'edit')).toBe('manage');
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
