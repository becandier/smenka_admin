import {
  List,
  Datagrid,
  TextField,
  NumberField,
  BooleanField,
  DateField,
  Create,
  SimpleForm,
  TextInput,
  SearchInput,
  required,
} from 'react-admin';

const orgFilters = [<SearchInput key="search" source="search" alwaysOn />];

export const OrganizationList = () => (
  <List filters={orgFilters} sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid rowClick={false}>
      <TextField source="name" label="Название" />
      <TextField source="owner_email" label="Владелец" />
      <NumberField source="member_count" label="Участников" />
      <BooleanField source="is_deleted" label="Удалена" />
      <DateField source="created_at" label="Создана" showTime />
    </Datagrid>
  </List>
);

export const OrganizationCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
    </SimpleForm>
  </Create>
);
