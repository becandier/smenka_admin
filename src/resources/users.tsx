import {
  List,
  Datagrid,
  TextField,
  EmailField,
  BooleanField,
  DateField,
  Edit,
  SimpleForm,
  SelectInput,
  TextInput,
  SearchInput,
  SelectField,
} from 'react-admin';

const roleChoices = [
  { id: 'user', name: 'user' },
  { id: 'super_admin', name: 'super_admin' },
];

const userFilters = [
  <SearchInput key="search" source="search" alwaysOn />,
  <SelectInput key="role" source="role" label="Роль" choices={roleChoices} />,
];

export const UserList = () => (
  <List filters={userFilters} sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid rowClick="edit">
      <EmailField source="email" label="Email" />
      <TextField source="name" label="Имя" />
      <BooleanField source="is_verified" label="Подтверждён" />
      <SelectField source="role" label="Роль" choices={roleChoices} />
      <DateField source="created_at" label="Создан" showTime />
    </Datagrid>
  </List>
);

export const UserEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="email" label="Email" disabled />
      <TextInput source="name" label="Имя" disabled />
      <SelectInput source="role" label="Роль" choices={roleChoices} />
    </SimpleForm>
  </Edit>
);
