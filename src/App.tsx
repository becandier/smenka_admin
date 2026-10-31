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
import { actionLevel, type AccessLevel } from './access';

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

const MEMBERS = guardResource('members', {
  list: MemberList,
  edit: MemberEdit,
  create: MemberCreate,
});
const ROLES = guardResource('roles', { list: RoleList, edit: RoleEdit, create: RoleCreate });
const ACCESS_PROFILES = guardResource('access-profiles', {
  list: AccessProfileList,
  edit: AccessProfileEdit,
  create: AccessProfileCreate,
});
const WORK_LOCATIONS = guardResource('work-locations', {
  list: WorkLocationList,
  edit: WorkLocationEdit,
  create: WorkLocationCreate,
});
const CHECKLIST_TEMPLATES = guardResource('checklist-templates', {
  list: ChecklistTemplateList,
  create: ChecklistTemplateCreate,
  edit: ChecklistTemplateEdit,
});
const CHECKLIST_INSTANCES = guardResource('checklist-instances', {
  list: ChecklistInstanceList,
  show: ChecklistInstanceShow,
});
const WORK_SCHEDULES = guardResource('work-schedules', {
  list: WorkScheduleList,
  create: WorkScheduleCreate,
  edit: WorkScheduleEdit,
});
const ORG_SHIFTS = guardResource('org-shifts', { list: OrgShiftList, show: OrgShiftShow });
const OVERTIME_REQUESTS = guardResource('overtime-requests', { list: OvertimeRequestList });
const PENALTY_TEMPLATES = guardResource('penalty-templates', {
  list: PenaltyTemplateList,
  create: PenaltyTemplateCreate,
  edit: PenaltyTemplateEdit,
});
const ADJUSTMENTS = guardResource('adjustments', { list: AdjustmentList });
const ADJUSTMENT_CATEGORIES = guardResource('adjustment-categories', {
  list: AdjustmentCategoryList,
  create: AdjustmentCategoryCreate,
  edit: AdjustmentCategoryEdit,
});
const AUDIT_LOGS = guardResource('audit-logs', { list: AuditLogList });
const TEST_TEMPLATES = guardResource('test-templates', {
  list: TestTemplateList,
  create: TestTemplateCreate,
  edit: TestTemplateEdit,
});
const TEST_ASSIGNMENTS = guardResource('test-assignments', { list: TestAssignmentList });

const InviteCodeRoute = guard(InviteCodePage, '/invite-code', 'view');
const SettingsRoute = guard(SettingsPage, '/settings', 'view');
const TariffRoute = guard(TariffPage, '/tariff', 'view');
const OrgStatsRoute = guard(OrgStatsPage, '/org-stats', 'view');
const PayrollRoute = guard(PayrollPage, '/payroll', 'view');
const KnowledgeRoute = guard(KnowledgePage, '/knowledge', 'view');

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
          <Resource name="members" {...MEMBERS} icon={GroupIcon} />
          <Resource name="roles" {...ROLES} icon={BadgeIcon} />
          {/* Профили доступа (access_profiles) — только полный администратор организации. */}
          <Resource name="access-profiles" {...ACCESS_PROFILES} icon={ManageAccountsIcon} />
          <Resource name="work-locations" {...WORK_LOCATIONS} icon={PlaceIcon} />
          <Resource name="checklist-templates" {...CHECKLIST_TEMPLATES} icon={ChecklistIcon} />
          {/* Реестр экземпляров чек-листов (checklist_reports) — read-only, деталь через
              GET /shifts/{shift_id}/checklists/{instance_id} (см. dataProvider getOne). */}
          <Resource name="checklist-instances" {...CHECKLIST_INSTANCES} icon={FactCheckIcon} />
          <Resource name="work-schedules" {...WORK_SCHEDULES} icon={ScheduleIcon} />
          <Resource name="org-shifts" {...ORG_SHIFTS} icon={AccessTimeIcon} />
          <Resource name="overtime-requests" {...OVERTIME_REQUESTS} icon={MoreTimeIcon} />
          <Resource name="penalty-templates" {...PENALTY_TEMPLATES} icon={MoneyOffIcon} />
          <Resource name="adjustments" {...ADJUSTMENTS} icon={PaidIcon} />
          <Resource name="adjustment-categories" {...ADJUSTMENT_CATEGORIES} icon={LocalOfferIcon} />
          <Resource name="audit-logs" {...AUDIT_LOGS} icon={HistoryIcon} />
          <Resource name="test-templates" {...TEST_TEMPLATES} icon={QuizIcon} />
          <Resource name="test-assignments" {...TEST_ASSIGNMENTS} icon={PollIcon} />

          <CustomRoutes>
            <Route path="/invite-code" element={<InviteCodeRoute />} />
            <Route path="/settings" element={<SettingsRoute />} />
            {/* Экран «Тариф» кабинета организации (tariffs) — owner/admin (+ super_admin
                сквозным доступом, как остальные org-экраны); профилю не выдаётся. */}
            <Route path="/tariff" element={<TariffRoute />} />
            <Route path="/org-stats" element={<OrgStatsRoute />} />
            <Route path="/payroll" element={<PayrollRoute />} />
            <Route path="/knowledge" element={<KnowledgeRoute />} />
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
