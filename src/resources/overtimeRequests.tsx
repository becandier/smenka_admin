import { useState } from 'react';
import {
  List,
  Datagrid,
  FunctionField,
  SelectInput,
  DateInput,
  Title,
  useDataProvider,
  useListContext,
  useNotify,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import {
  formatDuration,
  OVERTIME_STATUS_CHOICES,
  overtimeStatusLabel,
  scheduleErrorMessage,
} from '../utils/format';
import { MemberSelectFilter } from '../components/MemberSelectFilter';
import { MemberNameCell } from '../components/MemberNameCell';
import { DateRangeAlert } from '../components/DateRangeAlert';
import { isDayRangeInvalid } from '../utils/dates';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { useIsReadOnly } from '../subscription/SubscriptionContext';
import { OrganizationTimeText } from '../components/TimeText';
import { useOrgTimezone } from '../utils/useOrgTimezone';

const overtimeFilters = [
  <SelectInput
    key="status"
    source="status"
    label="Статус"
    choices={OVERTIME_STATUS_CHOICES}
    alwaysOn
  />,
  <MemberSelectFilter key="user_id" source="user_id" label="Сотрудник" />,
  // Окно по shift.started_at, обе границы включительно; день → UTC-границы конвертирует
  // dataProvider (тот же toUtcDayRangeFilter, что у смен/аудита).
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
];

// Диалог согласования/отклонения — необязательный комментарий администратора (backend.md,
// PATCH .../overtime-requests/{id} {status, review_comment?}).
const ReviewDialog = ({
  requestId,
  action,
  onClose,
  onDone,
}: {
  requestId: string;
  action: 'approved' | 'rejected';
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const title = action === 'approved' ? 'Согласовать переработку?' : 'Отклонить переработку?';

  const submit = async () => {
    setSaving(true);
    try {
      await dataProvider.reviewOvertimeRequest(requestId, {
        status: action,
        review_comment: comment.trim() === '' ? null : comment.trim(),
      });
      notify(action === 'approved' ? 'Переработка согласована' : 'Переработка отклонена', {
        type: 'success',
      });
      onDone();
    } catch (e: any) {
      if (e?.body?.code === 'OVERTIME_ALREADY_REVIEWED') {
        notify('Заявка уже рассмотрена', { type: 'warning' });
        onDone();
      } else {
        notify(scheduleErrorMessage(e, 'Ошибка рассмотрения заявки'), { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Решение необратимо: изменить его можно только через отклонение и новую заявку сотрудника.
        </DialogContentText>
        <MuiTextField
          label="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          fullWidth
          multiline
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="contained"
          color={action === 'approved' ? 'success' : 'error'}
          onClick={() => void submit()}
          disabled={saving}
        >
          {action === 'approved' ? 'Согласовать' : 'Отклонить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Render-хелперы колонок.
// Бэкенд отдаёт объект user: {user_name, display_name, email} (backend.md,
// OrgOvertimeRequestUser) — единая ячейка «сотрудник», как в списке смен (orgShifts.tsx).
const employeeField = (r: RaRecord) => (
  <MemberNameCell user_name={r.user?.user_name} display_name={r.user?.display_name} />
);
const shiftField = (r: RaRecord) => {
  const shift = r.shift ?? {};
  const hasPeriod = Boolean(shift.started_at && shift.finished_at);
  return (
    <Stack spacing={0}>
      <Typography variant="body2">
        {hasPeriod ? (
          <>
            <OrganizationTimeText
              value={shift.started_at}
              timeZone={shift.organization_timezone ?? r.organization_timezone}
            />
            {' – '}
            <OrganizationTimeText
              value={shift.finished_at}
              timeZone={shift.organization_timezone ?? r.organization_timezone}
            />
          </>
        ) : '—'}
      </Typography>
      {shift.work_location_name && (
        <Typography variant="caption" color="text.secondary">
          {shift.work_location_name}
        </Typography>
      )}
    </Stack>
  );
};
const planField = (r: RaRecord) => {
  const shift = r.shift ?? {};
  if (!shift.scheduled_start_at || !shift.scheduled_end_at) return '—';
  return (
    <Stack spacing={0}>
      <Typography variant="body2">
        <OrganizationTimeText
          value={shift.scheduled_start_at}
          timeZone={shift.organization_timezone ?? r.organization_timezone}
        />
        {' – '}
        <OrganizationTimeText
          value={shift.scheduled_end_at}
          timeZone={shift.organization_timezone ?? r.organization_timezone}
        />
      </Typography>
      {shift.schedule_name && (
        <Typography variant="caption" color="text.secondary">
          {shift.schedule_name}
        </Typography>
      )}
    </Stack>
  );
};
const minutesField = (r: RaRecord) => formatDuration((r.minutes ?? 0) * 60);
const statusField = (r: RaRecord) => {
  const color: 'warning' | 'success' | 'error' =
    r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'error';
  return <Chip size="small" color={color} label={overtimeStatusLabel(r.status)} />;
};

const OvertimeEmpty = () => (
  <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
    <Typography variant="h6">Заявок по выбранным фильтрам нет</Typography>
  </Box>
);

// Кнопки «Согласовать»/«Отклонить» — видны только для pending; после рассмотрения строка
// перестаёт показывать действия (admin.md: «После рассмотрения кнопки исчезают»).
const RowActions = ({ record }: { record: RaRecord }) => {
  const refresh = useRefresh();
  const isReadOnly = useIsReadOnly();
  const [dialog, setDialog] = useState<'approved' | 'rejected' | null>(null);
  // Read-only (backend.md «Read-only режим»): рассмотрение заявки — не из исключений.
  if (record.status !== 'pending' || isReadOnly) return null;
  return (
    <Stack direction="row" spacing={0.5}>
      <Button
        size="small"
        color="success"
        startIcon={<CheckIcon />}
        onClick={() => setDialog('approved')}
      >
        Согласовать
      </Button>
      <Button
        size="small"
        color="error"
        startIcon={<CloseIcon />}
        onClick={() => setDialog('rejected')}
      >
        Отклонить
      </Button>
      {dialog && (
        <ReviewDialog
          requestId={String(record.id)}
          action={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </Stack>
  );
};

const OvertimeDatagrid = () => {
  const { isPending, data } = useListContext();
  if (!isPending && (data ?? []).length === 0) return <OvertimeEmpty />;
  return (
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <FunctionField label="Сотрудник" render={employeeField} />
      <FunctionField label="Смена" render={shiftField} sortable={false} />
      <FunctionField label="План" render={planField} sortable={false} />
      <FunctionField label="Переработка" render={minutesField} sortable={false} />
      <FunctionField
        label="Комментарий"
        render={(r: RaRecord) => r.comment ?? '—'}
        sortable={false}
      />
      <FunctionField label="Статус" render={statusField} sortable={false} />
      <FunctionField
        label=""
        render={(r: RaRecord) => <RowActions record={r} />}
        sortable={false}
      />
    </Datagrid>
  );
};

const NoAccess = () => (
  <Box sx={{ p: 3 }}>
    <Title title="Переработки" />
    <Typography color="text.secondary">
      Раздел доступен владельцу и администратору организации.
    </Typography>
  </Box>
);

// Реестр заявок на переработку (owner/admin — admin.md, «Заявки на переработку»). По умолчанию
// открывается на pending; серверная пагинация/фильтры. Согласование/отклонение — по строке.
export const OvertimeRequestList = () => {
  const role = useMyOrgRole();
  const timeZone = useOrgTimezone();
  if (role !== 'owner' && role !== 'admin') return <NoAccess />;
  return (
    <List
      filters={overtimeFilters}
      filter={{ __organization_timezone: timeZone }}
      filterDefaultValues={{ status: 'pending' }}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={false}
      empty={false}
    >
      <DateRangeAlertGuard />
    </List>
  );
};

// DateRangeAlert + Datagrid обёрнуты вместе, чтобы не показывать устаревшую сетку под
// баннером невалидного диапазона (тот же приём, что в OrgShiftList/AuditLogList).
const DateRangeAlertGuard = () => {
  const { filterValues } = useListContext();
  return (
    <>
      <DateRangeAlert />
      {!isDayRangeInvalid(filterValues?.date_from, filterValues?.date_to) && <OvertimeDatagrid />}
    </>
  );
};
