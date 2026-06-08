import {
  List,
  Datagrid,
  TextField,
  DateField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  SearchInput,
  required,
} from 'react-admin';

const roleFilters = [<SearchInput key="q" source="q" alwaysOn />];

export const RoleList = () => (
  <List filters={roleFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
      <DateField source="created_at" label="Создана" showTime />
    </Datagrid>
  </List>
);

export const RoleEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
    </SimpleForm>
  </Edit>
);

export const RoleCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
    </SimpleForm>
  </Create>
);
