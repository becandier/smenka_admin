import type { ComponentType } from 'react';
import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import PlaceIcon from '@mui/icons-material/Place';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import PaidIcon from '@mui/icons-material/Paid';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import QuizIcon from '@mui/icons-material/Quiz';
import PollIcon from '@mui/icons-material/Poll';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import PaymentsIcon from '@mui/icons-material/Payments';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { dataProvider } from './providers/dataProvider';
import { authProvider, type Permissions } from './providers/authProvider';
import { i18nProvider } from './i18n';
import { theme } from './theme';
import { Layout } from './layout/Layout';
import { LoginPage } from './layout/LoginPage';
import { OrgProvider } from './orgContext';
import { Dashboard } from './dashboard/Dashboard';
import { UserList, UserEdit, UserShow } from './resources/users';
import { OrganizationList, OrganizationCreate } from './resources/organizations';
import { MemberList, MemberEdit, MemberCreate } from './resources/members';
import { RoleList, RoleEdit, RoleCreate } from './resources/roles';
import {
  AccessProfileList,
  AccessProfileCreate,
  AccessProfileEdit,
} from './resources/accessProfiles';
import { WorkLocationList, WorkLocationEdit, WorkLocationCreate } from './resources/workLocations';
import {
  ChecklistTemplateList,
  ChecklistTemplateCreate,
  ChecklistTemplateEdit,
} from './resources/checklistTemplates';
import { ChecklistInstanceList, ChecklistInstanceShow } from './resources/checklistInstances';
import { WorkScheduleList, WorkScheduleCreate, WorkScheduleEdit } from './resources/workSchedules';
import { OvertimeRequestList } from './resources/overtimeRequests';
import { OrgShiftList, OrgShiftShow } from './resources/orgShifts';
import {
  PenaltyTemplateList,
  PenaltyTemplateCreate,
  PenaltyTemplateEdit,
} from './resources/penaltyTemplates';
import { AdjustmentList } from './resources/adjustments';
import {
  AdjustmentCategoryList,
  AdjustmentCategoryCreate,
  AdjustmentCategoryEdit,
} from './resources/adjustmentCategories';
import { AuditLogList } from './resources/auditLogs';
import { TestTemplateList, TestTemplateCreate, TestTemplateEdit } from './resources/testTemplates';
import { TestAssignmentList } from './resources/testAssignments';
import { SettingsPage } from './resources/settings';
import { OrgStatsPage } from './resources/orgStats';
import { PayrollPage } from './resources/payroll';
import { InviteCodePage } from './resources/inviteCode';
import { SubscriptionList } from './resources/subscriptions';
import { PaymentList } from './resources/payments';
import { TariffPage } from './resources/tariff';
import { KnowledgePage } from './resources/knowledge/KnowledgePage';
import { PlatformSettingsPage } from './resources/platformSettings';
import { OAUTH_LOGIN_ENABLED } from './config';
import { queryClient } from './queryClient';
import { RequireAccess } from './components/RequireAccess';
import {
  ORG_CUSTOM_ROUTES,
  ORG_RESOURCES,
  actionLevel,
  type AccessLevel,
  type OrgCustomRoute,
  type OrgResource,
} from './access';

// Обёртка экрана в RequireAccess (access_profiles/admin.md, «Маршруты»). Компоненты создаются
// один раз на уровне модуля — стабильная идентичность для react-router.
const guard = (Component: ComponentType, target: string, level: AccessLevel): ComponentType => {
  const Guarded = () => (
    <RequireAccess target={target} level={level}>
      <Component />
    </RequireAccess>
  );
  Guarded.displayName = `RequireAccess(${target})`;
  return Guarded;
};

type Views = {
  list?: ComponentType;
  create?: ComponentType;
  edit?: ComponentType;
  show?: ComponentType;
};

// list/show → просмотр, create → управление, edit → по actionLevel (карточка сотрудника —
// просмотр, остальные формы — управление); те же правила, что у authProvider.canAccess.
const guardResource = (target: string, views: Views): Views => ({
  list: views.list && guard(views.list, target, actionLevel(target, 'list')),
  show: views.show && guard(views.show, target, actionLevel(target, 'show')),
  create: views.create && guard(views.create, target, actionLevel(target, 'create')),
  edit: views.edit && guard(views.edit, target, actionLevel(target, 'edit')),
});

