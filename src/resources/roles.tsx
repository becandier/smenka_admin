import {
  List,
  TextField,
  FunctionField,
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
import { useSectionReadOnly } from '../utils/useOrgAccess';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import { OrganizationTimeText } from '../components/TimeText';
import { ViewModeAlert } from '../components/ViewModeAlert';
import { ColumnsDatagrid, TableColumns, TableColumnsButton } from '../tableColumns/TableColumns';

const roleFilters = [<SearchInput key="q" source="q" alwaysOn />];

// Read-only (backend.md «Read-only режим») прячет создание кастомной роли — не входит
// в список исключений.
const RoleListActions = () => {
  const isReadOnly = useSectionReadOnly('roles');
  return (
    <TopToolbar>
      <FilterButton />
      {!isReadOnly && <CreateButton />}
      <TableColumnsButton />
    </TopToolbar>
  );
};

// Столбцы списка (table_column_settings): key — идентификатор столбца в раскладке.
const roleFields = [
  <TextField key="name" source="name" label="Название" />,
  <FunctionField
    key="created_at"
    label="Создана"
    render={(record) => <OrganizationTimeText value={record.created_at} />}
  />,
];

// Read-only (backend.md «Read-only режим») прячет и bulk-удаление ролей — та же логика,
// что и для CreateButton в RoleListActions выше. До фичи «Тарифы» здесь был дефолтный
// bulkActionButtons (BulkDeleteButton) — восстанавливаем его вне read-only вместо
// прежнего безусловного `false`, который тайком убирал удаление ролей вообще для всех.
export const RoleList = () => {
  const isReadOnly = useSectionReadOnly('roles');
  return (
    <TableColumns tableId="roles" fields={roleFields}>
      <List
        filters={roleFilters}
        sort={{ field: 'created_at', order: 'DESC' }}
        exporter={false}
        actions={<RoleListActions />}
      >
        <ColumnsDatagrid
          rowClick="edit"
          bulkActionButtons={isReadOnly ? false : <BulkDeleteButton mutationMode="pessimistic" />}
        />
      </List>
    </TableColumns>
  );
};

// DeleteButton — внутри TariffAwareToolbar (как children), а не рядом с ним: до фичи
// «Тарифы» удаление роли жило в дефолтном тулбаре SimpleForm (Save+Delete) и пропадало
// вместе с Save для read-only-организации. TariffAwareToolbar прячет весь тулбар
// целиком при read-only (см. её комментарий) — это и восстанавливает прежнее поведение,
// в отличие от MemberEdit, где «выйти из организации» — явное исключение read-only.
export const RoleEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <ViewModeAlert section="roles" />
    <SimpleForm
      toolbar={
        <TariffAwareToolbar section="roles">
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
