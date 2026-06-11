import { Alert } from '@mui/material';
import { useListContext } from 'react-admin';
import { INVALID_RANGE_MESSAGE, isDayRangeInvalid } from '../utils/dates';

// Баннер невалидного диапазона дат (from > to) над списком. Сам запрос dataProvider
// блокирует до сети; баннер даёт пользователю обратную связь сразу. Общий для смен и аудита.
export const DateRangeAlert = () => {
  const { filterValues } = useListContext();
  if (!isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to)) return null;
  return (
    <Alert severity="error" sx={{ mb: 1 }}>
      {INVALID_RANGE_MESSAGE}
    </Alert>
  );
};
