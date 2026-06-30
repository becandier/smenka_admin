import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import PlaceIcon from '@mui/icons-material/Place';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
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
import { MemberList, MemberEdit } from './resources/members';
import { RoleList, RoleEdit, RoleCreate } from './resources/roles';
import { WorkLocationList, WorkLocationEdit, WorkLocationCreate } from './resources/workLocations';
import {
  ChecklistTemplateList,
  ChecklistTemplateCreate,
  ChecklistTemplateEdit,
} from './resources/checklistTemplates';
import { OrgShiftList, OrgShiftShow } from './resources/orgShifts';
import {
  PenaltyTemplateList,
  PenaltyTemplateCreate,
  PenaltyTemplateEdit,
} from './resources/penaltyTemplates';
import { AuditLogList } from './resources/auditLogs';
import { SettingsPage } from './resources/settings';
import { OrgStatsPage } from './resources/orgStats';
import { PayrollPage } from './resources/payroll';
import { InviteCodePage } from './resources/inviteCode';
import { KnowledgePage } from './resources/knowledge/KnowledgePage';

// Доступ к ресурсам: платформенные (users/organizations) — только super_admin;
// org-ресурсы доступны при выбранной организации (owner/admin — свои; super_admin — любую).
export const App = () => (
  <OrgProvider>
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
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

          <Resource name="members" list={MemberList} edit={MemberEdit} icon={GroupIcon} />
          <Resource
            name="roles"
            list={RoleList}
            edit={RoleEdit}
            create={RoleCreate}
            icon={BadgeIcon}
          />
          <Resource
            name="work-locations"
            list={WorkLocationList}
            edit={WorkLocationEdit}
            create={WorkLocationCreate}
            icon={PlaceIcon}
          />
          <Resource
            name="checklist-templates"
            list={ChecklistTemplateList}
            create={ChecklistTemplateCreate}
            edit={ChecklistTemplateEdit}
            icon={ChecklistIcon}
          />
          <Resource
            name="org-shifts"
            list={OrgShiftList}
            show={OrgShiftShow}
            icon={AccessTimeIcon}
          />
          {/* Шаблоны штрафов — CRUD только для org owner/admin (компоненты режут super_admin
              и не-менеджеров; в меню пункт виден только owner/admin). */}
          <Resource
            name="penalty-templates"
            list={PenaltyTemplateList}
            create={PenaltyTemplateCreate}
            edit={PenaltyTemplateEdit}
            icon={MoneyOffIcon}
          />
          {/* Аудит — read-only лента действий owner/admin; без create/edit/show-мутаций. */}
          <Resource name="audit-logs" list={AuditLogList} icon={HistoryIcon} />

          <CustomRoutes>
            <Route path="/invite-code" element={<InviteCodePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/org-stats" element={<OrgStatsPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
          </CustomRoutes>
        </>
      )}
    </Admin>
  </OrgProvider>
);
