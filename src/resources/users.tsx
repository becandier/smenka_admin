import {
  List,
  Datagrid,
  TextField,
  EmailField,
  BooleanField,
  DateField,
  NumberField,
  Edit,
  Show,
  SimpleShowLayout,
  SimpleForm,
  SelectInput,
  TextInput,
  SearchInput,
  SelectField,
} from 'react-admin';

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

export const UserList = () => (
  <List filters={userFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="show">
      <EmailField source="email" label="Email" />
      <TextField source="name" label="Имя" sortable={false} />
      <BooleanField source="is_verified" label="Подтверждён" sortable={false} />
      <SelectField source="role" label="Роль" choices={roleChoices} sortable={false} />
      <DateField source="created_at" label="Создан" showTime />
    </Datagrid>
  </List>
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
      <EmailField source="email" label="Email" />
      <TextField source="name" label="Имя" />
      <TextField source="phone" label="Телефон" emptyText="—" />
      <BooleanField source="is_verified" label="Подтверждён" />
      <SelectField source="role" label="Роль" choices={roleChoices} />
      <NumberField source="owned_organizations_count" label="Организаций (владелец)" />
      <NumberField source="member_organizations_count" label="Организаций (участник)" />
      <NumberField source="shifts_count" label="Смен всего" />
      <DateField source="created_at" label="Зарегистрирован" showTime />
    </SimpleShowLayout>
  </Show>
);
