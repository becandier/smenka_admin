import {
  Edit,
  SimpleForm,
  BooleanInput,
  NumberInput,
  Title,
  minValue,
  maxValue,
  useGetList,
} from 'react-admin';
import { Box, Typography } from '@mui/material';
import { useCurrentOrg } from '../orgContext';

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

// Singleton-форма настроек организации: GET/PATCH /organizations/{org}/settings.
// id записи = org_id (dataProvider маппит organization_id → id).
export const SettingsPage = () => {
  const { org } = useCurrentOrg();

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Настройки" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  return (
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
        <NumberInput
          source="auto_finish_hours"
          label="Автозавершение через, ч"
          helperText="1–48; пусто — отключено"
          validate={[minValue(1), maxValue(48)]}
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
  );
};
