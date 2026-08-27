import type { ReactElement, ReactNode } from 'react';
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
  TopToolbar,
  CreateButton,
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
import { FeatureLockButton, PremiumRequiredScreen } from '../subscription/FeatureLock';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import { useHasFeature, useIsReadOnly } from '../subscription/SubscriptionContext';

// Шаблоны штрафов ведут только org owner/admin. super_admin штрафы конкретной
// организации не ведёт (ТЗ fines) — для него экран закрыт (не полагаемся только на 403 бэка).
const NoAccess = ({ text }: { text?: ReactNode }) => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      {text ?? 'Управление шаблонами штрафов доступно владельцу и администратору организации.'}
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
// вместо «Удалить» — повторный DELETE на уже удалённом шаблоне бэк отверг бы 404. DELETE
// самого шаблона фичей fines не гейтится (backend.md, «Остаются доступными на Стандарте:
// … DELETE шаблона/штрафа»), а вот restore — гейтится (`POST .../restore`, «Энфорсмент
// фич»), поэтому в замок берём только «Восстановить». Read-only прячет обе мутации целиком —
// у read-only-организации нет ни удаления, ни восстановления шаблонов (backend.md, «Read-only
// режим»: ни одно из исключений сюда не подходит).
const PenaltyTemplateRowActions = ({ record }: { record: RaRecord }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const isReadOnly = useIsReadOnly();
  const hasFines = useHasFeature('fines');

  const handleRestore = async (): Promise<void> => {
    try {
      await dataProvider.restorePenaltyTemplate(String(record.id));
      notify('Шаблон штрафа восстановлен', { type: 'success' });
      refresh();
    } catch (e: any) {
      notify(e?.message ?? 'Не удалось восстановить шаблон', { type: 'error' });
    }
  };

  if (isReadOnly) return null;

  if (record.is_deleted) {
    return (
      <FeatureLockButton locked={!hasFines} featureLabel="Штрафы">
        <RestoreButton onRestore={handleRestore} />
      </FeatureLockButton>
    );
  }
  return (
    <DeleteWithConfirmButton
      confirmTitle="Удалить шаблон штрафа?"
      confirmContent="Уже назначенные штрафы из него сохранятся (у них свой снимок суммы и причины); шаблон лишь исчезнет из списка выбора."
    />
  );
};

// «Добавить шаблон» — гейтится и тарифом (fines, замок + диалог), и read-only (скрыт целиком,
// admin.md «Read-only режим»: создание в скоупе организации не входит в список исключений).
const PenaltyTemplateListActions = () => {
  const isReadOnly = useIsReadOnly();
  const hasFines = useHasFeature('fines');
  if (isReadOnly) return null;
  return (
    <TopToolbar>
      <FeatureLockButton locked={!hasFines} featureLabel="Штрафы" raIcon>
        <CreateButton label="Добавить шаблон" />
      </FeatureLockButton>
    </TopToolbar>
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
      actions={<PenaltyTemplateListActions />}
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
// toolbar — по умолчанию (Create, гейтится на уровне всего маршрута выше), либо
// TariffAwareToolbar (Edit — see PenaltyTemplateEdit, PATCH тоже требует feature.fines).
const TemplateForm = ({ toolbar }: { toolbar?: ReactElement }) => (
  <SimpleForm toolbar={toolbar}>
    <TextInput source="reason" label="Причина" validate={reasonValidators} fullWidth />
    <NumberInput source="amount_rub" label="Сумма, ₽" validate={amountValidators} min={0} />
    <TextInput source="currency" label="Валюта" defaultValue="RUB" disabled />
  </SimpleForm>
);

// Create — гейтится на уровне всего маршрута: без feature.fines показываем заглушку
// «доступно на Премиуме» вместо формы (admin.md, «Раздел «Штрафы» … на экране вместо
// таблицы — заглушка»), а не задизейбленную кнопку Save внутри пустой формы.
export const PenaltyTemplateCreate = () => {
  const canManage = useCanManage();
  const isReadOnly = useIsReadOnly();
  const hasFines = useHasFeature('fines');
  if (!canManage) return <NoAccess />;
  if (isReadOnly) {
    return <NoAccess text="Организация в режиме только для чтения — создание недоступно." />;
  }
  if (!hasFines) return <PremiumRequiredScreen featureLabel="Штрафы" />;
  return (
    <Create redirect="list">
      <TemplateForm />
    </Create>
  );
};

// Edit — маршрут остаётся доступен (GET не гейтится, admin.md/backend.md), а Save —
// через TariffAwareToolbar (read-only скрывает целиком, !fines — замок + диалог).
export const PenaltyTemplateEdit = () => {
  const canManage = useCanManage();
  if (!canManage) return <NoAccess />;
  return (
    <Edit mutationMode="pessimistic" redirect="list">
      <TemplateForm toolbar={<TariffAwareToolbar feature="fines" featureLabel="Штрафы" />} />
    </Edit>
  );
};
