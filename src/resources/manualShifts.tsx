import { useState } from 'react';
import { useDataProvider, useGetList, useNotify, type RaRecord } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import { addDaysToDay, formatDayRu, utcIsoToZonedParts, zonedWallTimeToUtcIso } from '../utils/dates';
import { formatDuration, manualShiftErrorMessage, restoreErrorMessage } from '../utils/format';
import { formatMemberNameFlat } from '../utils/memberName';
import { useOrgTimezone } from '../utils/useOrgTimezone';

// Ручные смены (manual_time_entry): диалоги создания/правки/завершения/удаления/восстановления
// + чипы-пометки строки списка. Композиция карточек Show-страницы («Смена»/«Ручные правки») —
// в resources/orgShifts.tsx (там же приватный SectionCard/InfoRow, дублировать их сюда незачем).

// --- Общие утилиты формы ---

interface PauseRow {
  key: string;
  startTime: string;
  endTime: string;
}

interface EmployeeOption {
  id: string; // user_id
  user_name: string;
  display_name: string | null;
}

const newKey = (): string => Math.random().toString(36).slice(2);

// «Конец раньше начала» → ночная смена, конец переходит на следующие сутки (admin.md §2).
const isNightShift = (startTime: string, endTime: string): boolean =>
  startTime !== '' && endTime !== '' && endTime < startTime;

// День паузы относительно базового дня смены: время паузы меньше времени начала смены →
// пауза пришлась на «следующие сутки» (тот же приём, что и для конца смены — ночная смена
// 22:00→06:00, пауза 02:00 физически позже полуночи, значит уже на день+1).
const pauseDay = (baseDate: string, shiftStartTime: string, pauseTime: string): string =>
  pauseTime < shiftStartTime ? addDaysToDay(baseDate, 1) : baseDate;

const pauseToUtcIso = (
  baseDate: string,
  shiftStartTime: string,
  pause: PauseRow,
  tz: string,
): { started_at: string; finished_at: string } | null => {
  if (!pause.startTime || !pause.endTime) return null;
  const started_at = zonedWallTimeToUtcIso(
    pauseDay(baseDate, shiftStartTime, pause.startTime),
    pause.startTime,
    tz,
  );
  const finished_at = zonedWallTimeToUtcIso(
    pauseDay(baseDate, shiftStartTime, pause.endTime),
    pause.endTime,
    tz,
  );
  if (!started_at || !finished_at) return null;
  return { started_at, finished_at };
};

