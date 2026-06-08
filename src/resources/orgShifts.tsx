import { useEffect, useState } from 'react';
import {
  List,
  Datagrid,
  DateField,
  FunctionField,
  SelectInput,
  DateInput,
  useGetList,
  useDataProvider,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { Box, Chip, CircularProgress, Typography } from '@mui/material';
import { formatDuration, shiftStatusLabel, checklistStatusLabel } from '../utils/format';

const statusChoices = [
  { id: 'active', name: 'Активна' },
  { id: 'paused', name: 'На паузе' },
  { id: 'finished', name: 'Завершена' },
];

// Имя сотрудника по user_id из списка участников (для колонки и фильтра).
const EmployeeName = (_props: { label?: string }) => {
  const record = useRecordContext();
  const { data } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const member = (data ?? []).find((m) => m.user_id === record?.user_id);
  return <span>{member?.user_name ?? record?.user_id ?? '—'}</span>;
};

// Фильтр по сотруднику: значения — user_id, подписи — имена участников.
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
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
];

// Разворачиваемая панель: чек-листы конкретной смены.
const ShiftChecklists = () => {
  const record = useRecordContext();
  const dataProvider = useDataProvider();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!record?.id) return;
    let active = true;
    dataProvider
      .getShiftChecklists(String(record.id))
      .then((res: any[]) => {
        if (active) setItems(res);
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [record?.id, dataProvider]);

  if (error) return <Typography color="error">Не удалось загрузить чек-листы</Typography>;
  if (!items) return <CircularProgress size={20} />;
  if (items.length === 0) return <Typography color="text.secondary">Чек-листов нет</Typography>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
      {items.map((it) => (
        <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ minWidth: 220 }}>{it.name}</Typography>
          <Chip size="small" label={it.type === 'shift_start' ? 'Начало' : 'Конец'} />
          <Chip size="small" label={checklistStatusLabel(it.status)} />
          <Typography variant="body2" color="text.secondary">
            {it.items_summary?.completed ?? 0}/{it.items_summary?.total ?? 0}
          </Typography>
          {it.is_required && <Chip size="small" color="warning" label="Обязательный" />}
        </Box>
      ))}
    </Box>
  );
};

export const OrgShiftList = () => (
  <List filters={shiftFilters} sort={{ field: 'started_at', order: 'DESC' }} exporter={false}>
    <Datagrid bulkActionButtons={false} expand={<ShiftChecklists />} rowClick="expand">
      <EmployeeName label="Сотрудник" />
      <DateField source="started_at" label="Начало" showTime />
      <DateField source="finished_at" label="Конец" showTime emptyText="—" />
      <FunctionField label="Статус" render={(r: RaRecord) => shiftStatusLabel(r.status)} />
      <FunctionField label="Отработано" render={(r: RaRecord) => formatDuration(r.worked_seconds)} />
      <FunctionField
        label="Чек-листы"
        render={(r: RaRecord) =>
          r.has_incomplete_required_checklists ? (
            <Chip size="small" color="warning" label="Есть незаполненные" />
          ) : (
            '—'
          )
        }
      />
    </Datagrid>
  </List>
);
