import {
  List,
  Datagrid,
  TextField,
  EmailField,
  DateField,
  Edit,
  SimpleForm,
  SelectInput,
  TextInput,
  ReferenceInput,
  SearchInput,
  DeleteButton,
  SelectField,
} from 'react-admin';

const memberRoleChoices = [
  { id: 'admin', name: 'Администратор' },
  { id: 'employee', name: 'Сотрудник' },
];

const memberFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="role" source="role" label="Системная роль" choices={memberRoleChoices} />,
];

export const MemberList = () => (
  <List filters={memberFilters} sort={{ field: 'joined_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="user_name" label="Имя" />
      <EmailField source="user_email" label="Email" />
      <SelectField source="role" label="Системная роль" choices={memberRoleChoices} />
      <TextField source="custom_role.name" label="Кастомная роль" emptyText="—" />
      <DateField source="joined_at" label="Присоединился" showTime />
    </Datagrid>
  </List>
);

export const MemberEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm>
      <TextInput source="user_name" label="Имя" disabled />
      <TextInput source="user_email" label="Email" disabled />
      <SelectInput source="role" label="Системная роль" choices={memberRoleChoices} />
      <ReferenceInput source="custom_role_id" reference="roles">
        <SelectInput label="Кастомная роль" optionText="name" emptyText="— нет —" />
      </ReferenceInput>
      <DeleteButton label="Удалить из организации" mutationMode="pessimistic" />
    </SimpleForm>
  </Edit>
);
