import {
  List,
  Datagrid,
  TextField,
  DateField,
  BooleanField,
  BooleanInput,
  FunctionField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  NumberInput,
  DeleteWithConfirmButton,
  required,
  maxLength,
  useDataProvider,
  useNotify,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import { Box, Typography } from '@mui/material';
import { formatMoneyMinor, parseRublesToMinor } from '../utils/format';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { RestoreButton } from '../components/RestoreButton';

// Шаблоны штрафов ведут только org owner/admin. super_admin штрафы конкретной
// организации не ведёт (ТЗ fines) — для него экран закрыт (не полагаемся только на 403 бэка).
const NoAccess = () => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      Управление шаблонами штрафов доступно владельцу и администратору организации.
    </Typography>
  </Box>
);

const useCanManage = (): boolean => {
  const role = useMyOrgRole();
  return role === 'owner' || role === 'admin';
};

// Сумма хранится в копейках (amount_minor); в списке показываем рубли.
const amountField = (r: RaRecord) => formatMoneyMinor(r.amount_minor);

// Ввод суммы в рублях: > 0, не более 2 знаков (parseRublesToMinor валидирует и конвертит в форму).
const validateAmountRub = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return 'Укажите сумму';
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  return parseRublesToMinor(raw) === null
    ? 'Сумма в рублях больше нуля, не более 2 знаков'
    : undefined;
};

const reasonValidators = [required(), maxLength(200)];
const amountValidators = [required(), validateAmountRub];

const penaltyTemplateFilters = [
  <BooleanInput
    key="include_deleted"
    source="include_deleted"
    label="Показывать удалённые"
    alwaysOn
  />,
];

// «Удалить»/«Восстановить» (unified_soft_delete): удалённая строка получает «Восстановить»
// вместо «Удалить» — повторный DELETE на уже удалённом шаблоне бэк отверг бы 404.
const PenaltyTemplateRowActions = ({ record }: { record: RaRecord }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleRestore = async (): Promise<void> => {
    try {
      await dataProvider.restorePenaltyTemplate(String(record.id));
      notify('Шаблон штрафа восстановлен', { type: 'success' });
      refresh();
    } catch (e: any) {
      notify(e?.message ?? 'Не удалось восстановить шаблон', { type: 'error' });
    }
  };

  if (record.is_deleted) return <RestoreButton onRestore={handleRestore} />;
  return (
    <DeleteWithConfirmButton
      confirmTitle="Удалить шаблон штрафа?"
      confirmContent="Уже назначенные штрафы из него сохранятся (у них свой снимок суммы и причины); шаблон лишь исчезнет из списка выбора."
    />
  );
};

export const PenaltyTemplateList = () => {
  // Хук вызывается безусловно (первой строкой) — затем ветвимся по результату.
  if (!useCanManage()) return <NoAccess />;
  return (
    <List
      filters={penaltyTemplateFilters}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={false}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="reason" label="Причина" />
        <FunctionField label="Сумма" render={amountField} />
        <TextField source="currency" label="Валюта" />
        <BooleanField source="is_deleted" label="Удалён" />
        <DateField source="created_at" label="Создан" showTime />
        <DateField source="updated_at" label="Изменён" showTime />
        <FunctionField
          label=""
          render={(r: RaRecord) => <PenaltyTemplateRowActions record={r} />}
          sortable={false}
        />
      </Datagrid>
    </List>
  );
};

// amount_rub — плоское поле рублей (dataProvider маппит из amount_minor и обратно).
const TemplateForm = () => (
  <SimpleForm>
    <TextInput source="reason" label="Причина" validate={reasonValidators} fullWidth />
    <NumberInput source="amount_rub" label="Сумма, ₽" validate={amountValidators} min={0} />
    <TextInput source="currency" label="Валюта" defaultValue="RUB" disabled />
  </SimpleForm>
);

export const PenaltyTemplateCreate = () => {
  if (!useCanManage()) return <NoAccess />;
  return (
    <Create redirect="list">
      <TemplateForm />
    </Create>
  );
};

export const PenaltyTemplateEdit = () => {
  if (!useCanManage()) return <NoAccess />;
  return (
    <Edit mutationMode="pessimistic" redirect="list">
      <TemplateForm />
    </Edit>
  );
};
