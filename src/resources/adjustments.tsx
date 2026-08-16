import { useMemo, useState } from 'react';
import {
  List,
  Datagrid,
  DateField,
  TextField,
  FunctionField,
  SelectInput,
  DateInput,
  ListContextProvider,
  TopToolbar,
  useDataProvider,
  useGetList,
  useListContext,
  useNotify,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField as MuiTextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  ADJUSTMENT_TYPE_CHOICES,
  adjustmentErrorMessage,
  adjustmentTypeOf,
  formatDateTime,
  formatMoneyMinor,
  formatRubles,
  formatSignedMoneyMinor,
  parseRublesToMinor,
  shiftStatusLabel,
} from '../utils/format';
import { utcIsoToZonedParts, zonedDayStartToUtcIso } from '../utils/dates';
import { formatMemberNameFlat } from '../utils/memberName';
import { useOrgTimezone } from '../utils/useOrgTimezone';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { MemberSelectFilter } from '../components/MemberSelectFilter';
import { DateRangeAlert } from '../components/DateRangeAlert';
import { MemberNameCell } from '../components/MemberNameCell';
import { wideDatagridScrollSx } from '../theme';

// Ручные начисления/удержания (manual_time_entry B1-B4, payroll_adjustments). Ресурс
// «Начисления» (`/adjustments`) — owner/admin своей org; super_admin сквозным доступом не видит
// (как штрафы и зарплата, backend.md R8).

export interface Adjustment {
  id: string;
  organization_id: string;
  member_id: string;
  user_id: string;
  user_name: string;
  display_name: string | null;
  shift_id: string | null;
  amount_minor: number;
  currency: string;
  reason: string;
  comment: string | null;
  occurred_at: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
}

interface CurrentRate {
  rate_amount_minor: number;
  rate_type: string;
  currency: string;
  effective_from: string;
}

interface RawMember {
  id: string;
  user_id: string;
  user_name: string;
  display_name: string | null;
  current_rate: CurrentRate | null;
}

interface LockedMember {
  id: string; // organization_members.id
  userId: string;
  label: string;
}

interface LockedShift {
  id: string;
  label: string;
}

interface AdjustmentFormErrors {
  member?: string;
  amount?: string;
  reason?: string;
  occurred?: string;
  shift?: string;
}

type AdjustmentType = 'credit' | 'debit';
type AmountMode = 'amount' | 'hours';

