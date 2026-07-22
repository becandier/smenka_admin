import { useEffect, useState } from 'react';
import {
  Edit,
  SimpleForm,
  BooleanInput,
  NumberInput,
  Title,
  minValue,
  maxValue,
  useGetList,
  useGetOne,
  useDataProvider,
  useNotify,
  useRefresh,
  usePermissions,
} from 'react-admin';
import {
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCurrentOrg } from '../orgContext';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { scheduleErrorMessage } from '../utils/format';
import { DEFAULT_ORG_TIMEZONE, TIMEZONE_CHOICES } from '../utils/timezones';
import type { CurrentOrg } from '../config';
import type { Permissions } from '../providers/authProvider';

const NAME_MAX_LENGTH = 255;

// Тумблер «Требовать выбор точки при старте смены». Задизейблен, пока у организации
// нет ни одной рабочей точки (бэк отверг бы включение 409 WORK_LOCATION_REQUIRED_NO_LOCATIONS),
// с подсказкой добавить точку. perPage:1 — нужен только total (count точек).
const RequireWorkLocationInput = () => {
  const { total, isPending, error } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 1 },
    sort: { field: 'name', order: 'ASC' },
  });
  const hasLocations = (total ?? 0) > 0;
  // Подсказку «добавьте точку» показываем только при успешной пустой загрузке.
  // При ошибке запроса `total` тоже undefined — но утверждать «точек нет» нельзя,
  // поэтому различаем эти случаи и даём честный текст ошибки.
  const showAddHint = !isPending && !error && !hasLocations;
  return (
    <BooleanInput
      source="require_work_location"
      label="Требовать выбор точки при старте смены"
      disabled={isPending || !!error || !hasLocations}
      helperText={
        showAddHint
          ? 'Сначала добавьте рабочую точку'
          : error
            ? 'Не удалось загрузить список точек'
            : false
      }
    />
  );
};

// Тумблер «Требовать выбор графика» (work_schedules). Задизейблен, пока у организации нет
// ни одного неархивного графика (бэк отверг бы включение 409 SCHEDULE_REQUIRED_NO_SCHEDULES) —
// та же логика, что RequireWorkLocationInput.
const RequireScheduleInput = () => {
  const { total, isPending, error } = useGetList('work-schedules', {
    pagination: { page: 1, perPage: 1 },
    sort: { field: 'name', order: 'ASC' },
    filter: { include_archived: false },
  });
  const hasSchedules = (total ?? 0) > 0;
  const showAddHint = !isPending && !error && !hasSchedules;
  return (
    <BooleanInput
      source="require_schedule"
      label="Требовать выбор графика"
      disabled={isPending || !!error || !hasSchedules}
      helperText={
        showAddHint
          ? 'Сначала добавьте график работы'
          : error
            ? 'Не удалось загрузить список графиков'
            : false
      }
    />
  );
};