// Экраны org-ресурсов. Record<OrgResource, …> — TypeScript требует запись ровно для каждого
// ресурса из ORG_RESOURCES (src/access.ts), а тест полноты карты проверяет, что у каждого есть
// раздел: регистрация, карта прав и тест не могут разойтись.
const ORG_RESOURCE_VIEWS: Record<OrgResource, Views & { icon: ComponentType }> = {
  members: { list: MemberList, edit: MemberEdit, create: MemberCreate, icon: GroupIcon },
  roles: { list: RoleList, edit: RoleEdit, create: RoleCreate, icon: BadgeIcon },
  // Профили доступа (access_profiles) — только полный администратор организации.
  'access-profiles': {
    list: AccessProfileList,
    edit: AccessProfileEdit,
    create: AccessProfileCreate,
    icon: ManageAccountsIcon,
  },
  'work-locations': {
    list: WorkLocationList,
    edit: WorkLocationEdit,
    create: WorkLocationCreate,
    icon: PlaceIcon,
  },
  'checklist-templates': {
    list: ChecklistTemplateList,
    create: ChecklistTemplateCreate,
    edit: ChecklistTemplateEdit,
    icon: ChecklistIcon,
  },
  // Реестр экземпляров чек-листов (checklist_reports) — read-only, деталь через
  // GET /shifts/{shift_id}/checklists/{instance_id} (см. dataProvider getOne).
  'checklist-instances': {
    list: ChecklistInstanceList,
    show: ChecklistInstanceShow,
    icon: FactCheckIcon,
  },
  'work-schedules': {
    list: WorkScheduleList,
    create: WorkScheduleCreate,
    edit: WorkScheduleEdit,
    icon: ScheduleIcon,
  },
  'org-shifts': { list: OrgShiftList, show: OrgShiftShow, icon: AccessTimeIcon },
  'overtime-requests': { list: OvertimeRequestList, icon: MoreTimeIcon },
  'penalty-templates': {
    list: PenaltyTemplateList,
    create: PenaltyTemplateCreate,
    edit: PenaltyTemplateEdit,
    icon: MoneyOffIcon,
  },
  adjustments: { list: AdjustmentList, icon: PaidIcon },
  'adjustment-categories': {
    list: AdjustmentCategoryList,
    create: AdjustmentCategoryCreate,
    edit: AdjustmentCategoryEdit,
    icon: LocalOfferIcon,
  },
  'audit-logs': { list: AuditLogList, icon: HistoryIcon },
  'test-templates': {
    list: TestTemplateList,
    create: TestTemplateCreate,
    edit: TestTemplateEdit,
    icon: QuizIcon,
  },
  'test-assignments': { list: TestAssignmentList, icon: PollIcon },
};

const GUARDED_ORG_RESOURCES = ORG_RESOURCES.map((name) => {
  const { icon, ...views } = ORG_RESOURCE_VIEWS[name];
  return { name, icon, ...guardResource(name, views) };
});

// Custom-routes кабинета: та же схема — Record<OrgCustomRoute, …> по ORG_CUSTOM_ROUTES.
// «Тариф» (tariffs) — owner/admin (+ super_admin сквозным доступом); профилю не выдаётся.
const ORG_ROUTE_PAGES: Record<OrgCustomRoute, ComponentType> = {
  '/invite-code': InviteCodePage,
  '/settings': SettingsPage,
  '/tariff': TariffPage,
  '/org-stats': OrgStatsPage,
  '/payroll': PayrollPage,
  '/knowledge': KnowledgePage,
};

const GUARDED_ORG_ROUTES = ORG_CUSTOM_ROUTES.map((path) => ({
  path,
  Page: guard(ORG_ROUTE_PAGES[path], path, 'view'),
}));

// Доступ к ресурсам: платформенные (users/organizations) — только super_admin;
// org-ресурсы доступны при выбранной организации (owner/admin — свои; super_admin — любую).
export const App = () => (
  <OrgProvider>
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      queryClient={queryClient}
      i18nProvider={i18nProvider}
      dashboard={Dashboard}
      layout={Layout}
      loginPage={LoginPage}
      theme={theme}
      requireAuth
    >
      {(permissions: Permissions) => (
        <>
          {permissions?.role === 'super_admin' && (
            <Resource
              name="users"
              list={UserList}
              edit={UserEdit}
              show={UserShow}
              icon={PeopleIcon}
            />
          )}
          {permissions?.role === 'super_admin' && (
            <Resource
              name="organizations"
              list={OrganizationList}
              create={OrganizationCreate}
              icon={BusinessIcon}
            />
          )}
          {/* Реестр подписок (tariffs) — только super_admin, list-only: подписка появляется
              вместе с организацией, отдельного create нет (admin.md, «Раздел «Подписки»»). */}
          {permissions?.role === 'super_admin' && (
            <Resource name="subscriptions" list={SubscriptionList} icon={CreditCardIcon} />
          )}
          {/* Реестр «Платежи» (online_payments/admin.md, «Дорожка 2») — только super_admin,
              list-only: платежи не создаются/не редактируются из админки. */}
          {permissions?.role === 'super_admin' && (
            <Resource name="payments" list={PaymentList} icon={PaymentsIcon} />
          )}

          {/* Org-ресурсы: каждый экран обёрнут RequireAccess по разделу (access_profiles,
              карта ресурс→раздел в src/access.ts); кнопки внутри режет authProvider.canAccess. */}
          {GUARDED_ORG_RESOURCES.map(({ name, icon, list, create, edit, show }) => (
            <Resource
              key={name}
              name={name}
              list={list}
              create={create}
              edit={edit}
              show={show}
              icon={icon}
            />
          ))}

          <CustomRoutes>
            {GUARDED_ORG_ROUTES.map(({ path, Page }) => (
              <Route key={path} path={path} element={<Page />} />
            ))}
            {/* Раздел «Настройки платформы» (провайдеры входа) скрыт за OAUTH_LOGIN_ENABLED
                вместе с пунктом меню; компонент PlatformSettingsPage сохранён. */}
            {OAUTH_LOGIN_ENABLED && (
              <Route path="/platform-settings" element={<PlatformSettingsPage />} />
            )}
          </CustomRoutes>
        </>
      )}
    </Admin>
  </OrgProvider>
);
