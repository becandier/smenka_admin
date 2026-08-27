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
  TopToolbar,
  CreateButton,
  FilterButton,
  required,
} from 'react-admin';
import { useIsReadOnly } from '../subscription/SubscriptionContext';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';

const roleFilters = [<SearchInput key="q" source="q" alwaysOn />];

// Read-only (backend.md «Read-only режим») прячет создание кастомной роли — не входит
// в список исключений.
const RoleListActions = () => {
  const isReadOnly = useIsReadOnly();
  return (
    <TopToolbar>
      <FilterButton />
      {!isReadOnly && <CreateButton />}
    </TopToolbar>
  );
};

export const RoleList = () => (
  <List
    filters={roleFilters}
    sort={{ field: 'created_at', order: 'DESC' }}
    exporter={false}
    actions={<RoleListActions />}
  >
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" label="Название" />
      <DateField source="created_at" label="Создана" showTime />
    </Datagrid>
  </List>
);

export const RoleEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm toolbar={<TariffAwareToolbar />}>
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
