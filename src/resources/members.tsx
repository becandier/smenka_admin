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
  maxLength,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { Chip } from '@mui/material';
import { MEMBER_ROLE_CHOICES, formatRateBadge } from '../utils/format';
import { MemberRatesSection } from './memberRates';
import { MemberPenaltiesSection } from './penalties';
import { MemberNameCell } from '../components/MemberNameCell';

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

// Колонка «Имя» — единое правило отображения (member_display_name/admin.md): display_name
// основной строкой, user_name подписью. sortBy сохраняет прежнюю сортировку по клику
// на заголовок (TextField source="user_name" была сортируемой).
const nameField = (r: RaRecord) => (
  <MemberNameCell user_name={r.user_name} display_name={r.display_name} />
);

export const MemberList = () => (
  <List filters={memberFilters} sort={{ field: 'joined_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <FunctionField label="Имя" render={nameField} sortBy="user_name" />
      <EmailField source="user_email" label="Email" />
      <SelectField source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />
      <TextField source="custom_role.name" label="Кастомная роль" emptyText="—" />
      <FunctionField label="Ставка" render={rateField} />
      <DateField source="joined_at" label="Присоединился" showTime />
    </Datagrid>
  </List>
);

// «Имя в организации» (display_name): необязательное, до 100 символов. Подсказка
// подставляет настоящее имя сотрудника — динамическая, поэтому нужен доступ к record.
// Очистка поля (пустая строка) = сброс на настоящее имя — нормализацию в null делает
// dataProvider (update, ресурс members), сюда её дублировать не нужно.
const DisplayNameInput = () => {
  const record = useRecordContext();
  const realName = typeof record?.user_name === 'string' ? record.user_name : '';
  return (
    <TextInput
      source="display_name"
      label="Имя в организации"
      helperText={`Как этот сотрудник отображается в вашей организации. Пусто — показываем имя из профиля: ${realName}`}
      inputProps={{ maxLength: 100 }}
      validate={maxLength(100, 'Не более 100 символов')}
      fullWidth
    />
  );
};

export const MemberEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm>
      <TextInput source="user_name" label="Имя" disabled />
      <TextInput source="user_email" label="Email" disabled />
      <DisplayNameInput />
      <SelectInput source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />
      <ReferenceInput source="custom_role_id" reference="roles">
        <SelectInput label="Кастомная роль" optionText="name" emptyText="— нет —" />
      </ReferenceInput>
      <DeleteButton label="Удалить из организации" mutationMode="pessimistic" />
    </SimpleForm>
    <MemberRatesSection />
    <MemberPenaltiesSection />
  </Edit>
);
