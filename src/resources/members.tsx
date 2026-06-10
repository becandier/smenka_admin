import {
  List,
  Datagrid,
  TextField,
  EmailField,
  DateField,
  Edit,
  FunctionField,
  SimpleForm,
  SelectInput,
  TextInput,
  ReferenceInput,
  SearchInput,
  DeleteButton,
  SelectField,
  type RaRecord,
} from 'react-admin';
import { Chip } from '@mui/material';
import { MEMBER_ROLE_CHOICES, formatRateBadge } from '../utils/format';
import { MemberRatesSection } from './memberRates';

const memberFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="role" source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />,
];

// Колонка текущей ставки из MemberResponse.current_rate (additive nullable):
// null/отсутствует (старый бэк) → акцентная плашка «Ставка не задана».
const rateField = (r: RaRecord) =>
  r.current_rate ? (
    formatRateBadge(r.current_rate)
  ) : (
    <Chip size="small" color="warning" variant="outlined" label="Ставка не задана" />
  );

export const MemberList = () => (
  <List filters={memberFilters} sort={{ field: 'joined_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="user_name" label="Имя" />
      <EmailField source="user_email" label="Email" />
      <SelectField source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />
      <TextField source="custom_role.name" label="Кастомная роль" emptyText="—" />
      <FunctionField label="Ставка" render={rateField} />
      <DateField source="joined_at" label="Присоединился" showTime />
    </Datagrid>
  </List>
);

export const MemberEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm>
      <TextInput source="user_name" label="Имя" disabled />
      <TextInput source="user_email" label="Email" disabled />
      <SelectInput source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />
      <ReferenceInput source="custom_role_id" reference="roles">
        <SelectInput label="Кастомная роль" optionText="name" emptyText="— нет —" />
      </ReferenceInput>
      <DeleteButton label="Удалить из организации" mutationMode="pessimistic" />
    </SimpleForm>
    <MemberRatesSection />
  </Edit>
);
