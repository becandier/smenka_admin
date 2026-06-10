import { type ReactNode } from 'react';
import {
  List,
  Datagrid,
  DateField,
  TextField,
  EmailField,
  FunctionField,
  SelectInput,
  DateInput,
  Show,
  useGetList,
  useListContext,
  useDataProvider,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  checklistStatusLabel,
  formatDateTime,
  formatDuration,
  memberRoleLabel,
  shiftStatusLabel,
} from '../utils/format';
import { useAsync } from '../utils/useAsync';
import { INVALID_RANGE_MESSAGE, isDayRangeInvalid } from '../utils/dates';

const statusChoices = [
  { id: 'active', name: 'Активна' },
  { id: 'paused', name: 'На паузе' },
  { id: 'finished', name: 'Завершена' },
];

// Фильтр по сотруднику: значения — user_id, подписи — имена участников org.
const EmployeeFilter = (props: { source: string; alwaysOn?: boolean }) => {
  const { data } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const choices = (data ?? []).map((m) => ({ id: m.user_id, name: m.user_name }));
  return <SelectInput {...props} label="Сотрудник" choices={choices} />;
};

const shiftFilters = [
  <EmployeeFilter key="user_id" source="user_id" alwaysOn />,
  <SelectInput key="status" source="status" label="Статус" choices={statusChoices} alwaysOn />,
  // Окно по started_at, обе границы включительно; день → UTC-границы конвертирует dataProvider.
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
];

// Фильтр-форма react-admin не поддерживает валидацию инпутов, поэтому ошибку
// «date_from > date_to» показываем баннером над списком; сам запрос блокирует
// dataProvider до сети (превентивно, вместо серверного INVALID_DATE_RANGE).
const DateRangeAlert = () => {
  const { filterValues } = useListContext();
  if (!isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to)) return null;
  return (
    <Alert severity="error" sx={{ mb: 1 }}>
      {INVALID_RANGE_MESSAGE}
    </Alert>
  );
};

// Empty-state для пустого/отфильтрованного результата. Текст зависит от наличия
// активных фильтров (для отфильтрованного — формулировка из ТЗ).
const ShiftsEmpty = () => {
  const { filterValues } = useListContext();
  const filtered = Object.keys(filterValues ?? {}).length > 0;
  return (
    <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
      <Typography variant="h6">
        {filtered ? 'Смен по выбранным фильтрам нет' : 'Смен пока нет'}
      </Typography>
    </Box>
  );
};

// Render-хелперы колонок (вынесены из JSX — стабильны и единообразны).
const roleField = (r: RaRecord) => memberRoleLabel(r.role);
const statusField = (r: RaRecord) => shiftStatusLabel(r.status);
const durationField = (r: RaRecord) => formatDuration(r.worked_seconds);
const requiredBadge = (r: RaRecord) =>
  r.has_incomplete_required_checklists ? (
    <Chip size="small" color="warning" label="Есть незаполненные" />
  ) : (
    '—'
  );

// Тело списка. Пустоту обрабатываем сами через useListContext: проп <List empty>
// в react-admin v5 НЕ рендерится при активных фильтрах, а ТЗ требует кастомный
// empty-state и для отфильтрованного результата (фильтр по сотруднику без смен).
const OrgShiftDatagrid = () => {
  const { isPending, data, filterValues } = useListContext();
  // При невалидном диапазоне запрос заблокирован (см. DateRangeAlert) — не показываем
  // вводящий в заблуждение empty-state/устаревшие данные под баннером ошибки.
  if (isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to)) return null;
  if (!isPending && (data ?? []).length === 0) return <ShiftsEmpty />;
  return (
    <Datagrid bulkActionButtons={false} rowClick="show">
      <TextField source="user_name" label="Сотрудник" emptyText="—" sortable={false} />
      <EmailField source="user_email" label="Email" emptyText="—" sortable={false} />
      <FunctionField label="Роль" render={roleField} />
      <TextField source="custom_role_name" label="Кастомная роль" emptyText="—" sortable={false} />
      <FunctionField label="Статус" render={statusField} />
      <DateField source="started_at" label="Начало" showTime />
      <DateField source="finished_at" label="Конец" showTime emptyText="—" />
      <FunctionField label="Отработано" render={durationField} />
      <FunctionField label="Чек-листы" render={requiredBadge} />
    </Datagrid>
  );
};

// Список орг-смен: серверная пагинация, колонки сотрудника из ShiftResponse,
// строка кликабельна → деталь чужой смены (Show). Сортировка только по датам.
// empty={false} — отключаем встроенную empty-страницу, рендерим свою в любом случае.
export const OrgShiftList = () => (
  <List
    filters={shiftFilters}
    sort={{ field: 'started_at', order: 'DESC' }}
    exporter={false}
    empty={false}
  >
    <DateRangeAlert />
    <OrgShiftDatagrid />
  </List>
);

// Строка «подпись: значение» в карточке детали.
const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ minWidth: 160 }} color="text.secondary">
      {label}
    </Typography>
    <Typography>{children}</Typography>
  </Box>
);