// --- §4.2: форма создания/правки начисления (+ калькулятор «Часы × ставка») ---
export const AdjustmentFormDialog = ({
  lockedMember,
  lockedShift,
  defaultOccurredAt,
  editing,
  onClose,
  onDone,
}: {
  lockedMember?: LockedMember | null;
  lockedShift?: LockedShift | null;
  defaultOccurredAt?: string | null;
  editing: Adjustment | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const tz = useOrgTimezone();

  const { data: members } = useGetList<RawMember>('members', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'user_name', order: 'ASC' },
  });

  const [memberId, setMemberId] = useState<string>(lockedMember?.id ?? editing?.member_id ?? '');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    lockedMember?.userId ?? editing?.user_id ?? null,
  );
  const [type, setType] = useState<AdjustmentType>(
    editing ? (editing.amount_minor >= 0 ? 'credit' : 'debit') : 'credit',
  );
  const [mode, setMode] = useState<AmountMode>('amount');
  const [amount, setAmount] = useState<string>(
    editing ? String(Math.abs(editing.amount_minor) / 100) : '',
  );
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [reasonTouched, setReasonTouched] = useState(Boolean(editing));
  const [shiftId, setShiftId] = useState<string>(lockedShift?.id ?? editing?.shift_id ?? '');
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    const source = editing?.occurred_at ?? defaultOccurredAt ?? new Date().toISOString();
    return utcIsoToZonedParts(source, tz)?.day ?? '';
  });
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [errors, setErrors] = useState<AdjustmentFormErrors>({});
  const [saving, setSaving] = useState(false);

  const memberOptions = (members ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    user_name: m.user_name,
    display_name: m.display_name ?? null,
  }));
  const currentMember = (members ?? []).find((m) => m.id === memberId) ?? null;
  const hourlyRate =
    currentMember?.current_rate && currentMember.current_rate.rate_type === 'hourly'
      ? currentMember.current_rate
      : null;

  const { data: memberShifts } = useGetList(
    'org-shifts',
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'started_at', order: 'DESC' },
      filter: { user_id: selectedUserId ?? '' },
    },
    { enabled: Boolean(selectedUserId) && !lockedShift },
  );
  const shiftOptions = (memberShifts ?? []).map((s) => ({
    id: String(s.id),
    label: `${formatDateTime(s.started_at)} · ${shiftStatusLabel(s.status)}`,
  }));

  const hoursNum = (() => {
    const n = Number(hours.trim().replace(',', '.'));
    return hours.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  })();
  const hoursPreviewMinor =
    mode === 'hours' && hourlyRate && hoursNum !== null
      ? Math.round(hoursNum * hourlyRate.rate_amount_minor)
      : null;

  const applyHoursReason = (nextType: AdjustmentType, hoursValue: string): void => {
    if (reasonTouched || hoursValue.trim() === '') return;
    const label = nextType === 'credit' ? 'Доплата' : 'Удержание';
    setReason(`${label} за ${hoursValue.trim()} ч`);
  };

  const onTypeChange = (value: AdjustmentType | null): void => {
    if (!value) return;
    setType(value);
    if (mode === 'hours') applyHoursReason(value, hours);
  };

  const onHoursChange = (value: string): void => {
    setHours(value);
    if (mode === 'hours') applyHoursReason(type, value);
  };

  const onModeChange = (value: AmountMode | null): void => {
    if (!value) return;
    setMode(value);
    if (value === 'hours') applyHoursReason(type, hours);
  };

  const signedMinor = (() => {
    const magnitude = mode === 'amount' ? parseRublesToMinor(amount) : hoursPreviewMinor;
    if (magnitude === null || magnitude === undefined || magnitude <= 0) return null;
    return type === 'credit' ? Math.abs(magnitude) : -Math.abs(magnitude);
  })();

  const effectiveShiftId = lockedShift ? lockedShift.id : shiftId === '' ? null : shiftId;

  const validate = (): boolean => {
    const next: AdjustmentFormErrors = {};
    if (!lockedMember && !memberId) next.member = 'Выберите сотрудника';
    if (signedMinor === null) {
      next.amount =
        mode === 'hours'
          ? 'Укажите часы больше нуля (нужна почасовая ставка)'
          : 'Сумма больше нуля, не более 2 знаков';
    }
    if (reason.trim() === '') next.reason = 'Укажите основание';
    if (!occurredAt) next.occurred = 'Укажите дату';
    setErrors(next);
    return Object.keys(next).length === 0 && signedMinor !== null;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validate() || signedMinor === null) return;
    setSaving(true);
    try {
      const occurredIso = zonedDayStartToUtcIso(occurredAt, tz);
      if (editing) {
        await dataProvider.update('adjustments', {
          id: editing.id,
          data: {
            amount_minor: signedMinor,
            reason: reason.trim(),
            comment: comment.trim() === '' ? null : comment.trim(),
            occurred_at: occurredIso,
            shift_id: effectiveShiftId,
          },
          previousData: editing,
        });
        notify('Начисление исправлено', { type: 'success' });
      } else {
        await dataProvider.create('adjustments', {
          data: {
            member_id: lockedMember ? lockedMember.id : memberId,
            amount_minor: signedMinor,
            currency: 'RUB',
            reason: reason.trim(),
            occurred_at: occurredIso,
            shift_id: effectiveShiftId,
            comment: comment.trim() === '' ? null : comment.trim(),
          },
        });
        notify('Начисление создано', { type: 'success' });
      }
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        setErrors({
          member: fieldErrors.member_id,
          amount: fieldErrors.amount_minor,
          reason: fieldErrors.reason,
          occurred: fieldErrors.occurred_at,
          shift: fieldErrors.shift_id,
        });
        if (Object.keys(fieldErrors).length === 0) {
          notify(e?.message ?? 'Некорректные данные', { type: 'error' });
        }
      } else if (code === 'MEMBER_NOT_FOUND') {
        setErrors({ member: adjustmentErrorMessage(e) });
      } else if (code === 'SHIFT_NOT_FOUND') {
        setErrors({ shift: adjustmentErrorMessage(e) });
      } else if (code === 'ADJUSTMENT_NOT_FOUND') {
        notify(adjustmentErrorMessage(e), { type: 'warning' });
        onDone();
      } else {
        notify(adjustmentErrorMessage(e, 'Ошибка сохранения'), { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editing ? 'Исправить начисление' : 'Добавить начисление'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {lockedMember ? (
            <MuiTextField label="Сотрудник" value={lockedMember.label} disabled />
          ) : (
            <Autocomplete
              options={memberOptions}
              value={memberOptions.find((o) => o.id === memberId) ?? null}
              getOptionLabel={(o) => formatMemberNameFlat(o)}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              disabled={Boolean(editing)}
              onChange={(_, value) => {
                setMemberId(value?.id ?? '');
                setSelectedUserId(value?.userId ?? null);
                setShiftId('');
              }}
              renderInput={(params) => (
                <MuiTextField
                  {...params}
                  label="Сотрудник"
                  error={Boolean(errors.member)}
                  helperText={errors.member}
                />
              )}
            />
          )}

          <ToggleButtonGroup size="small" exclusive value={type} onChange={(_, v) => onTypeChange(v)}>
            <ToggleButton value="credit">Доплата (+)</ToggleButton>
            <ToggleButton value="debit">Удержание (−)</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => onModeChange(v)}>
            <ToggleButton value="amount">Сумма</ToggleButton>
            <ToggleButton value="hours" disabled={!hourlyRate}>
              Часы × ставка
            </ToggleButton>
          </ToggleButtonGroup>
          {!hourlyRate && mode === 'amount' && (
            <Typography variant="caption" color="text.secondary">
              У сотрудника не задана почасовая ставка — калькулятор «Часы × ставка» недоступен.
            </Typography>
          )}

          {mode === 'amount' ? (
            <MuiTextField
              label="Сумма, ₽"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={Boolean(errors.amount)}
              helperText={errors.amount}
              inputProps={{ inputMode: 'decimal' }}
            />
          ) : (
            <Stack spacing={0.5}>
              <MuiTextField
                label="Часы"
                value={hours}
                onChange={(e) => onHoursChange(e.target.value)}
                error={Boolean(errors.amount)}
                helperText={errors.amount}
                inputProps={{ inputMode: 'decimal' }}
              />
              {hourlyRate && hoursNum !== null && hoursPreviewMinor !== null && (
                <Typography variant="caption" color="text.secondary">
                  {hours.trim()} ч × {formatRubles(hourlyRate.rate_amount_minor)} ₽/ч ={' '}
                  {formatRubles(hoursPreviewMinor)} ₽
                </Typography>
              )}
            </Stack>
          )}

          <MuiTextField
            label="Основание"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonTouched(true);
            }}
            error={Boolean(errors.reason)}
            helperText={errors.reason}
            inputProps={{ maxLength: 200 }}
          />

          <MuiTextField
            type="date"
            label="Дата"
            InputLabelProps={{ shrink: true }}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            error={Boolean(errors.occurred)}
            helperText={errors.occurred}
          />

          {lockedShift ? (
            <MuiTextField label="Смена" value={lockedShift.label} disabled />
          ) : (
            selectedUserId && (
              <MuiTextField
                select
                label="Смена (опционально)"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                error={Boolean(errors.shift)}
                helperText={errors.shift}
              >
                <MenuItem value="">— без смены —</MenuItem>
                {shiftOptions.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.label}
                  </MenuItem>
                ))}
              </MuiTextField>
            )
          )}

          <MuiTextField
            label="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            multiline
            inputProps={{ maxLength: 500 }}
          />

          <Typography variant="caption" color="text.secondary">
            Сотрудник получит уведомление.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          {editing ? 'Исправить' : 'Добавить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- §4.1: список начислений организации ---

const nameField = (r: RaRecord) => (
  <MemberNameCell user_name={r.user_name} display_name={r.display_name} />
);
const amountField = (r: RaRecord) => (
  <Typography sx={{ color: r.amount_minor >= 0 ? 'success.main' : 'error.main' }}>
    {formatSignedMoneyMinor(r.amount_minor)}
  </Typography>
);
const shiftLinkField = (r: RaRecord) =>
  r.shift_id ? <Link to={`/org-shifts/${r.shift_id}/show`}>Смена</Link> : '—';

const AdjustmentRowActions = ({ record }: { record: Adjustment }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDelete = async (): Promise<void> => {
    setSaving(true);
    try {
      await dataProvider.delete('adjustments', { id: record.id, previousData: record });
      notify('Начисление отменено', { type: 'success' });
      setDeleting(false);
      refresh();
    } catch (e: any) {
      notify(adjustmentErrorMessage(e, 'Не удалось отменить начисление'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack direction="row" spacing={0.5}>
      <IconButton size="small" aria-label="Исправить" onClick={() => setEditing(true)}>
        <EditIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label="Отменить начисление" onClick={() => setDeleting(true)}>
        <DeleteIcon fontSize="small" />
      </IconButton>
      {editing && (
        <AdjustmentFormDialog
          editing={record}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Dialog open onClose={() => setDeleting(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Отменить начисление?</DialogTitle>
          <DialogContent>
            <Typography>
              {formatMoneyMinor(record.amount_minor)} — {record.reason}. Перестанет учитываться
              в зарплате.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(false)} disabled={saving}>
              Отмена
            </Button>
            <Button color="error" variant="contained" onClick={() => void handleDelete()} disabled={saving}>
              Отменить
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
};

const AdjustmentsEmpty = () => (
  <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
    <Typography variant="h6">Начислений пока нет</Typography>
  </Box>
);

// «Тип» (доплата/удержание) — фильтр по знаку суммы, применяется на клиенте поверх уже
// полученной страницы (admin.md §4.1: «фильтруется на клиенте»; сервер такого параметра
// не знает — см. dataProvider.getList, filterKeys для 'adjustments' его не включает).
const AdjustmentDatagrid = () => {
  const listContext = useListContext();
  const { data, isPending, filterValues } = listContext;
  const type = (filterValues?.type as string | undefined) ?? 'all';

  const filteredData = useMemo(() => {
    if (type === 'all') return data ?? [];
    return (data ?? []).filter((r) => adjustmentTypeOf(r.amount_minor) === type);
  }, [data, type]);

  if (!isPending && filteredData.length === 0) return <AdjustmentsEmpty />;

  return (
    // Спред дискриминированного union ListControllerResult с точечной подменой data —
    // известная типовая шероховатость react-admin (total/isPending и т.п. остаются из той же
    // ветки, что и до подмены, просто TS не может это доказать после spread) — приведение типа
    // к тому же самому объявленному типу, форму объекта не меняем.
    <ListContextProvider value={{ ...listContext, data: filteredData } as typeof listContext}>
      <Datagrid bulkActionButtons={false} sx={wideDatagridScrollSx}>
        <FunctionField label="Сотрудник" render={nameField} sortable={false} />
        <FunctionField label="Сумма" render={amountField} sortable={false} />
        <TextField source="reason" label="Основание" sortable={false} />
        <DateField source="occurred_at" label="Дата" sortable={false} />
        <FunctionField label="Смена" render={shiftLinkField} sortable={false} />
        <TextField source="created_by_name" label="Кто создал" sortable={false} />
        <TextField source="comment" label="Комментарий" emptyText="—" sortable={false} />
        <FunctionField
          label=""
          render={(r: RaRecord) => <AdjustmentRowActions record={r as Adjustment} />}
          sortable={false}
        />
      </Datagrid>
    </ListContextProvider>
  );
};

const adjustmentFilters = [
  <MemberSelectFilter key="member_id" source="member_id" label="Сотрудник" idField="id" alwaysOn />,
  <DateInput key="date_from" source="date_from" label="С даты" />,
  <DateInput key="date_to" source="date_to" label="По дату" />,
  <SelectInput key="type" source="type" label="Тип" choices={ADJUSTMENT_TYPE_CHOICES} />,
];

const AdjustmentListActions = () => {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  return (
    <TopToolbar>
      <Button startIcon={<AddIcon />} onClick={() => setOpen(true)}>
        Добавить начисление
      </Button>
      {open && (
        <AdjustmentFormDialog
          editing={null}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}
    </TopToolbar>
  );
};

// Ресурс «Начисления» (§4.1): owner/admin своей организации, super_admin — «нет доступа»
// (как штрафы/зарплата, R8 backend.md).
export const AdjustmentList = () => {
  const role = useMyOrgRole();
  if (role !== 'owner' && role !== 'admin') {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Нет доступа к разделу «Начисления».</Typography>
      </Box>
    );
  }
  return (
    <List
      filters={adjustmentFilters}
      sort={{ field: 'occurred_at', order: 'DESC' }}
      exporter={false}
      empty={false}
      actions={<AdjustmentListActions />}
    >
      <DateRangeAlert />
      <AdjustmentDatagrid />
    </List>
  );
};
