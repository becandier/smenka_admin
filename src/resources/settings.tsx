import {
  Edit,
  SimpleForm,
  BooleanInput,
  NumberInput,
  Title,
  minValue,
  maxValue,
} from 'react-admin';
import { Box, Typography } from '@mui/material';
import { useCurrentOrg } from '../orgContext';

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