// Шапка детали смены: данные сотрудника (nullable → «—») + тайминги.
const ShiftHeader = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Stack spacing={0.5}>
      <InfoRow label="Сотрудник">{record.user_name ?? '—'}</InfoRow>
      <InfoRow label="Email">{record.user_email ?? '—'}</InfoRow>
      <InfoRow label="Роль">{memberRoleLabel(record.role)}</InfoRow>
      <InfoRow label="Кастомная роль">{record.custom_role_name ?? '—'}</InfoRow>
      <InfoRow label="Статус">{shiftStatusLabel(record.status)}</InfoRow>
      <InfoRow label="Начало">{formatDateTime(record.started_at)}</InfoRow>
      <InfoRow label="Конец">
        {record.finished_at ? formatDateTime(record.finished_at) : '—'}
      </InfoRow>
      <InfoRow label="Отработано">{formatDuration(record.worked_seconds)}</InfoRow>
    </Stack>
  );
};

const pauseSeconds = (started: string, finished: string | null): number | null => {
  if (!finished) return null;
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  return Number.isNaN(ms) ? null : Math.max(0, ms / 1000);
};

// Блок пауз смены.
const PausesBlock = () => {
  const record = useRecordContext();
  const pauses: any[] = record?.pauses ?? [];
  if (pauses.length === 0) return <Typography color="text.secondary">Пауз не было</Typography>;
  return (
    <Stack spacing={1}>
      {pauses.map((p) => {
        const secs = pauseSeconds(p.started_at, p.finished_at ?? null);
        return (
          <Box key={p.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography>{formatDateTime(p.started_at)}</Typography>
            <Typography color="text.secondary">→</Typography>
            <Typography>{p.finished_at ? formatDateTime(p.finished_at) : 'активна'}</Typography>
            <Chip size="small" label={secs === null ? '—' : formatDuration(secs)} />
          </Box>
        );
      })}
    </Stack>
  );
};

// Пункты конкретного чек-листа (ленивая подгрузка при раскрытии).
const ChecklistInstanceItems = ({
  shiftId,
  instanceId,
}: {
  shiftId: string;
  instanceId: string;
}) => {
  const dataProvider = useDataProvider();
  const { data, error } = useAsync<any>(
    () => dataProvider.getShiftChecklistInstance(shiftId, instanceId),
    [shiftId, instanceId],
  );

  if (error) return <Typography color="error">Не удалось загрузить пункты</Typography>;
  if (!data) return <CircularProgress size={18} />;
  const items: any[] = data.items ?? [];
  if (items.length === 0) return <Typography color="text.secondary">Пунктов нет</Typography>;

  return (
    <Stack spacing={0.5}>
      {items.map((it) => (
        <Box key={it.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
          <Typography sx={{ width: 16 }}>{it.is_completed ? '✓' : '○'}</Typography>
          <Typography sx={{ flex: 1 }}>
            {it.text}
            {it.is_required ? ' *' : ''}
          </Typography>
          {it.comment && (
            <Typography variant="body2" color="text.secondary">
              {it.comment}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
};

// Чек-листы смены: список из GET /shifts/{id}/checklists, пункты — по раскрытию.
const ShiftChecklists = () => {
  const record = useRecordContext();
  const dataProvider = useDataProvider();
  const shiftId = record?.id ? String(record.id) : null;
  const { data: items, error } = useAsync<any[] | null>(
    () => (shiftId ? dataProvider.getShiftChecklists(shiftId) : Promise.resolve(null)),
    [shiftId],
  );

  if (error) return <Typography color="error">Не удалось загрузить чек-листы</Typography>;
  if (!items) return <CircularProgress size={20} />;
  if (items.length === 0) return <Typography color="text.secondary">Чек-листов нет</Typography>;

  return (
    <Box>
      {items.map((it) => (
        <Accordion key={it.id} disableGutters TransitionProps={{ unmountOnExit: true }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ minWidth: 200 }}>{it.name}</Typography>
              <Chip size="small" label={it.type === 'shift_start' ? 'Начало' : 'Конец'} />
              <Chip size="small" label={checklistStatusLabel(it.status)} />
              <Typography variant="body2" color="text.secondary">
                {it.items_summary?.completed ?? 0}/{it.items_summary?.total ?? 0}
              </Typography>
              {it.is_required && <Chip size="small" color="warning" label="Обязательный" />}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {shiftId && <ChecklistInstanceItems shiftId={shiftId} instanceId={String(it.id)} />}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

const SectionCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card sx={{ mb: 2 }}>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {children}
    </CardContent>
  </Card>
);

// Деталь чужой орг-смены (read-only): шапка + паузы + чек-листы.
export const OrgShiftShow = () => (
  <Show component="div" title="Смена сотрудника">
    <Box sx={{ pt: 2 }}>
      <SectionCard title="Смена">
        <ShiftHeader />
      </SectionCard>
      <SectionCard title="Паузы">
        <PausesBlock />
      </SectionCard>
      <SectionCard title="Чек-листы">
        <ShiftChecklists />
      </SectionCard>
    </Box>
  </Show>
);
