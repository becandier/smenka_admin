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
  DeleteButton,
  BulkDeleteButton,
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

// Read-only (backend.md «Read-only режим») прячет и bulk-удаление ролей — та же логика,
// что и для CreateButton в RoleListActions выше. До фичи «Тарифы» здесь был дефолтный
// bulkActionButtons (BulkDeleteButton) — восстанавливаем его вне read-only вместо
// прежнего безусловного `false`, который тайком убирал удаление ролей вообще для всех.
export const RoleList = () => {
  const isReadOnly = useIsReadOnly();
  return (
    <List
      filters={roleFilters}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={false}
      actions={<RoleListActions />}
    >
      <Datagrid
        rowClick="edit"
        bulkActionButtons={isReadOnly ? false : <BulkDeleteButton mutationMode="pessimistic" />}
      >
        <TextField source="name" label="Название" />
        <DateField source="created_at" label="Создана" showTime />
      </Datagrid>
    </List>
  );
};

// DeleteButton — внутри TariffAwareToolbar (как children), а не рядом с ним: до фичи
// «Тарифы» удаление роли жило в дефолтном тулбаре SimpleForm (Save+Delete) и пропадало
// вместе с Save для read-only-организации. TariffAwareToolbar прячет весь тулбар
// целиком при read-only (см. её комментарий) — это и восстанавливает прежнее поведение,
// в отличие от MemberEdit, где «выйти из организации» — явное исключение read-only.
export const RoleEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm
      toolbar={
        <TariffAwareToolbar>
          <DeleteButton mutationMode="pessimistic" />
        </TariffAwareToolbar>
      }
    >
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
