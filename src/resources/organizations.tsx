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
  SelectInput,
  useRecordContext,
  useRedirect,
  required,
} from 'react-admin';
import { Button } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { useCurrentOrg } from '../orgContext';

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
  if (!record) return null;
  return (
    <Button
      size="small"
      startIcon={<LoginIcon />}
      onClick={(e) => {
        e.stopPropagation();
        selectOrg({ id: String(record.id), name: String(record.name) });
        redirect('/members');
      }}
    >
      Открыть кабинет
    </Button>
  );
};

export const OrganizationList = () => (
  <List filters={orgFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick={false} bulkActionButtons={false}>
      <TextField source="name" label="Название" />
      <TextField source="owner_email" label="Владелец" emptyText="—" sortable={false} />
      <NumberField source="member_count" label="Участников" sortable={false} />
      <BooleanField source="is_deleted" label="Удалена" sortable={false} />
      <DateField source="created_at" label="Создана" showTime />
      <OpenCabinetButton />
    </Datagrid>
  </List>
);

export const OrganizationCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
    </SimpleForm>
  </Create>
);
