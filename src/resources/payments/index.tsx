import { useMemo } from 'react';
import {
  AutocompleteInput,
  BooleanInput,
  Datagrid,
  DateInput,
  FunctionField,
  List,
  SelectInput,
  TextField,
  useGetList,
  useListContext,
  type RaRecord,
} from 'react-admin';
import { Chip, Link as MuiLink, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DateRangeAlert } from '../../components/DateRangeAlert';
import { DeviceTimeText } from '../../components/TimeText';
import {
  PAYMENT_STATUS_CHOICES,
  PAYMENT_STATUS_COLOR,
  formatMoneyMinor,
  paymentPurposeLabel,
  paymentStatusLabel,
} from '../../utils/format';
import { PaymentsTotals } from './PaymentsTotals';

// Фильтр по организации — живой список из /admin/organizations (тот же приём, что
// MemberSelectFilter для участников), а не платформенный ReferenceInput: организаций мало
// (перечень грузится целиком, cap 200 — тот же лимит, что и у MemberSelectFilter), и здесь
// нужен только id + name, без деталей ReferenceInput-обвязки.
const OrganizationSelectFilter = (props: { source: string; label: string; alwaysOn?: boolean }) => {
  const { data } = useGetList<{ id: string; name: string }>('organizations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'created_at', order: 'DESC' },
  });
  const choices = useMemo(
    () =>
      (data ?? [])
        .map((o) => ({ id: o.id, name: o.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data],
  );
  return <AutocompleteInput {...props} choices={choices} />;
};

const paymentFilters = [
  <SelectInput
    key="status"
    source="status"
    label="Статус"
    choices={PAYMENT_STATUS_CHOICES}
    alwaysOn
  />,
  <OrganizationSelectFilter
    key="organization_id"
    source="organization_id"
    label="Организация"
    alwaysOn
  />,
  // Окно по created_at, оба края включительно — день конвертирует в UTC-границы dataProvider
  // (та же схема date_filters, что у аудита/смен/начислений).
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
  // Включён по умолчанию (filterDefaultValues на <List> ниже) — admin.md: «"скрыть
  // тестовые" (включён по умолчанию)».
  <BooleanInput key="hide_test" source="hide_test" label="Скрыть тестовые" alwaysOn />,
];

// «Строки с status=succeeded, но пустым applied_at подсвечиваются — оплата, которую не
// удалось применить … разбирают руками» (admin.md, «Реестр «Платежи»» — организация была
// удалена во время оплаты или разошлась сумма, backend.md «Применение платежа»).
const paymentRowSx = (record: RaRecord) =>
  record.status === 'succeeded' && !record.applied_at ? { bgcolor: 'warning.light' } : {};

const statusChip = (record: RaRecord) => (
  <Chip
    size="small"
    color={PAYMENT_STATUS_COLOR[record.status as string] ?? 'default'}
    label={paymentStatusLabel(record.status as string)}
  />
);

const testChip = (record: RaRecord) =>
  record.is_test ? <Chip size="small" variant="outlined" label="тест" /> : null;

const createdByCell = (record: RaRecord): string => {
  const createdBy = record.created_by as { name?: string; email?: string } | null;
  if (!createdBy) return '—';
  return createdBy.name || createdBy.email || '—';
};

// «Из строки — переход на организацию и на её историю подписки, чтобы связка «платёж →
// событие подписки» проверялась в два клика» (admin.md). Ни у одного из двух ресурсов нет
// GET одной записи/страницы (organizations — list-only, без Show/Edit; subscriptions — тоже
// list-only, история открывается диалогом «История» из строки) — переходим на списки,
// предзаполненные поиском по имени организации (react-admin's deep-link `?filter=...`),
// клик №2 («История») пользователь довершает сам в подписках. По organization_id точнее
// было бы фильтровать напрямую, но оба списка ищут только по названию (`search`/`q`).
const rowLinks = (record: RaRecord) => {
  const name = String(record.organization_name ?? '');
  const orgFilter = encodeURIComponent(JSON.stringify({ search: name }));
  const subFilter = encodeURIComponent(JSON.stringify({ q: name }));
  return (
    <Stack direction="row" spacing={1.5} onClick={(e) => e.stopPropagation()}>
      <MuiLink component={RouterLink} to={`/organizations?filter=${orgFilter}`}>
        Организация
      </MuiLink>
      <MuiLink component={RouterLink} to={`/subscriptions?filter=${subFilter}`}>
        История подписки
      </MuiLink>
    </Stack>
  );
};

const PaymentListEmpty = () => (
  <Typography sx={{ m: 4, textAlign: 'center' }} color="text.secondary">
    Платежей по этим фильтрам нет.
  </Typography>
);

const PaymentDatagrid = () => {
  const { data, isPending } = useListContext();
  if (!isPending && (data ?? []).length === 0) return <PaymentListEmpty />;
  return (
    // Read-only реестр (admin.md: «Список только для чтения: платежи не создаются и не
    // редактируются из админки») — без bulk-действий и rowClick-мутаций.
    <Datagrid rowClick={false} bulkActionButtons={false} rowSx={paymentRowSx}>
      <FunctionField
        label="Дата"
        render={(record: RaRecord) => <DeviceTimeText value={record.created_at} />}
        sortable={false}
      />
      <TextField source="organization_name" label="Организация" sortable={false} />
      <FunctionField
        label="Назначение"
        sortable={false}
        render={(r: RaRecord) =>
          paymentPurposeLabel({
            kind: r.kind as 'extend' | 'upgrade',
            plan_name: r.plan_name as string,
            months: (r.months as number | null) ?? null,
          })
        }
      />
      <FunctionField
        label="Сумма"
        sortable={false}
        render={(r: RaRecord) => formatMoneyMinor(r.amount_minor as number)}
      />
      <FunctionField label="Статус" sortable={false} render={statusChip} />
      <FunctionField label="Кто инициировал" sortable={false} render={createdByCell} />
      <FunctionField label="" sortable={false} render={testChip} />
      <FunctionField label="" sortable={false} render={rowLinks} />
    </Datagrid>
  );
};

// Реестр «Платежи» платформы (online_payments/admin.md, «Дорожка 2»): только super_admin
// (гейт — видимость пункта меню и <Resource> в App.tsx), read-only. Источник — GET
// /admin/payments (backend.md п.7); totals по текущему фильтру — в PaymentsTotals (тот же
// ответ, без отдельного запроса, см. providers/dataProvider.ts).
export const PaymentList = () => (
  <List
    filters={paymentFilters}
    filterDefaultValues={{ hide_test: true }}
    sort={{ field: 'created_at', order: 'DESC' }}
    perPage={20}
    exporter={false}
    empty={false}
  >
    <DateRangeAlert />
    <PaymentsTotals />
    <PaymentDatagrid />
  </List>
);
