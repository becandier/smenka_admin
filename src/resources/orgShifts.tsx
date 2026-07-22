import { useState, type ReactNode } from 'react';
import {
  List,
  Datagrid,
  DateField,
  TextField,
  EmailField,
  FunctionField,
  SelectInput,
  BooleanInput,
  DateInput,
  Show,
  useListContext,
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import {
  checklistStatusLabel,
  finishReasonLabel,
  formatDateTime,
  formatDateTimeInTz,
  formatDuration,
  memberRoleLabel,
  overtimeStatusLabel,
  scheduleErrorMessage,
  shiftStatusLabel,
} from '../utils/format';
import { formatMemberNameFlat } from '../utils/memberName';
import { useAsync } from '../utils/useAsync';
import { useOrgTimezone } from '../utils/useOrgTimezone';
import { isDayRangeInvalid } from '../utils/dates';
import { MemberSelectFilter } from '../components/MemberSelectFilter';
import { MemberNameCell } from '../components/MemberNameCell';
import { DateRangeAlert } from '../components/DateRangeAlert';
import { ChecklistItemPhotos } from '../components/ChecklistItemPhotos';
import { ShiftPenaltySection } from './penalties';

const statusChoices = [
  { id: 'active', name: 'Активна' },
  { id: 'paused', name: 'На паузе' },
  { id: 'finished', name: 'Завершена' },
];

// Состояние чек-листов смены (checklist_reports/backend.md): считается на лету по
// checklist_instances смены, в отличие от has_incomplete_required_checklists (ставится только
// при завершении и врёт для активных/паузных смен).
const checklistsFilterChoices = [
  { id: 'none', name: 'Без чек-листов' },
  { id: 'all_completed', name: 'Все заполнены' },
  { id: 'has_incomplete', name: 'Есть незаполненные' },
  { id: 'required_incomplete', name: 'Есть незаполненные обязательные' },
];

// work_schedules: состояние заявки на переработку у смены (has_overtime, backend.md).
const overtimeFilterChoices = [
  { id: 'pending', name: 'На согласовании' },
  { id: 'approved', name: 'Согласована' },
  { id: 'any', name: 'Есть заявка (любой статус)' },
];

// Фильтр по графику: выбор — по названиям графиков организации (архивные тоже видны,
// на них могли идти смены до архивации). useGetList — тот же приём, что MemberSelectFilter.
const WorkScheduleSelectFilter = (props: { source: string; label: string }) => {
  const { data } = useGetList('work-schedules', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
    filter: { include_archived: true },
  });
  const choices = (data ?? []).map((s) => ({ id: s.id, name: s.name }));
  return <SelectInput {...props} choices={choices} emptyText="Любой" />;
};

const shiftFilters = [
  <MemberSelectFilter key="user_id" source="user_id" label="Сотрудник" alwaysOn />,
  <SelectInput key="status" source="status" label="Статус" choices={statusChoices} alwaysOn />,
  // Окно по started_at, обе границы включительно; день → UTC-границы конвертирует dataProvider.
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
  <SelectInput
    key="checklists"
    source="checklists"
    label="Чек-листы"
    choices={checklistsFilterChoices}
  />,
  // work_schedules: только опоздавшие / по графику / по состоянию переработки.
  <BooleanInput key="only_late" source="only_late" label="Только опоздавшие" />,
  <WorkScheduleSelectFilter key="work_schedule_id" source="work_schedule_id" label="График" />,
  <SelectInput
    key="has_overtime"
    source="has_overtime"
    label="Переработка"
    choices={overtimeFilterChoices}
  />,
];

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
// Колонка «Сотрудник» — единое правило отображения (member_display_name/admin.md).
const nameField = (r: RaRecord) => (
  <MemberNameCell user_name={r.user_name} display_name={r.display_name} />
);
const roleField = (r: RaRecord) => memberRoleLabel(r.role);
const statusField = (r: RaRecord) => shiftStatusLabel(r.status);
const durationField = (r: RaRecord) => formatDuration(r.worked_seconds);
// Точка смены: денормализованный work_location { name, address } | null (см. backend.md).
const workLocationName = (r: RaRecord) => r.work_location?.name ?? '—';
const workLocationLabel = (
  wl: { name?: string | null; address?: string | null } | null,
): string => {
  if (!wl) return '—';
  const name = wl.name ?? '—';
  return wl.address ? `${name} · ${wl.address}` : name;
};
// Сводка чек-листов смены (checklists_summary, checklist_reports/backend.md): считается на
// лету, в отличие от has_incomplete_required_checklists (только на завершении, врёт для
// активных/паузных смен — колонка на него больше не опирается).
interface ChecklistsSummary {
  total: number;
  completed: number;
  required_total: number;
  required_incomplete: number;
}

