import { TextField } from '@mui/material';
import { INVALID_RANGE_MESSAGE } from '../utils/dates';

// Пара инпутов произвольного диапазона (календарные дни) с подсветкой невалидного
// диапазона; используется статистикой и зарплатой. Конвертацию выбранных дней в
// UTC-границы (начало/конец дня) делает вызывающий код через utils/dates.
export const DateRangeFields = ({
  dateFrom,
  dateTo,
  onChangeFrom,
  onChangeTo,
  invalid,
}: {
  dateFrom: string;
  dateTo: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  invalid: boolean;
}) => (
  <>
    <TextField
      size="small"
      type="date"
      label="С даты"
      InputLabelProps={{ shrink: true }}
      value={dateFrom}
      onChange={(e) => onChangeFrom(e.target.value)}
      error={invalid}
      helperText={invalid ? INVALID_RANGE_MESSAGE : undefined}
    />
    <TextField
      size="small"
      type="date"
      label="По дату"
      InputLabelProps={{ shrink: true }}
      value={dateTo}
      onChange={(e) => onChangeTo(e.target.value)}
      error={invalid}
    />
  </>
);
