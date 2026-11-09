import {
  List,
  TextField,
  NumberField,
  BooleanField,
  FunctionField,
  Create,
  SimpleForm,
  TextInput,
  SearchInput,
  SelectInput,
  useRecordContext,
  useRedirect,
  useRefresh,
  required,
} from 'react-admin';
import { Button } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { useCurrentOrg } from '../orgContext';
import { DeviceTimeText } from '../components/TimeText';
import {
  ColumnsDatagrid,
  ListActionsWithColumns,
  TableColumns,
} from '../tableColumns/TableColumns';

const deletedChoices = [
  { id: 'true', name: 'Удалённые' },
  { id: 'false', name: 'Активные' },
];

const orgFilters = [
  <SearchInput key="search" source="search" alwaysOn />,
  <SelectInput key="is_deleted" source="is_deleted" label="Статус" choices={deletedChoices} />,
];

// Кнопка «Открыть кабинет» — задаёт текущую организацию и ведёт в org-кабинет (для super_admin).
const OpenCabinetButton = () => {
  const record = useRecordContext();
  const { selectOrg } = useCurrentOrg();
  const redirect = useRedirect();
  // refresh — как в OrgSwitcher.open: перечитать данные под новую организацию.
  const refresh = useRefresh();
  if (!record) return null;
  return (
    <Button
      size="small"
      startIcon={<LoginIcon />}
      onClick={(e) => {
        e.stopPropagation();
        selectOrg({ id: String(record.id), name: String(record.name) });
        redirect('/members');
        refresh();
      }}
    >
      Открыть кабинет
    </Button>
  );
};

// Столбцы списка (table_column_settings): key — идентификатор столбца, без key — служебный.
const organizationFields = [
  <TextField key="name" source="name" label="Название" />,
  <TextField
    key="owner_email"
    source="owner_email"
    label="Владелец"
    emptyText="—"
    sortable={false}
  />,
  <NumberField key="member_count" source="member_count" label="Участников" sortable={false} />,
  <BooleanField key="is_deleted" source="is_deleted" label="Удалена" sortable={false} />,
  <FunctionField
    key="created_at"
    label="Создана"
    render={(record) => <DeviceTimeText value={record.created_at} />}
  />,
  <OpenCabinetButton />,
];

export const OrganizationList = () => (
  <TableColumns tableId="organizations" fields={organizationFields}>
    <List
      filters={orgFilters}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={false}
      actions={<ListActionsWithColumns />}
    >
      <ColumnsDatagrid rowClick={false} bulkActionButtons={false} />
    </List>
  </TableColumns>
);

export const OrganizationCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
    </SimpleForm>
  </Create>
);
