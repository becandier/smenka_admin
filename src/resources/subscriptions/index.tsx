import { useState } from 'react';
import {
  BooleanInput,
  Datagrid,
  DateField,
  FunctionField,
  List,
  SearchInput,
  SelectArrayInput,
  SelectInput,
  TextField,
  useListContext,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { usePlans } from '../../subscription/usePlans';
import type { AdminSubscriptionRow } from '../../subscription/SubscriptionContext';
import {
  SUBSCRIPTION_STATUS_CHOICES,
  SUBSCRIPTION_STATUS_COLOR,
  daysLeftLabel,
  subscriptionStatusLabel,
} from '../../utils/format';
import { SummaryTiles } from './SummaryTiles';
import { ExtendDialog } from './ExtendDialog';
import { EditDialog } from './EditDialog';
import { HistoryDialog } from './HistoryDialog';

// Фильтр по тарифу — выбор из живой витрины GET /plans, а не хардкод стандарт/премиум
// (тарифы могут добавляться, admin.md/backend.md, «цены и лимиты живут на бэке»).
const PlanCodeFilter = (props: { source: string; label: string }) => {
  const { plans } = usePlans();
  return (
    <SelectInput
      {...props}
      choices={plans.map((p) => ({ id: p.code, name: p.name }))}
      emptyText="Все"
    />
  );
};

const subscriptionFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Поиск по организации" />,
  <SelectArrayInput
    key="status"
    source="status"
    label="Статус"
    choices={SUBSCRIPTION_STATUS_CHOICES}
  />,
  <PlanCodeFilter key="plan_code" source="plan_code" label="Тариф" />,
  <BooleanInput
    key="expiring_soon"
    source="expiring_soon"
    label="Истекает в ближайшие 7 дней"
    alwaysOn
  />,
];

// «Сотрудники»/«Точки»: usage приходит в реестре, лимит — нет (backend.md п.4 отдаёт
// только usage, без limits) — довычисляем join'ом по plan_code с витриной GET /plans,
// «—» — если тариф безлимитный или ещё не загрузился.
const usageCell = (
  usage: number,
  planCode: string,
  limitOf: (code: string) => number | null | undefined,
): string => {
  const limit = limitOf(planCode);
  return limit === null || limit === undefined ? `${usage} / —` : `${usage} / ${limit}`;
};

const statusChip = (record: RaRecord) => (
  <Chip
    size="small"
    color={SUBSCRIPTION_STATUS_COLOR[record.status as string] ?? 'default'}
    label={subscriptionStatusLabel(record.status as string)}
  />
);

type DialogKind = 'extend' | 'edit' | 'history' | null;

const RowActions = ({ record }: { record: AdminSubscriptionRow }) => {
  const refresh = useRefresh();
  const [dialog, setDialog] = useState<DialogKind>(null);

  return (
    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
      <Button size="small" onClick={() => setDialog('extend')}>
        Продлить
      </Button>
      <Button size="small" onClick={() => setDialog('edit')}>
        Изменить
      </Button>
      <Button size="small" onClick={() => setDialog('history')}>
        История
      </Button>
      {dialog === 'extend' && (
        <ExtendDialog
          row={record}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog === 'edit' && (
        <EditDialog
          row={record}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog === 'history' && <HistoryDialog row={record} onClose={() => setDialog(null)} />}
    </Stack>
  );
};

const SubscriptionListEmpty = () => (
  <Typography sx={{ m: 4, textAlign: 'center' }} color="text.secondary">
    Организаций пока нет.
  </Typography>
);

// Datagrid как отдельный компонент (не инлайн в List): нужен доступ к isPending/data
// из useListContext, чтобы показать «Организаций пока нет» на пустой выдаче — Datagrid
// сам такого prop не имеет (тот же приём, что AdjustmentDatagrid в adjustments.tsx).
const SubscriptionDatagrid = () => {
  const { data, isPending } = useListContext();
  const { plans } = usePlans();
  const limitOf = (code: string): number | null | undefined =>
    plans.find((p) => p.code === code)?.limits.max_employees;
  const locationLimitOf = (code: string): number | null | undefined =>
    plans.find((p) => p.code === code)?.limits.max_locations;

  if (!isPending && (data ?? []).length === 0) return <SubscriptionListEmpty />;

  return (
    <Datagrid rowClick={false} bulkActionButtons={false}>
      <TextField source="organization_name" label="Организация" />
      <TextField source="plan_name" label="Тариф" sortable={false} />
      <FunctionField label="Статус" render={statusChip} sortable={false} />
      <DateField source="current_period_end" label="Окончание периода" showTime emptyText="—" />
      <FunctionField
        label="Осталось"
        sortable={false}
        render={(r: RaRecord) => daysLeftLabel(r.days_left as number | null)}
      />
      <FunctionField
        label="Сотрудники"
        sortable={false}
        render={(r: RaRecord) =>
          usageCell((r.usage as { employees: number }).employees, r.plan_code as string, limitOf)
        }
      />
      <FunctionField
        label="Точки"
        sortable={false}
        render={(r: RaRecord) =>
          usageCell(
            (r.usage as { locations: number }).locations,
            r.plan_code as string,
            locationLimitOf,
          )
        }
      />
      <TextField source="note" label="Заметка" emptyText="—" sortable={false} />
      <FunctionField
        label=""
        sortable={false}
        render={(r: RaRecord) => <RowActions record={r as AdminSubscriptionRow} />}
      />
    </Datagrid>
  );
};

// Реестр подписок (admin.md, «Раздел «Подписки»»): list-only (подписка появляется вместе
// с организацией, отдельного create нет), сортировка по умолчанию — ближайшее окончание
// сверху (совпадает с дефолтом бэка при отсутствии `sort` в query, backend.md п.4).
export const SubscriptionList = () => (
  <List
    filters={subscriptionFilters}
    sort={{ field: 'current_period_end', order: 'ASC' }}
    perPage={20}
    exporter={false}
    empty={false}
  >
    <SummaryTiles />
    <SubscriptionDatagrid />
  </List>
);
