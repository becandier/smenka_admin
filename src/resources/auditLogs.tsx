import {
  List,
  Datagrid,
  DateField,
  TextField,
  FunctionField,
  SelectInput,
  DateInput,
  useListContext,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { Box, Stack, Typography } from '@mui/material';
import { AUDIT_ACTION_CHOICES, auditActionLabel, auditResourceLabel } from '../utils/audit';
import { isDayRangeInvalid } from '../utils/dates';
import { MemberSelectFilter } from '../components/MemberSelectFilter';
import { DateRangeAlert } from '../components/DateRangeAlert';

// summary — jsonb произвольной формы: объектом считаем только не-null, не-массив.
const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const auditFilters = [
  <SelectInput
    key="action"
    source="action"
    label="Действие"
    choices={AUDIT_ACTION_CHOICES}
    alwaysOn
  />,
  // Фильтр по инициатору: значения — actor_user_id (=user_id участника), подписи — имена.
  // Лента может содержать действия уже удалённых участников/системы — предлагаем текущих
  // членов org; этого достаточно по контракту (выборка по actor_user_id).
  <MemberSelectFilter key="actor_user_id" source="actor_user_id" label="Инициатор" alwaysOn />,
  // Окно по created_at, обе границы включительно; день → UTC-границы конвертирует dataProvider.
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
];

// Человекочитаемые лейблы колонок (вынесены из JSX — стабильны и единообразны).
const actorField = (r: RaRecord) => r.actor_name || 'Система';
const actionField = (r: RaRecord) => auditActionLabel(r.action);
const resourceTypeField = (r: RaRecord) => auditResourceLabel(r.resource_type);

// Раскрытие строки: читаемый дифф «до/после» из summary без сырого JSON, где возможно.
const SummaryRow = ({ label, value }: { label: string; value: unknown }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ minWidth: 200 }} color="text.secondary">
      {label}
    </Typography>
    <Typography sx={{ wordBreak: 'break-word' }}>{formatSummaryValue(value)}</Typography>
  </Box>
);

// Примитив → строка; объект/массив → компактный JSON (последняя линия обороны).
const formatSummaryValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '—';
};

// Дифф before/after: показываем ключи, которые изменились (старое → новое).
const DiffBlock = ({ before, after }: { before: unknown; after: unknown }) => {
  const b = asObject(before);
  const a = asObject(after);
  // before/after могут быть примитивами (jsonb) — тогда показываем их как есть, а не Object.keys.
  if (!b && !a) {
    return (
      <Stack spacing={0.5}>
        <SummaryRow label="Было" value={before} />
        <SummaryRow label="Стало" value={after} />
      </Stack>
    );
  }
  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]));
  if (keys.length === 0) return <Typography color="text.secondary">Без изменений полей</Typography>;
  return (
    <Stack spacing={0.5}>
      {keys.map((key) => (
        <Box key={key} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Typography sx={{ minWidth: 200 }} color="text.secondary">
            {key}
          </Typography>
          <Typography sx={{ wordBreak: 'break-word' }}>{formatSummaryValue(b?.[key])}</Typography>
          <Typography color="text.secondary">→</Typography>
          <Typography sx={{ wordBreak: 'break-word' }}>{formatSummaryValue(a?.[key])}</Typography>
        </Box>
      ))}
    </Stack>
  );
};

const AuditExpand = () => {
  const record = useRecordContext();
  const s = asObject(record?.summary);
  if (!s) {
    return <Typography color="text.secondary">Деталей нет</Typography>;
  }
  const hasDiff = 'before' in s || 'after' in s;
  return (
    <Box sx={{ py: 1 }}>
      {hasDiff ? (
        <DiffBlock before={s.before} after={s.after} />
      ) : (
        <Stack spacing={0.5}>
          {Object.entries(s).map(([key, value]) => (
            <SummaryRow key={key} label={key} value={value} />
          ))}
        </Stack>
      )}
      {record?.resource_id && <SummaryRow label="ID объекта" value={record.resource_id} />}
    </Box>
  );
};

const AuditEmpty = () => (
  <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
    <Typography variant="h6">Событий аудита пока нет</Typography>
  </Box>
);

const AuditDatagrid = () => {
  const { isPending, data, filterValues } = useListContext();
  // При невалидном диапазоне запрос заблокирован — не показываем устаревшие данные/empty.
  if (isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to)) return null;
  if (!isPending && (data ?? []).length === 0) return <AuditEmpty />;
  return (
    // Read-only: без bulk-действий, без rowClick-мутаций; детали — в раскрытии строки.
    <Datagrid bulkActionButtons={false} rowClick={false} expand={<AuditExpand />}>
      <DateField source="created_at" label="Когда" showTime />
      <FunctionField label="Инициатор" render={actorField} />
      <FunctionField label="Действие" render={actionField} />
      <FunctionField label="Объект" render={resourceTypeField} />
      <TextField source="resource_id" label="ID объекта" emptyText="—" sortable={false} />
      <TextField source="ip_address" label="IP" emptyText="—" sortable={false} />
    </Datagrid>
  );
};

// Лента аудита организации (read-only): серверная пагинация и фильтры,
// сортировка фиксирована на бэке (created_at DESC), записи неизменяемы.
export const AuditLogList = () => (
  <List
    filters={auditFilters}
    sort={{ field: 'created_at', order: 'DESC' }}
    exporter={false}
    empty={false}
  >
    <DateRangeAlert />
    <AuditDatagrid />
  </List>
);

// Деталь/summary показываем в раскрытии строки, отдельный <Show> не нужен:
// бэк не отдаёт GET одной записи, а summary уже есть в элементе ленты.
