import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  List,
  Datagrid,
  DateField,
  TextField,
  EmailField,
  FunctionField,
  SelectInput,
  DateInput,
  NullableBooleanInput,
  Show,
  useListContext,
  useGetList,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { Box, Button, Card, CardContent, Chip, Stack, Tooltip, Typography } from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { checklistReportStatusLabel, formatDateTime } from '../utils/format';
import { isDayRangeInvalid } from '../utils/dates';
import { MemberSelectFilter } from '../components/MemberSelectFilter';
import { DateRangeAlert } from '../components/DateRangeAlert';
import { ChecklistItemPhotos } from '../components/ChecklistItemPhotos';
import { useCurrentOrg } from '../orgContext';

const typeChoices = [
  { id: 'shift_start', name: 'Начало смены' },
  { id: 'shift_end', name: 'Конец смены' },
];

const typeLabel = (type: string | null | undefined): string =>
  type === 'shift_end' ? 'Конец смены' : 'Начало смены';

// Статус экземпляра (фильтр «Статус» — три значения ровно как в чек-листах: pending/
// completed/incomplete). Отдельно от «Состояние» (агрегат заполнен/не заполнен).
const statusChoices = [
  { id: 'pending', name: 'Не заполнен' },
  { id: 'completed', name: 'Заполнен' },
  { id: 'incomplete', name: 'Не заполнен, смена закрыта' },
];

// Состояние — агрегированный фильтр «заполнен/нет» (backend.md: state=completed ИЛИ
// not_completed, взаимоисключим со status — приоритет у status на бэке).
const stateChoices = [
  { id: 'completed', name: 'Заполнены' },
  { id: 'not_completed', name: 'Не заполнены' },
];

// Селект-фильтр по шаблонам организации (список — как MemberSelectFilter, только источник
// checklist-templates). Единственное место использования — не выносим в components/.
const TemplateSelectFilter = (props: { source: string; label: string }) => {
  const { data } = useGetList('checklist-templates', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const choices = useMemo(() => (data ?? []).map((t) => ({ id: t.id, name: t.name })), [data]);
  return <SelectInput {...props} choices={choices} />;
};

// Селект-фильтр по точкам организации — тот же приём, источник work-locations.
const WorkLocationSelectFilter = (props: { source: string; label: string }) => {
  const { data } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const choices = useMemo(() => (data ?? []).map((l) => ({ id: l.id, name: l.name })), [data]);
  return <SelectInput {...props} choices={choices} />;
};

const checklistInstanceFilters = [
  <MemberSelectFilter key="user_id" source="user_id" label="Сотрудник" alwaysOn />,
  <SelectInput key="state" source="state" label="Состояние" choices={stateChoices} alwaysOn />,
  <SelectInput key="status" source="status" label="Статус" choices={statusChoices} />,
  <TemplateSelectFilter key="template_id" source="template_id" label="Шаблон" />,
  <SelectInput key="type" source="type" label="Тип" choices={typeChoices} />,
  <WorkLocationSelectFilter key="work_location_id" source="work_location_id" label="Точка" />,
  // Tri-state (не голый BooleanInput): пустое/false/true. Обычный BooleanInput как фильтр
  // регистрируется со значением false ещё до клика, из-за чего сразу после добавления
  // фильтра ушёл бы is_required=false — забирая «необязательные» вместо «без фильтра».
  <NullableBooleanInput
    key="is_required"
    source="is_required"
    label="Обязательный"
    nullLabel="Все"
    falseLabel="Только необязательные"
    trueLabel="Только обязательные"
  />,
  // Окно по shift_started_at, обе границы включительно; день → UTC-границы конвертирует
  // dataProvider (та же валидация диапазона, что на странице смен).
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
];

// Фильтры по сущностям чужой организации (сотрудник/шаблон/точка) не должны «протекать»
// при переключении org в OrgSwitcher (admin.md, «Состояния»): сбрасываем их при смене org.id.
const ENTITY_FILTER_KEYS = ['user_id', 'template_id', 'work_location_id'];

const ResetEntityFiltersOnOrgChange = () => {
  const { org } = useCurrentOrg();
  const { filterValues, setFilters } = useListContext();
  const prevOrgId = useRef<string | null>(org?.id ?? null);

  useEffect(() => {
    const currentOrgId = org?.id ?? null;
    if (prevOrgId.current === currentOrgId) return;
    prevOrgId.current = currentOrgId;
    const next = { ...filterValues };
    let changed = false;
    for (const key of ENTITY_FILTER_KEYS) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    }
    if (changed) setFilters(next, undefined, false);
    // filterValues читаем в момент смены org.id — не пере-подписываемся на каждое
    // изменение фильтров, иначе эффект будет дёргаться при обычном вводе фильтра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  return null;
};

// Empty-state: разный текст для «пусто вообще» и «пусто по фильтрам» (по образцу ShiftsEmpty
// в orgShifts.tsx).
const ChecklistInstancesEmpty = () => {
  const { filterValues } = useListContext();
  const filtered = Object.keys(filterValues ?? {}).length > 0;
  return (
    <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
      <Typography variant="h6">
        {filtered ? 'Чек-листов по выбранным фильтрам нет' : 'Чек-листов пока нет'}
      </Typography>
    </Box>
  );
};

const workLocationName = (r: RaRecord) => r.work_location?.name ?? '—';

const workLocationLabel = (
  wl: { name?: string | null; address?: string | null } | null,
): string => {
  if (!wl) return '—';
  const name = wl.name ?? '—';
  return wl.address ? `${name} · ${wl.address}` : name;
};

const requiredChip = (r: RaRecord) =>
  r.is_required ? <Chip size="small" label="Обязательный" /> : '—';

const STATUS_CHIP_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  completed: 'success',
  pending: 'warning',
  incomplete: 'error',
};

const statusChip = (r: RaRecord) => (
  <Chip
    size="small"
    color={STATUS_CHIP_COLOR[r.status as string] ?? 'default'}
    label={checklistReportStatusLabel(r.status)}
  />
);

const nameCell = (r: RaRecord) => (
  <Stack spacing={0.25}>
    <Typography>{r.name}</Typography>
    <Chip size="small" variant="outlined" label={typeLabel(r.type)} />
  </Stack>
);

const itemsSummaryCell = (r: RaRecord) => {
  const s = (r.items_summary ?? {}) as {
    total?: number;
    completed?: number;
    photos_required_missing?: number;
  };
  const total = s.total ?? 0;
  const completed = s.completed ?? 0;
  const missing = s.photos_required_missing ?? 0;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Typography variant="body2">
        {completed}/{total}
      </Typography>
      {missing > 0 && (
        <Tooltip title="Не хватает обязательного фото">
          <PhotoCameraOutlinedIcon fontSize="small" color="warning" />
        </Tooltip>
      )}
    </Stack>
  );
};

