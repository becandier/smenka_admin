import { Admin, Resource } from 'react-admin';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import { dataProvider } from './providers/dataProvider';
import { authProvider } from './providers/authProvider';
import { theme } from './theme';
import { Dashboard } from './dashboard/Dashboard';
import { UserList, UserEdit } from './resources/users';
import { OrganizationList, OrganizationCreate } from './resources/organizations';

// Фаза 1 — платформенная консоль super_admin (Dashboard + users + organizations).
// Фаза 2 (см. ../smenka/docs/tasks/admin_panel/admin.md) — org-кабинет owner/admin.
export const App = () => (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    dashboard={Dashboard}
    theme={theme}
    requireAuth
  >
    <Resource
      name="users"
      list={UserList}
      edit={UserEdit}
      icon={PeopleIcon}
      options={{ label: 'Пользователи' }}
    />
    <Resource
      name="organizations"
      list={OrganizationList}
      create={OrganizationCreate}
      icon={BusinessIcon}
      options={{ label: 'Организации' }}
    />
  </Admin>
);