// Отдельная карточка переименования организации (org_rename): своя форма и свой эндпоинт
// PATCH /organizations/{org} — намеренно НЕ поле формы настроек (у настроек другой эндпоинт).
// После успеха: обновляем контекст текущей org (Chip super_admin в OrgSwitcher) и инвалидируем
// кэш react-query через useRefresh — рефетч getPermissions (Select owner/admin в OrgSwitcher) и
// платформенного списка организаций. Валидация имени — клиентская (trim/непустое/≤255) + 422.
const OrgNameCard = ({ org }: { org: CurrentOrg }) => {
  const { selectOrg } = useCurrentOrg();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  const [name, setName] = useState(org.name);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setFieldError('Введите название организации');
      return;
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setFieldError(`Не более ${NAME_MAX_LENGTH} символов`);
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const updated = await dataProvider.renameOrganization(org.id, trimmed);
      const nextName = typeof updated?.name === 'string' && updated.name ? updated.name : trimmed;
      setName(nextName);
      // Контекст текущей org — сразу (Chip super_admin читает name отсюда).
      selectOrg({ id: org.id, name: nextName });
      // Рефетч кэша: getPermissions (Select owner/admin) + платформенный список организаций.
      refresh();
      notify('Название организации обновлено', { type: 'success' });
    } catch (e: any) {
      // Ошибки — по error.code (ERROR_FORMAT), не по тексту.
      if (e?.body?.code === 'FORBIDDEN' || e?.status === 403) {
        notify('Недостаточно прав', { type: 'error' });
      } else if (e?.body?.code === 'VALIDATION_ERROR') {
        // request() маппит validation[].field → body.errors; подсвечиваем поле name.
        setFieldError(e?.body?.errors?.name ?? 'Некорректное название организации');
      } else {
        notify(e?.message ?? 'Не удалось переименовать организацию', { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const trimmedLen = name.trim().length;
  const unchanged = name.trim() === org.name.trim();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Название организации
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Новое название сразу отобразится в переключателе организаций.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
          <TextField
            label="Название"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            error={!!fieldError}
            helperText={fieldError ?? `${trimmedLen}/${NAME_MAX_LENGTH}`}
            fullWidth
            size="small"
            disabled={saving}
          />
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || unchanged}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

// Часовой пояс организации (work_schedules): PATCH /organizations/{org} c {timezone} — свой
// эндпоинт, не /settings (то же разделение, что у OrgNameCard). Текущее значение читаем через
// GET /organizations/{org} (dataProvider.getOne('organizations', ...)), т.к. useCurrentOrg()
// хранит только id/name (для OrgSwitcher), без timezone.
const OrgTimezoneCard = ({ org }: { org: CurrentOrg }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: orgDetail, isLoading } = useGetOne('organizations', { id: org.id });
  const [timezone, setTimezone] = useState<string>(DEFAULT_ORG_TIMEZONE);
  // Значение с сервера, зафиксированное один раз при загрузке — точка сравнения для «изменено ли».
  const [originalTimezone, setOriginalTimezone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (
      originalTimezone === null &&
      typeof orgDetail?.timezone === 'string' &&
      orgDetail.timezone
    ) {
      setTimezone(orgDetail.timezone);
      setOriginalTimezone(orgDetail.timezone);
    }
  }, [orgDetail, originalTimezone]);

  const unchanged = originalTimezone === null || timezone === originalTimezone;

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await dataProvider.updateOrganizationTimezone(org.id, timezone);
      setOriginalTimezone(timezone);
      notify('Часовой пояс сохранён', { type: 'success' });
    } catch (e) {
      notify(scheduleErrorMessage(e, 'Не удалось сохранить часовой пояс'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Часовой пояс организации
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          По этому времени считаются графики работы и отчёты.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
          <Select
            size="small"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={isLoading || saving}
            sx={{ minWidth: 320 }}
          >
            {TIMEZONE_CHOICES.map((tz) => (
              <MenuItem key={tz.id} value={tz.id}>
                {tz.name}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || unchanged}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

// Singleton-форма настроек организации: GET/PATCH /organizations/{org}/settings.
// id записи = org_id (dataProvider маппит organization_id → id).
export const SettingsPage = () => {
  const { org } = useCurrentOrg();
  const { permissions } = usePermissions<Permissions>();
  const role = useMyOrgRole();

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Настройки" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  // Переименование доступно owner/admin (бэк — ensure_admin_or_owner) и super_admin со сквозным
  // доступом; карточку показываем только им, для прочих 403 остаётся страховкой на сабмите.
  const canRename = permissions?.role === 'super_admin' || role === 'owner' || role === 'admin';

  return (
    <>
      {canRename && <OrgNameCard key={org.id} org={org} />}
      {canRename && <OrgTimezoneCard key={`${org.id}-tz`} org={org} />}
      <Edit
        resource="settings"
        id={org.id}
        mutationMode="pessimistic"
        redirect={false}
        title={`Настройки — ${org.name}`}
      >
        <SimpleForm>
          <BooleanInput source="geo_check_enabled" label="Геопроверка при старте смены" />
          <RequireWorkLocationInput />
          <BooleanInput
            source="auto_finish_by_schedule"
            label="Завершать смену по окончании графика"
            helperText="Смена закроется автоматически в плановое время окончания. Переработку сотрудник оформляет отдельной заявкой."
            defaultValue
          />
          <RequireScheduleInput />
          <NumberInput
            source="late_tolerance_minutes"
            label="Допуск по опозданию, мин"
            helperText="0–120; опоздание в пределах допуска не показывается"
            defaultValue={0}
            validate={[minValue(0), maxValue(120)]}
          />
          <NumberInput
            source="overtime_request_days"
            label="Срок подачи заявки на переработку, дней"
            helperText="1–90"
            defaultValue={7}
            validate={[minValue(1), maxValue(90)]}
          />
          <NumberInput
            source="max_pause_minutes"
            label="Макс. длительность паузы, мин"
            helperText="1–480; пусто — без ограничения"
            validate={[minValue(1), maxValue(480)]}
          />
          <NumberInput
            source="max_pauses_per_shift"
            label="Макс. пауз за смену"
            helperText="1–50; пусто — без ограничения"
            validate={[minValue(1), maxValue(50)]}
          />
        </SimpleForm>
      </Edit>
    </>
  );
};