const photosCountCell = (r: RaRecord) => {
  const count: number = r.photos_count ?? 0;
  if (count === 0) return '—';
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <PhotoCameraOutlinedIcon fontSize="small" />
      <Typography variant="body2">{count}</Typography>
    </Stack>
  );
};

const ChecklistInstanceDatagrid = () => {
  const { isPending, data, filterValues } = useListContext();
  // При невалидном диапазоне запрос заблокирован (см. DateRangeAlert) — не показываем
  // вводящий в заблуждение empty-state/устаревшие данные под баннером ошибки.
  if (isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to)) return null;
  if (!isPending && (data ?? []).length === 0) return <ChecklistInstancesEmpty />;
  return (
    <Datagrid bulkActionButtons={false} rowClick="show">
      <FunctionField label="Чек-лист" render={nameCell} />
      <TextField source="user_name" label="Сотрудник" emptyText="—" sortable={false} />
      <EmailField source="user_email" label="Email" emptyText="—" sortable={false} />
      <DateField source="shift_started_at" label="Смена" showTime />
      <FunctionField label="Точка" render={workLocationName} />
      <FunctionField label="Статус" render={statusChip} />
      <FunctionField label="Обязательный" render={requiredChip} />
      <FunctionField label="Пункты" render={itemsSummaryCell} />
      <FunctionField label="Фото" render={photosCountCell} />
      <DateField source="completed_at" label="Заполнен" showTime emptyText="—" />
    </Datagrid>
  );
};

// Реестр экземпляров чек-листов организации: серверная пагинация через
// GET /organizations/{org}/checklist-instances (checklist_reports/backend.md).
export const ChecklistInstanceList = () => (
  <List
    filters={checklistInstanceFilters}
    sort={{ field: 'shift_started_at', order: 'DESC' }}
    exporter={false}
    empty={false}
  >
    <ResetEntityFiltersOnOrgChange />
    <DateRangeAlert />
    <ChecklistInstanceDatagrid />
  </List>
);

