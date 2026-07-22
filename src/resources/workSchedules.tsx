import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWatch } from 'react-hook-form';
import {
  List,
  Datagrid,
  TextField,
  BooleanField,
  BooleanInput,
  FunctionField,
  SearchInput,
  Create,
  SimpleForm,
  TextInput,
  Title,
  required,
  useGetOne,
  useGetList,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  type RaRecord,
} from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  computeScheduleDuration,
  formatDuration,
  formatScheduleTimeRange,
  scheduleDurationHint,
  scheduleErrorMessage,
} from '../utils/format';

const scheduleFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <BooleanInput
    key="include_archived"
    source="include_archived"
    label="Показывать архивные"
    alwaysOn
  />,
];

// «Время» — «09:00 – 18:00» / «22:00 – 06:00 (через полночь)».
const timeField = (r: RaRecord) =>
  formatScheduleTimeRange(r.start_time, r.end_time, Boolean(r.crosses_midnight));

// «Длительность» — из duration_minutes («9 ч», «7 ч 30 мин»).
const durationField = (r: RaRecord) => formatDuration((r.duration_minutes ?? 0) * 60);

// «Кому» — сводка по role_ids/work_location_ids (отдаются сразу в списке, без N+1 запросов —
// backend.md, «Графики — CRUD»). Компонент-поле (не чистая render-функция): нужны useGetList
// для имён ролей/точек; label в пропсах не используется самим компонентом — его читает
// Datagrid при построении заголовка колонки (стандартный приём react-admin).
const AudienceCell = (props: { label?: string }) => {
  void props; // label читает только Datagrid при построении заголовка колонки, компонент — нет
  const record = useRecordContext<any>();
  const { data: roles } = useGetList('roles', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const { data: locations } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  if (!record) return null;
  const roleIds: string[] = record.role_ids ?? [];
  const locationIds: string[] = record.work_location_ids ?? [];
  if (roleIds.length === 0 && locationIds.length === 0) {
    return <Typography variant="body2">Всем</Typography>;
  }
  if (roleIds.length > 0 && locationIds.length > 0) {
    return <Typography variant="body2">Роли + точки</Typography>;
  }
  if (roleIds.length > 0) {
    const names = roleIds
      .map((id) => (roles ?? []).find((r) => r.id === id)?.name ?? '—')
      .join(', ');
    return <Typography variant="body2">{names}</Typography>;
  }
  const names = locationIds
    .map((id) => (locations ?? []).find((l) => l.id === id)?.name ?? '—')
    .join(', ');
  return <Typography variant="body2">{names}</Typography>;
};

export const WorkScheduleList = () => (
  <List filters={scheduleFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
      <FunctionField label="Время" render={timeField} sortable={false} />
      <FunctionField label="Длительность" render={durationField} sortable={false} />
      <AudienceCell label="Кому" />
      <BooleanField source="is_archived" label="Архив" />
    </Datagrid>
  </List>
);

// ---- Создание ----

// Поле-уровневый валидатор (не форма-уровневый validate у SimpleForm — та типизация в текущей
// связке react-admin 5.4.4 + react-hook-form 7.78 конфликтует сама с собой, см. апстрим-баг:
// UseFormProps['validate'] (нативный RHF form-level validate) и validate ra-core пересекаются
// в один несовместимый тип у FormProps). Сигнатура (value, allValues) — стандартный ra Validator.
const validateEndTimeDiffers = (
  value: unknown,
  allValues: Record<string, unknown>,
): string | undefined =>
  value && allValues.start_time && value === allValues.start_time
    ? 'Время начала и конца не должны совпадать'
    : undefined;

// Живая подсказка под полями времени (Create — форма react-hook-form, читаем значения через
// useWatch; на Edit та же подсказка считается от локального state формы, см. ScheduleMetaForm).
const CreateDurationHint = () => {
  const [start, end] = useWatch({ name: ['start_time', 'end_time'] }) as [string, string];
  const info = computeScheduleDuration(start, end);
  if (!info) return null;
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: -1, mb: 1 }}>
      {scheduleDurationHint(info, start, end)}
    </Typography>
  );
};