// Живой предпросмотр «Отработано» (admin.md §2): чистая арифметика по локальным Date —
// разница мс инвариантна к таймзоне, DST-погрешность на секундном предпросмотре не критична
// (финальные started_at/finished_at на сервер уходят через zonedWallTimeToUtcIso, точно).
const computeWorkedSecondsPreview = (
  date: string,
  startTime: string,
  endTime: string,
  pauses: PauseRow[],
): number | null => {
  if (!date || !startTime || !endTime) return null;
  const endDay = isNightShift(startTime, endTime) ? addDaysToDay(date, 1) : date;
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(`${endDay}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  let seconds = (end.getTime() - start.getTime()) / 1000;
  for (const p of pauses) {
    if (!p.startTime || !p.endTime) continue;
    const pStart = new Date(`${pauseDay(date, startTime, p.startTime)}T${p.startTime}:00`);
    const pEnd = new Date(`${pauseDay(date, startTime, p.endTime)}T${p.endTime}:00`);
    if (Number.isNaN(pStart.getTime()) || Number.isNaN(pEnd.getTime())) continue;
    seconds -= Math.max(0, (pEnd.getTime() - pStart.getTime()) / 1000);
  }
  return Math.max(0, Math.round(seconds));
};

// Совпадение момента времени независимо от текстового формата ISO (сервер и
// zonedWallTimeToUtcIso могут форматировать одну и ту же секунду по-разному:
// «+00:00» vs «.000Z»), используется для dirty-check в форме правки.
const sameInstant = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
};

// Точки организации для селекта форм (создание/правка) — общий хук, чтобы не дублировать
// параметры useGetList в трёх местах.
const useLocationOptions = () =>
  useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  }).data ?? [];

const useScheduleOptions = () =>
  useGetList('work-schedules', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
    filter: { include_paused: true },
  }).data ?? [];

// Список строк «с — по» с кнопкой «+ Пауза» (admin.md §2). Время внутри тех же суток смены
// (см. pauseDay) — общий компонент для создания и правки.
const PausesEditor = ({
  pauses,
  onChange,
  disabledHint,
}: {
  pauses: PauseRow[];
  onChange: (next: PauseRow[]) => void;
  disabledHint?: string;
}) => {
  if (disabledHint) {
    return (
      <Typography variant="caption" color="text.secondary">
        {disabledHint}
      </Typography>
    );
  }
  const addPause = () => onChange([...pauses, { key: newKey(), startTime: '', endTime: '' }]);
  const update = (key: string, patch: Partial<PauseRow>) =>
    onChange(pauses.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key: string) => onChange(pauses.filter((p) => p.key !== key));

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Паузы
      </Typography>
      <Stack spacing={1}>
        {pauses.map((p) => (
          <Stack key={p.key} direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              type="time"
              label="С"
              InputLabelProps={{ shrink: true }}
              value={p.startTime}
              onChange={(e) => update(p.key, { startTime: e.target.value })}
            />
            <Typography color="text.secondary">—</Typography>
            <TextField
              size="small"
              type="time"
              label="По"
              InputLabelProps={{ shrink: true }}
              value={p.endTime}
              onChange={(e) => update(p.key, { endTime: e.target.value })}
            />
            <IconButton size="small" aria-label="Удалить паузу" onClick={() => remove(p.key)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} onClick={addPause} sx={{ mt: 1 }}>
        Пауза
      </Button>
    </Box>
  );
};

// --- §2: создание смены (в т.ч. массовое) ---

export interface ManualShiftCreateInitial {
  userIds?: string[];
  date?: string;
  startTime?: string;
  endTime?: string;
  workLocationId?: string | null;
  workScheduleId?: string | null;
  pauses?: PauseRow[];
  note?: string;
}

interface CreateFormErrors {
  employee?: string;
  date?: string;
  start?: string;
  end?: string;
}

interface CreateResultRow {
  userId: string;
  name: string;
  ok: boolean;
  message?: string;
}

export const ManualShiftCreateDialog = ({
  initial,
  onClose,
  onDone,
}: {
  initial?: ManualShiftCreateInitial;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const tz = useOrgTimezone();

  const [employeeIds, setEmployeeIds] = useState<string[]>(initial?.userIds ?? []);
  const [date, setDate] = useState(initial?.date ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [workLocationId, setWorkLocationId] = useState(initial?.workLocationId ?? '');
  const [workScheduleId, setWorkScheduleId] = useState(initial?.workScheduleId ?? '');
  const [pauses, setPauses] = useState<PauseRow[]>(initial?.pauses ?? []);
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<CreateFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<CreateResultRow[] | null>(null);

  const { data: members } = useGetList('members', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const locations = useLocationOptions();
  const schedules = useScheduleOptions();

  const employeeOptions: EmployeeOption[] = (members ?? []).map((m) => ({
    id: String(m.user_id),
    user_name: m.user_name,
    display_name: m.display_name ?? null,
  }));
  const selectedEmployees = employeeOptions.filter((e) => employeeIds.includes(e.id));

  const night = isNightShift(startTime, endTime);
  const workedSeconds = computeWorkedSecondsPreview(date, startTime, endTime, pauses);

  const buildBody = (userId: string) => {
    const endDay = night ? addDaysToDay(date, 1) : date;
    const pausesUtc = pauses
      .map((p) => pauseToUtcIso(date, startTime, p, tz))
      .filter((p): p is { started_at: string; finished_at: string } => p !== null);
    return {
      user_id: userId,
      started_at: zonedWallTimeToUtcIso(date, startTime, tz),
      finished_at: zonedWallTimeToUtcIso(endDay, endTime, tz),
      work_location_id: workLocationId === '' ? null : workLocationId,
      work_schedule_id: workScheduleId === '' ? null : workScheduleId,
      pauses: pausesUtc,
      note: note.trim() === '' ? null : note.trim(),
    };
  };

  const validateLocal = (): boolean => {
    const next: CreateFormErrors = {};
    if (employeeIds.length === 0) next.employee = 'Выберите хотя бы одного сотрудника';
    if (!date) next.date = 'Укажите дату';
    if (!startTime) next.start = 'Укажите время начала';
    if (!endTime) next.end = 'Укажите время конца';
    if (!next.date && !next.start && !next.end && workedSeconds !== null && workedSeconds <= 0) {
      next.end = 'Проверьте время — отработано 0';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitSingle = async (userId: string) => {
    try {
      await dataProvider.create('org-shifts', { data: buildBody(userId) });
      notify('Смена добавлена', { type: 'success' });
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        const pauseKey = Object.keys(fieldErrors).find((k) => k.startsWith('pauses'));
        setErrors({
          employee: fieldErrors.user_id,
          date: fieldErrors.started_at,
          start: fieldErrors.started_at,
          end: fieldErrors.finished_at,
        });
        if (pauseKey) notify(`Паузы: ${fieldErrors[pauseKey]}`, { type: 'error' });
        else if (Object.keys(fieldErrors).length === 0)
          notify(e?.message ?? 'Некорректные данные', { type: 'error' });
      } else if (code === 'SHIFT_OVERLAP') {
        const message = manualShiftErrorMessage(e);
        setErrors({ start: message, end: message });
      } else if (code === 'MEMBER_NOT_FOUND') {
        setErrors({ employee: manualShiftErrorMessage(e) });
      } else {
        notify(manualShiftErrorMessage(e, 'Не удалось создать смену'), { type: 'error' });
      }
    }
  };

  const submitBatch = async () => {
    const settled = await Promise.allSettled(
      employeeIds.map((userId) => dataProvider.create('org-shifts', { data: buildBody(userId) })),
    );
    const rows: CreateResultRow[] = settled.map((r, i) => {
      const userId = employeeIds[i];
      const emp = employeeOptions.find((e) => e.id === userId);
      const name = emp ? formatMemberNameFlat(emp) : userId;
      if (r.status === 'fulfilled') return { userId, name, ok: true };
      return { userId, name, ok: false, message: manualShiftErrorMessage(r.reason, 'Ошибка') };
    });
    setResults(rows);
  };

  const submit = async () => {
    if (!validateLocal()) return;
    setSaving(true);
    setErrors({});
    try {
      if (employeeIds.length === 1) await submitSingle(employeeIds[0]);
      else await submitBatch();
    } finally {
      setSaving(false);
    }
  };

  const workedLabel = workedSeconds !== null ? formatDuration(workedSeconds) : null;

  if (results) {
    const succeeded = results.filter((r) => r.ok).length;
    return (
      <Dialog open onClose={onDone} maxWidth="xs" fullWidth>
        <DialogTitle>Добавление смен</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            Создано {succeeded} из {results.length}.
          </Typography>
          <Stack spacing={0.75}>
            {results.map((r) => (
              <Stack key={r.userId} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={r.ok ? 'success' : 'error'} label={r.ok ? 'Создана' : 'Ошибка'} />
                <Typography variant="body2">{r.name}</Typography>
                {!r.ok && (
                  <Typography variant="caption" color="text.secondary">
                    — {r.message}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onDone}>
            Готово
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Добавить смену</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete
            multiple
            size="small"
            options={employeeOptions}
            value={selectedEmployees}
            getOptionLabel={(o) => formatMemberNameFlat(o)}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            onChange={(_, value) => setEmployeeIds(value.map((o) => o.id))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Сотрудник"
                error={Boolean(errors.employee)}
                helperText={errors.employee}
              />
            )}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              type="date"
              label="Дата"
              InputLabelProps={{ shrink: true }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={Boolean(errors.date)}
              helperText={errors.date}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="time"
              label="Начало"
              InputLabelProps={{ shrink: true }}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              error={Boolean(errors.start)}
              helperText={errors.start}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="time"
              label="Конец"
              InputLabelProps={{ shrink: true }}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              error={Boolean(errors.end)}
              helperText={
                errors.end ?? (night && date ? `Смена перейдёт на ${formatDayRu(addDaysToDay(date, 1))}` : undefined)
              }
              sx={{ flex: 1 }}
            />
          </Stack>

          <TextField
            select
            size="small"
            label="Точка (опционально)"
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
          >
            <MenuItem value="">— без точки —</MenuItem>
            {locations.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="График (опционально)"
            value={workScheduleId}
            onChange={(e) => setWorkScheduleId(e.target.value)}
            helperText="Плановое время и опоздание рассчитаются по графику"
          >
            <MenuItem value="">— без графика —</MenuItem>
            {schedules.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
                {s.is_paused ? ' (приостановлен)' : ''}
              </MenuItem>
            ))}
          </TextField>

          <PausesEditor pauses={pauses} onChange={setPauses} />

          <TextField
            label="Комментарий"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            inputProps={{ maxLength: 500 }}
            helperText="Увидит сотрудник"
          />

          <Alert severity="info" variant="outlined">
            Сотрудник получит уведомление о добавленной смене.
            {workedLabel && ` Отработано: ${workedLabel}.`}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          {employeeIds.length > 1 ? `Создать ${employeeIds.length} смены` : 'Создать'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- §3.1: изменить время существующей смены ---

interface EditFormErrors {
  start?: string;
  end?: string;
}

export const ManualShiftEditDialog = ({
  shift,
  onClose,
  onDone,
}: {
  shift: RaRecord;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const tz = useOrgTimezone();

  const isOpenShift = shift.status === 'active' || shift.status === 'paused';
  const startedInitial = utcIsoToZonedParts(shift.started_at ?? null, tz);
  const finishedInitial = utcIsoToZonedParts(shift.finished_at ?? null, tz);

  const [startDate, setStartDate] = useState(startedInitial?.day ?? '');
  const [startTime, setStartTime] = useState(startedInitial?.time ?? '');
  const [endDate, setEndDate] = useState(finishedInitial?.day ?? startedInitial?.day ?? '');
  const [endTime, setEndTime] = useState(finishedInitial?.time ?? '');
  const [workLocationId, setWorkLocationId] = useState(shift.work_location_id ?? '');
  const [note, setNote] = useState(shift.manual_note ?? '');
  const [pauses, setPauses] = useState<PauseRow[]>(() =>
    ((shift.pauses ?? []) as any[]).map((p) => ({
      key: String(p.id ?? newKey()),
      startTime: utcIsoToZonedParts(p.started_at, tz)?.time ?? '',
      endTime: p.finished_at ? (utcIsoToZonedParts(p.finished_at, tz)?.time ?? '') : '',
    })),
  );
  const [pausesTouched, setPausesTouched] = useState(false);
  const [errors, setErrors] = useState<EditFormErrors>({});
  const [saving, setSaving] = useState(false);

  const locations = useLocationOptions();

  // Для открытой смены заполнение «Конец» завершает её задним числом (backend.md A2) —
  // паузы в этот же запрос можно передать ТОЛЬКО вместе с finished_at (backend требует
  // явного finished_at в теле, если правятся pauses), иначе сервер вернёт VALIDATION_ERROR.
  const willFinish = isOpenShift && endTime !== '';
  const pausesAvailable = !isOpenShift || willFinish;

  const currentStartedIso =
    startDate && startTime ? zonedWallTimeToUtcIso(startDate, startTime, tz) : undefined;
  const currentFinishedIso =
    endDate && endTime ? zonedWallTimeToUtcIso(endDate, endTime, tz) : undefined;

  const startedChanged = Boolean(currentStartedIso) && !sameInstant(currentStartedIso, shift.started_at);
  // willFinish проверяет только «поле «Конец» заполнено» (по endTime) — currentFinishedIso
  // тоже нужно проверить явно: если endDate очищен вручную при непустом endTime, willFinish
  // остался бы true, а currentFinishedIso — undefined, и isDirty разрешил бы отправку PATCH
  // без finished_at в теле (пустой эффективный патч, но с реальными побочными эффектами —
  // backend безусловно проставляет edited_at/аудит/уведомление на любой PATCH, см. отчёт).
  const finishedChanged = isOpenShift
    ? willFinish && Boolean(currentFinishedIso)
    : Boolean(currentFinishedIso) && !sameInstant(currentFinishedIso, shift.finished_at);
  const nextLocation = workLocationId === '' ? null : workLocationId;
  const locationChanged = nextLocation !== (shift.work_location_id ?? null);
  const nextNote = note.trim() === '' ? null : note.trim();
  const noteChanged = nextNote !== (shift.manual_note ?? null);
  const pausesChanged = pausesTouched && pausesAvailable;

  const isDirty = startedChanged || finishedChanged || locationChanged || noteChanged || pausesChanged;

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    if (startedChanged && currentStartedIso) body.started_at = currentStartedIso;
    if (finishedChanged && currentFinishedIso) body.finished_at = currentFinishedIso;
    if (locationChanged) body.work_location_id = nextLocation;
    if (noteChanged) body.note = nextNote;
    if (pausesChanged) {
      const baseDate = endDate || startDate;
      body.pauses = pauses
        .map((p) => pauseToUtcIso(baseDate, startTime, p, tz))
        .filter((p): p is { started_at: string; finished_at: string } => p !== null);
    }
    return body;
  };

  const submit = async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await dataProvider.update('org-shifts', { id: shift.id, data: buildBody(), previousData: shift });
      notify('Смена изменена', { type: 'success' });
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        const pauseKey = Object.keys(fieldErrors).find((k) => k.startsWith('pauses'));
        setErrors({ start: fieldErrors.started_at, end: fieldErrors.finished_at });
        if (pauseKey) notify(`Паузы: ${fieldErrors[pauseKey]}`, { type: 'error' });
        else if (Object.keys(fieldErrors).length === 0)
          notify(e?.message ?? 'Некорректные данные', { type: 'error' });
      } else if (code === 'SHIFT_OVERLAP') {
        const message = manualShiftErrorMessage(e);
        setErrors({ start: message, end: message });
      } else if (code === 'SHIFT_NOT_FOUND') {
        notify('Смена не найдена — возможно, уже удалена', { type: 'warning' });
        onDone();
      } else {
        notify(manualShiftErrorMessage(e, 'Не удалось изменить смену'), { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Изменить время смены</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              type="date"
              label="Дата начала"
              InputLabelProps={{ shrink: true }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="time"
              label="Начало"
              InputLabelProps={{ shrink: true }}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              error={Boolean(errors.start)}
              helperText={errors.start}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              type="date"
              label="Дата конца"
              InputLabelProps={{ shrink: true }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="time"
              label={isOpenShift ? 'Завершить задним числом' : 'Конец'}
              InputLabelProps={{ shrink: true }}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              error={Boolean(errors.end)}
              helperText={
                errors.end ?? (isOpenShift ? 'Смена перейдёт в статус «Завершена»' : undefined)
              }
              sx={{ flex: 1 }}
            />
          </Stack>

          <TextField
            select
            size="small"
            label="Точка"
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
          >
            <MenuItem value="">— без точки —</MenuItem>
            {locations.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>

          <PausesEditor
            pauses={pauses}
            onChange={(next) => {
              setPauses(next);
              setPausesTouched(true);
            }}
            disabledHint={
              pausesAvailable ? undefined : 'Паузы для открытой смены правятся вместе с завершением'
            }
          />

          <TextField
            label="Комментарий"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            inputProps={{ maxLength: 500 }}
            helperText="Увидит сотрудник"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving || !isDirty}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- §3.1: быстрое завершение зависшей смены ---

export const ManualShiftFinishDialog = ({
  shift,
  onClose,
  onDone,
}: {
  shift: RaRecord;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const tz = useOrgTimezone();
  const nowParts = utcIsoToZonedParts(new Date().toISOString(), tz);

  const [date, setDate] = useState(nowParts?.day ?? '');
  const [time, setTime] = useState(nowParts?.time ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const finished_at = date && time ? zonedWallTimeToUtcIso(date, time, tz) : undefined;
    if (!finished_at) {
      setError('Укажите дату и время окончания');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await dataProvider.update('org-shifts', { id: shift.id, data: { finished_at }, previousData: shift });
      notify('Смена завершена', { type: 'success' });
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'SHIFT_OVERLAP' || code === 'VALIDATION_ERROR') setError(manualShiftErrorMessage(e));
      else notify(manualShiftErrorMessage(e, 'Не удалось завершить смену'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Завершить смену</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Смена перейдёт в статус «Завершена».</DialogContentText>
        <Stack direction="row" spacing={2}>
          <TextField
            size="small"
            type="date"
            label="Дата окончания"
            InputLabelProps={{ shrink: true }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            type="time"
            label="Время окончания"
            InputLabelProps={{ shrink: true }}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          Завершить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- §3.1: удалить (soft-delete) / восстановить ---

export const ManualShiftDeleteDialog = ({
  shift,
  onClose,
  onDone,
}: {
  shift: RaRecord;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await dataProvider.delete('org-shifts', {
        id: shift.id,
        previousData: shift,
        meta: { note: note.trim() === '' ? undefined : note.trim() },
      });
      notify('Смена удалена', { type: 'success' });
      onDone();
    } catch (e: any) {
      notify(manualShiftErrorMessage(e, 'Не удалось удалить смену'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Удалить смену?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Смена исчезнет из отчётов и зарплаты. Сотрудник получит уведомление. Восстановить можно
          через фильтр «Показывать удалённые».
        </DialogContentText>
        <TextField
          label="Причина (опционально)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          fullWidth
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button color="error" variant="contained" onClick={() => void submit()} disabled={saving}>
          Удалить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// size — «small» для встраивания в строку списка (§1: восстановление доступно прямо из
// списка смен под include_deleted=true, не только с детали — деталь удалённой смены сейчас
// не всегда открывается, см. GET .../shifts/{id} в backend.md, безусловно фильтрующий
// is_deleted=false; список же поддерживает include_deleted честно, A5). stopPropagation —
// строка Datagrid кликабельна целиком (rowClick="show"), клик по кнопке/диалогу восстановления
// не должен триггерить переход на деталь.
export const RestoreShiftButton = ({
  shift,
  onDone,
  size,
}: {
  shift: RaRecord;
  onDone: () => void;
  size?: 'small' | 'medium' | 'large';
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await dataProvider.restoreShift(String(shift.id));
      notify('Смена восстановлена', { type: 'success' });
      setConfirming(false);
      onDone();
    } catch (e: any) {
      notify(restoreErrorMessage(e, 'Не удалось восстановить смену'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <Button
        size={size}
        variant="contained"
        color="success"
        startIcon={<RestoreIcon />}
        onClick={() => setConfirming(true)}
      >
        Восстановить
      </Button>
      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Восстановить смену?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Смена снова появится в отчётах, статистике и зарплате.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)} disabled={saving}>
              Отмена
            </Button>
            <Button variant="contained" onClick={() => void submit()} disabled={saving}>
              Восстановить
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

// --- §1.3: пометки строки списка ---

// Не экспортируется (react-refresh/only-export-components): используется только внутри
// ShiftManualChips этого же файла.
const shiftManualTooltip = (r: RaRecord): string => {
  const who = r.is_manual ? r.created_by_name : r.edited_by_name;
  const parts: string[] = [];
  if (who) parts.push(`Кто: ${who}`);
  if (r.manual_note) parts.push(`Комментарий: ${r.manual_note}`);
  if (parts.length > 0) return parts.join(' · ');
  return r.is_manual ? 'Добавлена вручную' : 'Изменена вручную';
};

// «Ручная» покрывает и is_edited (admin.md §1.3: «если и то и другое — достаточно "Ручная"»).
export const ShiftManualChips = (r: RaRecord) => (
  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
    {r.is_manual ? (
      <Tooltip title={shiftManualTooltip(r)}>
        <Chip size="small" color="info" label="Ручная" />
      </Tooltip>
    ) : r.is_edited ? (
      <Tooltip title={shiftManualTooltip(r)}>
        <Chip size="small" color="info" variant="outlined" label="Изменена" />
      </Tooltip>
    ) : null}
    {r.is_deleted && <Chip size="small" label="Удалена" />}
  </Stack>
);
