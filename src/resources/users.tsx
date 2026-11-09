import {
  List,
  TextField,
  EmailField,
  BooleanField,
  NumberField,
  Edit,
  Show,
  SimpleShowLayout,
  SimpleForm,
  SelectInput,
  TextInput,
  SearchInput,
  SelectField,
  FunctionField,
} from 'react-admin';
import { DeviceTimeText } from '../components/TimeText';
import {
  ColumnsDatagrid,
  ListActionsWithColumns,
  TableColumns,
} from '../tableColumns/TableColumns';

const roleChoices = [
  { id: 'user', name: 'Пользователь' },
  { id: 'super_admin', name: 'Супер-админ' },
];

const verifiedChoices = [
  { id: 'true', name: 'Да' },
  { id: 'false', name: 'Нет' },
];

const userFilters = [
  <SearchInput key="search" source="search" alwaysOn />,
  <SelectInput key="role" source="role" label="Роль" choices={roleChoices} />,
  <SelectInput
    key="is_verified"
    source="is_verified"
    label="Подтверждён"
    choices={verifiedChoices}
  />,
];

// Столбцы списка (table_column_settings): key — идентификатор столбца в раскладке.
const userFields = [
  // email nullable (admin_created_accounts/backend.md: учётка может быть заведена
  // организацией без почты) — EmailField.emptyText реагирует на null, показываем «—».
  <EmailField key="email" source="email" label="Email" emptyText="—" />,
  <TextField key="login" source="login" label="Логин" emptyText="—" sortable={false} />,
  <TextField key="name" source="name" label="Имя" sortable={false} />,
  <BooleanField key="is_verified" source="is_verified" label="Подтверждён" sortable={false} />,
  <SelectField key="role" source="role" label="Роль" choices={roleChoices} sortable={false} />,
  <FunctionField
    key="created_at"
    label="Создан"
    render={(record) => <DeviceTimeText value={record.created_at} />}
  />,
];

export const UserList = () => (
  <TableColumns tableId="users" fields={userFields}>
    <List
      filters={userFilters}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={false}
      actions={<ListActionsWithColumns />}
    >
      <ColumnsDatagrid rowClick="show" />
    </List>
  </TableColumns>
);

export const UserEdit = () => (
  <Edit mutationMode="pessimistic" redirect="show">
    <SimpleForm>
      <TextInput source="email" label="Email" disabled />
      <TextInput source="name" label="Имя" disabled />
      <SelectInput source="role" label="Роль" choices={roleChoices} />
    </SimpleForm>
  </Edit>
);

export const UserShow = () => (
  <Show>
    <SimpleShowLayout>
      <EmailField source="email" label="Email" emptyText="—" />
      <TextField source="login" label="Логин" emptyText="—" />
      <TextField source="name" label="Имя" />
      <TextField source="phone" label="Телефон" emptyText="—" />
      <BooleanField source="is_verified" label="Подтверждён" />
      <SelectField source="role" label="Роль" choices={roleChoices} />
      <NumberField source="owned_organizations_count" label="Организаций (владелец)" />
      <NumberField source="member_organizations_count" label="Организаций (участник)" />
      <NumberField source="shifts_count" label="Смен всего" />
      <FunctionField
        label="Зарегистрирован"
        render={(record) => <DeviceTimeText value={record.created_at} />}
      />
    </SimpleShowLayout>
  </Show>
);