export const WorkScheduleCreate = () => (
  <Create redirect="edit">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
      <Stack direction="row" spacing={2}>
        <TextInput
          source="start_time"
          label="Начало"
          type="time"
          validate={required()}
          inputProps={{ step: 300 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextInput
          source="end_time"
          label="Конец"
          type="time"
          validate={[required(), validateEndTimeDiffers]}
          inputProps={{ step: 300 }}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>
      <CreateDurationHint />
    </SimpleForm>
  </Create>
);

// ---- Экран редактирования (кастомный, по образцу checklistTemplates.tsx) ----

// Метаданные графика: название/время/архив. Управляется локальным состоянием (не SimpleForm) —
// та же архитектура, что TemplateMetaForm в checklistTemplates.tsx.
const ScheduleMetaForm = ({ schedule, onSaved }: { schedule: any; onSaved: () => void }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [name, setName] = useState<string>(schedule.name ?? '');
  const [startTime, setStartTime] = useState<string>(schedule.start_time ?? '');
  const [endTime, setEndTime] = useState<string>(schedule.end_time ?? '');
  const [isArchived, setIsArchived] = useState<boolean>(Boolean(schedule.is_archived));
  const [saving, setSaving] = useState(false);

  const durationInfo = computeScheduleDuration(startTime, endTime);
  const timesEqual = Boolean(startTime) && Boolean(endTime) && startTime === endTime;

  const save = async () => {
    if (timesEqual) return;
    setSaving(true);
    try {
      await dataProvider.update('work-schedules', {
        id: schedule.id,
        data: { name, start_time: startTime, end_time: endTime, is_archived: isArchived },
        previousData: schedule,
      });
      notify('График сохранён', { type: 'success' });
      onSaved();
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Ошибка сохранения'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          График
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <MuiTextField label="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <Stack direction="row" spacing={2}>
            <MuiTextField
              label="Начало"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              inputProps={{ step: 300 }}
              InputLabelProps={{ shrink: true }}
              error={timesEqual}
              size="small"
              fullWidth
            />
            <MuiTextField
              label="Конец"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              inputProps={{ step: 300 }}
              InputLabelProps={{ shrink: true }}
              error={timesEqual}
              helperText={timesEqual ? 'Время начала и конца не должны совпадать' : undefined}
              size="small"
              fullWidth
            />
          </Stack>
          {durationInfo && (
            <Typography variant="body2" color="text.secondary">
              {scheduleDurationHint(durationInfo, startTime, endTime)}
            </Typography>
          )}
          <Alert severity="info" variant="outlined">
            Изменение времени не затронет уже начатые и завершённые смены.
          </Alert>
          <FormControlLabel
            control={
              <Switch checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />
            }
            label="В архиве"
          />
          <Box>
            <Button
              variant="contained"
              onClick={() => void save()}
              disabled={saving || !name.trim() || !startTime || !endTime || timesEqual}
            >
              Сохранить
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// Пояснение логики назначения — общее для секций «Роли» и «Точки» (admin.md: «наверху секций —
// пояснение»). Явно проговаривает отличие от чек-листов, чтобы админ не перенёс туда интуицию.
const AssignmentExplainer = () => (
  <Alert severity="info" sx={{ mb: 2 }}>
    График без выбранных ролей и без выбранных точек действует <b>на всех сотрудников</b>{' '}
    организации. Это отличается от шаблонов чек-листов: там пустой набор ролей/точек значит «не
    выдаётся никому». Добавьте роли и/или точки, только если график должен применяться к части
    сотрудников.
  </Alert>
);

const RolesAssignment = ({
  scheduleId,
  roleIds,
  onChanged,
}: {
  scheduleId: string;
  roleIds: string[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: roles } = useGetList('roles', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const [selected, setSelected] = useState<string[]>(roleIds);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(roleIds), [roleIds]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true);
    try {
      await dataProvider.setScheduleRoles(scheduleId, selected);
      notify('Назначения ролей сохранены', { type: 'success' });
      onChanged();
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Ошибка'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Роли
        </Typography>
        {(roles ?? []).length === 0 ? (
          <Typography color="text.secondary">Нет кастомных ролей в организации</Typography>
        ) : (
          <Stack>
            {(roles ?? []).map((r) => (
              <FormControlLabel
                key={r.id}
                control={
                  <Checkbox checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                }
                label={r.name}
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" disabled={busy} onClick={() => void save()}>
                Сохранить роли
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

const LocationsAssignment = ({
  scheduleId,
  locationIds,
  onChanged,
}: {
  scheduleId: string;
  locationIds: string[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: locations } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const [selected, setSelected] = useState<string[]>(locationIds);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(locationIds), [locationIds]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true);
    try {
      await dataProvider.setScheduleLocations(scheduleId, selected);
      notify('Точки сохранены', { type: 'success' });
      onChanged();
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Ошибка'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
          Точки
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Ничего не выбрано — график действует на всех точках. Выберите точки, чтобы ограничить его
          только ими.
        </Typography>
        {(locations ?? []).length === 0 ? (
          <Typography color="text.secondary">В организации нет ни одной рабочей точки.</Typography>
        ) : (
          <Stack>
            {(locations ?? []).map((l) => (
              <FormControlLabel
                key={l.id}
                control={
                  <Checkbox checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
                }
                label={l.name}
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" disabled={busy} onClick={() => void save()}>
                Сохранить точки
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

// Личные переопределения. Контракт заменяет ВЕСЬ список overrides сотрудника разом (PUT
// .../members/{user_id}/schedule-overrides, а не точечно, как у чек-листов) — при смене
// значения для ОДНОГО графика собираем полный список сотрудника заново: подгружаем assignments
// всех графиков организации, берём из них текущие add/remove по этому user_id, заменяем/добавляем
// запись по текущему графику и отправляем весь массив. N+1 запросов по числу графиков — приемлемо
// (в организации их обычно единицы), делается только в момент клика, не на каждый рендер.
const PersonalOverrides = ({
  scheduleId,
  personalAdd,
  personalRemove,
  onChanged,
}: {
  scheduleId: string;
  personalAdd: string[];
  personalRemove: string[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: members } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const { data: allSchedules } = useGetList('work-schedules', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
    filter: { include_archived: true },
  });
  const [busy, setBusy] = useState(false);

  const addIds = new Set(personalAdd);
  const removeIds = new Set(personalRemove);
  const current = (userId: string): 'add' | 'remove' | 'none' =>
    addIds.has(userId) ? 'add' : removeIds.has(userId) ? 'remove' : 'none';

  const change = async (userId: string, value: 'add' | 'remove' | 'none') => {
    setBusy(true);
    try {
      const otherScheduleIds = (allSchedules ?? [])
        .map((s: any) => String(s.id))
        .filter((sid: string) => sid !== scheduleId);
      const assignmentsByOtherSchedule = await Promise.all(
        otherScheduleIds.map((sid: string) =>
          dataProvider.getScheduleAssignments(sid).then((a: any) => ({ sid, a })),
        ),
      );
      const overrides: { schedule_id: string; override_type: 'add' | 'remove' }[] = [];
      for (const { sid, a } of assignmentsByOtherSchedule) {
        const otherAdd: string[] = a?.personal_add ?? [];
        const otherRemove: string[] = a?.personal_remove ?? [];
        if (otherAdd.includes(userId)) overrides.push({ schedule_id: sid, override_type: 'add' });
        else if (otherRemove.includes(userId))
          overrides.push({ schedule_id: sid, override_type: 'remove' });
      }
      if (value !== 'none') overrides.push({ schedule_id: scheduleId, override_type: value });
      await dataProvider.setMemberScheduleOverrides(userId, overrides);
      notify('Переопределение сохранено', { type: 'success' });
      onChanged();
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Ошибка'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Персонально
        </Typography>
        <Table size="small">
          <TableBody>
            {(members ?? []).map((m) => (
              <TableRow key={m.user_id}>
                <TableCell>{m.user_name}</TableCell>
                <TableCell sx={{ width: 220 }}>
                  <Select
                    size="small"
                    fullWidth
                    disabled={busy}
                    value={current(m.user_id)}
                    onChange={(e) =>
                      void change(m.user_id, e.target.value as 'add' | 'remove' | 'none')
                    }
                  >
                    <MenuItem value="none">— по назначению —</MenuItem>
                    <MenuItem value="add">Добавить</MenuItem>
                    <MenuItem value="remove">Исключить</MenuItem>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

// Удаление графика: подтверждение с текстом из ТЗ + подсказка про архивацию как альтернативу.
const ScheduleDeleteSection = ({ scheduleId }: { scheduleId: string }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dataProvider.delete('work-schedules', { id: scheduleId });
      notify('График удалён', { type: 'success' });
      redirect('list', 'work-schedules');
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Ошибка удаления'), { type: 'error' });
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Удаление
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Если график когда-то использовался в сменах, вместо удаления рассмотрите архивацию
          (переключатель «В архиве» выше) — архивный график не выдаётся при старте новых смен, но
          остаётся доступным для правки и истории.
        </Typography>
        <Button color="error" startIcon={<DeleteIcon />} onClick={() => setOpen(true)}>
          Удалить график
        </Button>
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить график?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Смены, где график уже использован, сохранят его название и плановое время.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={deleting}>
            Отмена
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export const WorkScheduleEdit = () => {
  const { id } = useParams();
  const dataProvider = useDataProvider();
  const { data: schedule, isLoading, refetch } = useGetOne('work-schedules', { id: id ?? '' });
  const [assignments, setAssignments] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadAssignments = useCallback(() => {
    if (!id) return;
    dataProvider
      .getScheduleAssignments(id)
      .then((res: any) => setAssignments(res))
      .catch(() =>
        setAssignments({
          role_ids: [],
          work_location_ids: [],
          personal_add: [],
          personal_remove: [],
        }),
      );
  }, [id, dataProvider]);

  useEffect(() => {
    reloadAssignments();
  }, [reloadAssignments, reloadKey]);

  const onChanged = () => {
    setReloadKey((k) => k + 1);
    void refetch();
  };

  if (isLoading || !schedule || !id) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="График работы" />
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 800 }}>
      <Title title={`График — ${schedule.name}`} />
      <ScheduleMetaForm schedule={schedule} onSaved={onChanged} />
      <AssignmentExplainer />
      <RolesAssignment
        scheduleId={schedule.id}
        roleIds={assignments?.role_ids ?? []}
        onChanged={onChanged}
      />
      <LocationsAssignment
        scheduleId={schedule.id}
        locationIds={assignments?.work_location_ids ?? []}
        onChanged={onChanged}
      />
      <PersonalOverrides
        scheduleId={schedule.id}
        personalAdd={assignments?.personal_add ?? []}
        personalRemove={assignments?.personal_remove ?? []}
        onChanged={onChanged}
      />
      <Box sx={{ mt: 2 }}>
        <ScheduleDeleteSection scheduleId={schedule.id} />
      </Box>
    </Box>
  );
};