const checklistsSummaryCell = (r: RaRecord) => {
  const summary = (r.checklists_summary ?? null) as ChecklistsSummary | null;
  if (!summary || summary.total === 0) return '—';
  const { total, completed, required_incomplete } = summary;
  const label =
    required_incomplete > 0 ? `${completed}/${total} · есть обязательные` : `${completed}/${total}`;
  const color: 'success' | 'warning' | 'default' =
    required_incomplete > 0 ? 'warning' : completed < total ? 'default' : 'success';
  return (
    <Tooltip title={`Заполнено чек-листов: ${completed} из ${total}`}>
      <Chip size="small" color={color} label={label} />
    </Tooltip>
  );
};

// work_schedules: колонка «График» — название или «—» (смена без графика).
const scheduleField = (r: RaRecord) => r.schedule_name ?? '—';

// «Опоздание» — только если поздно; поздно и графика нет → «—» (не путать с «опоздания нет»).
const lateField = (r: RaRecord) => {
  const seconds = typeof r.late_seconds === 'number' ? r.late_seconds : null;
  if (!seconds || seconds <= 0) return '—';
  return <Chip size="small" color="warning" label={formatDuration(seconds)} />;
};

// Заявка на переработку смены (ShiftResponse.overtime, backend.md): «30 мин · на согласовании».
interface OvertimeSummary {
  minutes: number;
  status: string;
}
const overtimeField = (r: RaRecord) => {
  const overtime = (r.overtime ?? null) as OvertimeSummary | null;
  if (!overtime) return '—';
  const color: 'warning' | 'success' | 'default' =
    overtime.status === 'pending'
      ? 'warning'
      : overtime.status === 'approved'
        ? 'success'
        : 'default';
  return (
    <Chip
      size="small"
      color={color}
      label={`${overtime.minutes} мин · ${overtimeStatusLabel(overtime.status)}`}
    />
  );
};

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
      <FunctionField label="Сотрудник" render={nameField} sortable={false} />
      <EmailField source="user_email" label="Email" emptyText="—" sortable={false} />
      <FunctionField label="Роль" render={roleField} />
      <TextField source="custom_role_name" label="Кастомная роль" emptyText="—" sortable={false} />
      <FunctionField label="Статус" render={statusField} />
      <DateField source="started_at" label="Начало" showTime />
      <DateField source="finished_at" label="Конец" showTime emptyText="—" />
      <FunctionField label="Отработано" render={durationField} />
      <FunctionField label="Точка" render={workLocationName} sortable={false} />
      <FunctionField label="Чек-листы" render={checklistsSummaryCell} />
      <FunctionField label="График" render={scheduleField} sortable={false} />
      <FunctionField label="Опоздание" render={lateField} sortable={false} />
      <FunctionField label="Переработка" render={overtimeField} sortable={false} />
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
      <InfoRow label="Сотрудник">
        {formatMemberNameFlat({ user_name: record.user_name, display_name: record.display_name })}
      </InfoRow>
      <InfoRow label="Email">{record.user_email ?? '—'}</InfoRow>
      <InfoRow label="Роль">{memberRoleLabel(record.role)}</InfoRow>
      <InfoRow label="Кастомная роль">{record.custom_role_name ?? '—'}</InfoRow>
      <InfoRow label="Статус">{shiftStatusLabel(record.status)}</InfoRow>
      <InfoRow label="Точка">{workLocationLabel(record.work_location ?? null)}</InfoRow>
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
    <Stack spacing={1}>
      {items.map((it) => {
        const photos: any[] = it.photos ?? [];
        // photos_count/photo_requirement — optional (старый бэк): дефолты-фолбэки.
        const photosCount: number = it.photos_count ?? photos.length;
        const requirement: string = it.photo_requirement ?? 'none';
        // Бейдж «фото отсутствует» только для required без фото. Градация по is_required:
        // обязательный пункт без фото → incomplete (критичный); необязательный → информативный.
        const missingRequired = requirement === 'required' && photosCount === 0;
        return (
          <Box key={it.id}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
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
              {it.comment && (
                <Typography variant="body2" color="text.secondary">
                  {it.comment}
                </Typography>
              )}
            </Box>
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
      {items.map((it) => {
        const summary = it.items_summary ?? {};
        const total: number = summary.total ?? 0;
        // Честный прогресс по satisfied_count (учитывает обязательное фото); фолбэк на
        // completed для старого бэка без поля.
        const progress: number = summary.satisfied_count ?? summary.completed ?? 0;
        const photosMissing: number = summary.photos_required_missing ?? 0;
        return (
          <Accordion key={it.id} disableGutters TransitionProps={{ unmountOnExit: true }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ minWidth: 200 }}>{it.name}</Typography>
                <Chip size="small" label={it.type === 'shift_start' ? 'Начало' : 'Конец'} />
                <Chip size="small" label={checklistStatusLabel(it.status)} />
                <Typography variant="body2" color="text.secondary">
                  {progress}/{total}
                </Typography>
                {it.is_required && <Chip size="small" color="warning" label="Обязательный" />}
                {photosMissing > 0 && (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    icon={<PhotoCameraOutlinedIcon />}
                    label={`Без обязательного фото: ${photosMissing}`}
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {shiftId && <ChecklistInstanceItems shiftId={shiftId} instanceId={String(it.id)} />}
            </AccordionDetails>
          </Accordion>
        );
      })}
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

// Диалог смены графика администратором (work_schedules R7): селект графиков организации
// (архивные тоже доступны — исправление задним числом) + «Без графика». PATCH .../shifts/{id}/schedule
// пересчитывает scheduled_*/late_seconds от НЕИЗМЕННОГО started_at; фактическое время не меняется.
const ChangeScheduleDialog = ({
  shiftId,
  currentScheduleId,
  onClose,
  onDone,
}: {
  shiftId: string;
  currentScheduleId: string | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [scheduleId, setScheduleId] = useState<string>(currentScheduleId ?? '');
  const [saving, setSaving] = useState(false);
  const { data: schedules } = useGetList('work-schedules', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
    filter: { include_archived: true },
  });

  const submit = async () => {
    setSaving(true);
    try {
      await dataProvider.changeShiftSchedule(shiftId, scheduleId === '' ? null : scheduleId);
      notify('График смены обновлён', { type: 'success' });
      onDone();
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Не удалось изменить график'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Изменить график смены</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Плановое время и опоздание будут пересчитаны; фактическое время смены не изменится.
        </DialogContentText>
        <Select
          fullWidth
          size="small"
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          <MenuItem value="">— без графика —</MenuItem>
          {(schedules ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
              {s.is_archived ? ' (архив)' : ''}
            </MenuItem>
          ))}
        </Select>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Блок «План»: плановое окно графика в таймзоне организации, факт, опоздание, причина
// завершения (work_schedules, admin.md §3) + действие «Изменить график» (R7).
const ShiftPlanSection = () => {
  const record = useRecordContext();
  const refresh = useRefresh();
  const tz = useOrgTimezone();
  const [dialogOpen, setDialogOpen] = useState(false);
  if (!record) return null;

  const hasSchedule = Boolean(record.work_schedule_id) || Boolean(record.scheduled_start_at);

  return (
    <SectionCard title="План">
      <Stack spacing={0.5}>
        <InfoRow label="График">{record.schedule_name ?? '—'}</InfoRow>
        <InfoRow label="Плановое начало">
          {formatDateTimeInTz(record.scheduled_start_at, tz)}
        </InfoRow>
        <InfoRow label="Плановый конец">{formatDateTimeInTz(record.scheduled_end_at, tz)}</InfoRow>
        <InfoRow label="Опоздание">
          {typeof record.late_seconds === 'number' && record.late_seconds > 0
            ? formatDuration(record.late_seconds)
            : '—'}
        </InfoRow>
        <InfoRow label="Причина завершения">{finishReasonLabel(record.finish_reason)}</InfoRow>
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        <Button size="small" startIcon={<EditCalendarIcon />} onClick={() => setDialogOpen(true)}>
          Изменить график
        </Button>
      </Box>
      {!hasSchedule && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          У смены нет графика — плановое время не рассчитывается, опоздание не показывается.
        </Typography>
      )}
      {dialogOpen && (
        <ChangeScheduleDialog
          shiftId={String(record.id)}
          currentScheduleId={record.work_schedule_id ?? null}
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            setDialogOpen(false);
            refresh();
          }}
        />
      )}
    </SectionCard>
  );
};

// Деталь чужой орг-смены (read-only): шапка + паузы + чек-листы.
export const OrgShiftShow = () => (
  <Show component="div" title="Смена сотрудника">
    <Box sx={{ pt: 2 }}>
      <SectionCard title="Смена">
        <ShiftHeader />
      </SectionCard>
      <ShiftPlanSection />
      {/* Штраф за смену — пишущее действие owner/admin (super_admin не ведёт штрафы). */}
      <ShiftPenaltySection />
      <SectionCard title="Паузы">
        <PausesBlock />
      </SectionCard>
      <SectionCard title="Чек-листы">
        <ShiftChecklists />
      </SectionCard>
    </Box>
  </Show>
);