// Строка «подпись: значение» в шапке детали (тот же приём, что InfoRow в orgShifts.tsx).
const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ minWidth: 160 }} color="text.secondary">
      {label}
    </Typography>
    <Typography>{children}</Typography>
  </Box>
);

const ChecklistInstanceHeader = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Stack spacing={0.5}>
      <InfoRow label="Чек-лист">{record.name}</InfoRow>
      <InfoRow label="Тип">{typeLabel(record.type)}</InfoRow>
      <InfoRow label="Статус">
        <Chip
          size="small"
          color={STATUS_CHIP_COLOR[record.status as string] ?? 'default'}
          label={checklistReportStatusLabel(record.status)}
        />
      </InfoRow>
      <InfoRow label="Обязательный">{record.is_required ? 'Да' : 'Нет'}</InfoRow>
      <InfoRow label="Сотрудник">{record.user_name ?? '—'}</InfoRow>
      <InfoRow label="Email">{record.user_email ?? '—'}</InfoRow>
      <InfoRow label="Точка">{workLocationLabel(record.work_location ?? null)}</InfoRow>
      <InfoRow label="Начало смены">{formatDateTime(record.shift_started_at)}</InfoRow>
      <InfoRow label="Конец смены">
        {record.shift_finished_at ? formatDateTime(record.shift_finished_at) : '—'}
      </InfoRow>
      <InfoRow label="Заполнен">
        {record.completed_at ? formatDateTime(record.completed_at) : '—'}
      </InfoRow>
      {record.shift_id && (
        <Box sx={{ pt: 1 }}>
          <Button
            component={RouterLink}
            to={`/org-shifts/${record.shift_id}/show`}
            size="small"
            startIcon={<OpenInNewIcon />}
          >
            Открыть смену
          </Button>
        </Box>
      )}
    </Stack>
  );
};

// Пункты экземпляра — read-only: без отметок/комментариев/удаления (в отличие от мобилки).
// photos — тот же ChecklistItemPhotos, что и в детали смены (orgShifts.tsx).
const ChecklistInstanceItemsList = () => {
  const record = useRecordContext();
  const items: any[] = record?.items ?? [];
  if (items.length === 0) return <Typography color="text.secondary">Пунктов нет</Typography>;
  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <Stack spacing={1.5}>
      {sorted.map((it) => {
        const photos: any[] = it.photos ?? [];
        const photosCount: number = it.photos_count ?? photos.length;
        const requirement: string = it.photo_requirement ?? 'none';
        // Пункт с обязательным фото и нулём фото — визуально помечен как незакрытый.
        const missingRequired = requirement === 'required' && photosCount === 0;
        return (
          <Box key={it.id}>
            <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
              <Typography sx={{ width: 16 }}>{it.is_completed ? '✓' : '○'}</Typography>
              <Typography sx={{ flex: 1, minWidth: 200 }}>
                {it.text}
                {it.is_required ? ' *' : ''}
              </Typography>
              {photosCount > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  icon={<PhotoCameraOutlinedIcon />}
                  label={`Фото: ${photosCount}`}
                />
              )}
              {missingRequired && (
                <Chip
                  size="small"
                  color={it.is_required ? 'error' : 'default'}
                  variant={it.is_required ? 'filled' : 'outlined'}
                  label={it.is_required ? 'Нет обязательного фото' : 'Нет фото'}
                />
              )}
              {it.completed_at && (
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(it.completed_at)}
                </Typography>
              )}
            </Stack>
            {it.comment && (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 3 }}>
                {it.comment}
              </Typography>
            )}
            {photos.length > 0 && (
              <Box sx={{ pl: 3 }}>
                <ChecklistItemPhotos photos={photos} photoSource={it.photo_source} />
              </Box>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

// Деталь экземпляра чек-листа (read-only): шапка + пункты. Открывается по уже существующему
// GET /shifts/{shift_id}/checklists/{instance_id} (см. getOne в dataProvider).
export const ChecklistInstanceShow = () => (
  <Show component="div" title="Чек-лист">
    <Box sx={{ pt: 2 }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Экземпляр чек-листа
          </Typography>
          <ChecklistInstanceHeader />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Пункты
          </Typography>
          <ChecklistInstanceItemsList />
        </CardContent>
      </Card>
    </Box>
  </Show>
);
