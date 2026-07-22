import { useCallback, useEffect, useState } from 'react';
import { useDataProvider, useGetList, useNotify, useRecordContext } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import {
  formatDateTime,
  formatMoneyMinor,
  parseRublesToMinor,
  shiftStatusLabel,
} from '../utils/format';
import { localInputToUtcIso, utcIsoToLocalInput } from '../utils/dates';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { MemberNameCell } from '../components/MemberNameCell';

// Penalty (admin-facing) — снимок суммы/причины на момент назначения (см. fines/admin.md).
// display_name — member_display_name/admin.md: рядом с настоящим user_name, null если не задан.
export interface Penalty {
  id: string;
  member_id: string;
  user_id: string;
  user_name: string;
  display_name: string | null;
  template_id: string | null;
  reason: string;
  amount_minor: number;
  currency: string;
  shift_id: string | null;
  occurred_at: string;
  comment: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface PenaltyTemplate {
  id: string;
  reason: string;
  amount_minor: number;
}

interface ShiftOption {
  id: string;
  label: string;
}

interface PenaltyFormErrors {
  reason?: string;
  amount?: string;
  occurred?: string;
  shift?: string;
}

type AmountSource = 'template' | 'custom';

// Диалог «Назначить штраф» (POST) / «Исправить» (PATCH). Используется и в карточке
// участника, и на детали смены (там смена зафиксирована через lockedShift).
const PenaltyFormDialog = ({
  memberId,
  userId,
  lockedShift,
  editing,
  onClose,
  onDone,
}: {
  memberId: string;
  userId: string | null; // для селекта смен сотрудника; null → селект скрыт
  lockedShift?: ShiftOption | null; // фиксированная смена (с экрана «Смены»)
  editing: Penalty | null;
  onClose: () => void;
  onDone: () => void; // успех ИЛИ устаревшая запись (404): закрыть и перезагрузить
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const [source, setSource] = useState<AmountSource>(editing?.template_id ? 'template' : 'custom');
  const [templateId, setTemplateId] = useState<string>(editing?.template_id ?? '');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount_minor / 100) : '');
  const [shiftId, setShiftId] = useState<string>(lockedShift?.id ?? editing?.shift_id ?? '');
  const [occurredAt, setOccurredAt] = useState(
    editing ? utcIsoToLocalInput(editing.occurred_at) : '',
  );
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [errors, setErrors] = useState<PenaltyFormErrors>({});
  const [saving, setSaving] = useState(false);

  // Шаблоны нужны только в режиме создания «Из шаблона».
  const { data: templates } = useGetList<PenaltyTemplate>(
    'penalty-templates',
    { pagination: { page: 1, perPage: 200 }, sort: { field: 'created_at', order: 'DESC' } },
    { enabled: !editing },
  );
  // Смены сотрудника для привязки (если смена не зафиксирована и есть user_id).
  const { data: shifts } = useGetList(
    'org-shifts',
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'started_at', order: 'DESC' },
      filter: { user_id: userId ?? '' },
    },
    { enabled: Boolean(userId) && !lockedShift },
  );

  const shiftOptions: ShiftOption[] = (shifts ?? []).map((s) => ({
    id: String(s.id),
    label: `${formatDateTime(s.started_at)} · ${shiftStatusLabel(s.status)}`,
  }));

  const applyTemplate = (id: string): void => {
    setTemplateId(id);
    const tpl = (templates ?? []).find((t) => t.id === id);
    if (tpl) {
      setReason(tpl.reason);
      setAmount(String(tpl.amount_minor / 100));
    }
  };

  const handleSubmit = async (): Promise<void> => {
    const nextErrors: PenaltyFormErrors = {};
    const minor = parseRublesToMinor(amount);
    if (reason.trim() === '') nextErrors.reason = 'Укажите причину';
    if (minor === null) nextErrors.amount = 'Сумма больше нуля, не более 2 знаков';

    const effectiveShift = lockedShift?.id ?? (shiftId === '' ? null : shiftId);
    const occurredIso = occurredAt === '' ? null : localInputToUtcIso(occurredAt);
    // Дата обязательна, только если смена не выбрана (иначе бэк подставит shift.started_at).
    if (!effectiveShift && !occurredIso) nextErrors.occurred = 'Укажите дату (или выберите смену)';
    if (occurredAt !== '' && !occurredIso) nextErrors.occurred = 'Некорректная дата';

    if (Object.keys(nextErrors).length > 0 || minor === null) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await dataProvider.update('penalties', {
          id: editing.id,
          data: {
            reason: reason.trim(),
            amount_minor: minor,
            currency: 'RUB',
            shift_id: effectiveShift,
            occurred_at: occurredIso ?? editing.occurred_at,
            comment: comment.trim() === '' ? null : comment.trim(),
          },
          previousData: editing,
        });
        notify('Штраф исправлен', { type: 'success' });
      } else {
        await dataProvider.create('penalties', {
          data: {
            member_id: memberId,
            template_id: source === 'template' && templateId !== '' ? templateId : null,
            reason: reason.trim(),
            amount_minor: minor,
            currency: 'RUB',
            shift_id: effectiveShift,
            occurred_at: occurredIso,
            comment: comment.trim() === '' ? null : comment.trim(),
          },
        });
        notify('Штраф назначен', { type: 'success' });
      }
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        setErrors({
          reason: fieldErrors.reason,
          amount: fieldErrors.amount_minor,
          occurred: fieldErrors.occurred_at,
          shift: fieldErrors.shift_id,
        });
        if (Object.keys(fieldErrors).length === 0) {
          notify(e?.message ?? 'Некорректные данные', { type: 'error' });
        }
      } else if (code === 'SHIFT_NOT_FOUND') {
        setErrors({ shift: 'Смена не найдена или не принадлежит этому сотруднику' });
      } else if (code === 'PENALTY_TEMPLATE_NOT_FOUND') {
        notify('Шаблон не найден — введите причину и сумму вручную', { type: 'warning' });
      } else if (code === 'MEMBER_NOT_FOUND') {
        notify('Сотрудник не найден или не активен', { type: 'warning' });
        onDone();
      } else if (code === 'PENALTY_NOT_FOUND') {
        notify('Штраф не найден', { type: 'warning' });
        onDone();
      } else {
        notify(e?.message ?? 'Ошибка сохранения', { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const noTemplates = !editing && source === 'template' && (templates ?? []).length === 0;

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editing ? 'Исправить штраф' : 'Назначить штраф'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!editing && (
            <FormControl>
              <FormLabel sx={{ fontSize: '0.8rem' }}>Источник суммы</FormLabel>
              <RadioGroup
                row
                value={source}
                onChange={(e) => setSource(e.target.value as AmountSource)}
              >
                <FormControlLabel
                  value="template"
                  control={<Radio size="small" />}
                  label="Из шаблона"
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio size="small" />}
                  label="Кастомный"
                />
              </RadioGroup>
            </FormControl>
          )}

          {!editing && source === 'template' && (
            <TextField
              select
              label="Шаблон"
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              helperText={
                noTemplates
                  ? 'Шаблонов нет — введите причину и сумму вручную (Кастомный)'
                  : undefined
              }
              disabled={noTemplates}
            >
              {(templates ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.reason} — {formatMoneyMinor(t.amount_minor)}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Причина"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={Boolean(errors.reason)}
            helperText={errors.reason}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Сумма, ₽"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={Boolean(errors.amount)}
            helperText={errors.amount}
            inputProps={{ inputMode: 'decimal' }}
          />

          {lockedShift ? (
            <TextField label="Смена" value={lockedShift.label} disabled />
          ) : (
            userId && (
              <TextField
                select
                label="Смена (опционально)"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                error={Boolean(errors.shift)}
                helperText={errors.shift ?? 'Если выбрать смену, дату можно не указывать'}
              >
                <MenuItem value="">— без смены —</MenuItem>
                {shiftOptions.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.label}
                  </MenuItem>
                ))}
              </TextField>
            )
          )}

          <TextField
            type="datetime-local"
            label="Дата штрафа"
            InputLabelProps={{ shrink: true }}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            error={Boolean(errors.occurred)}
            helperText={
              errors.occurred ?? (lockedShift ? 'Если не указать — возьмётся из смены' : undefined)
            }
          />
          <TextField
            label="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            multiline
            inputProps={{ maxLength: 500 }}
          />
          <TextField label="Валюта" value="RUB" disabled />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {editing ? 'Исправить' : 'Назначить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Секция «Штрафы» в карточке участника (members Edit). Список активных штрафов
// (occurred_at DESC) + назначение/снятие/исправление. Доступ — org owner/admin.
export const MemberPenaltiesSection = () => {
  const record = useRecordContext();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [penalties, setPenalties] = useState<Penalty[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Penalty | null }>({
    open: false,
    editing: null,
  });
  const [deleting, setDeleting] = useState<Penalty | null>(null);

  const memberId = record?.id ? String(record.id) : null;
  const userId = record?.user_id ? String(record.user_id) : null;
  const canView = role === 'owner' || role === 'admin';
  const canEdit = role === 'owner' || role === 'admin';

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoadError(false);
    try {
      const res = await dataProvider.getList('penalties', {
        pagination: { page: 1, perPage: 100 },
        sort: { field: 'occurred_at', order: 'DESC' },
        filter: { member_id: memberId },
      });
      setPenalties(res.data as Penalty[]);
    } catch {
      setLoadError(true);
      setPenalties([]);
    }
  }, [dataProvider, memberId]);

  useEffect(() => {
    if (canView && memberId) void load();
  }, [canView, memberId, load]);

  if (!record || !canView) return null;

  const reloadAll = (): void => {
    setDialog({ open: false, editing: null });
    setDeleting(null);
    void load();
  };

  const handleDelete = async (p: Penalty): Promise<void> => {
    try {
      await dataProvider.delete('penalties', { id: p.id, previousData: p });
      notify('Штраф снят', { type: 'success' });
    } catch (e: any) {
      if (e?.body?.code === 'PENALTY_NOT_FOUND') {
        notify('Штраф не найден', { type: 'warning' });
      } else {
        notify(e?.message ?? 'Ошибка снятия штрафа', { type: 'error' });
      }
    }
    reloadAll();
  };

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap">
        <Typography variant="h6">Штрафы</Typography>
        <MemberNameCell user_name={record.user_name} display_name={record.display_name} />
        {canEdit && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ open: true, editing: null })}
          >
            Назначить штраф
          </Button>
        )}
      </Stack>

      {loadError && <Alert severity="error">Не удалось загрузить штрафы</Alert>}
      {!penalties && !loadError && <CircularProgress size={20} />}

      {penalties && penalties.length === 0 && !loadError && (
        <Typography color="text.secondary">У сотрудника нет активных штрафов.</Typography>
      )}

      {penalties && penalties.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Причина</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell>Смена</TableCell>
              <TableCell>Комментарий</TableCell>
              {canEdit && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {penalties.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDateTime(p.occurred_at)}</TableCell>
                <TableCell>{p.reason}</TableCell>
                <TableCell align="right">{formatMoneyMinor(p.amount_minor)}</TableCell>
                <TableCell>
                  {p.shift_id ? <Chip size="small" variant="outlined" label="К смене" /> : '—'}
                </TableCell>
                <TableCell>{p.comment ?? '—'}</TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      aria-label="Исправить"
                      onClick={() => setDialog({ open: true, editing: p })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Снять штраф"
                      onClick={() => setDeleting(p)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dialog.open && memberId && (
        <PenaltyFormDialog
          memberId={memberId}
          userId={userId}
          editing={dialog.editing}
          onClose={() => setDialog({ open: false, editing: null })}
          onDone={reloadAll}
        />
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Снять штраф?</DialogTitle>
          <DialogContent>
            <Typography>
              {formatMoneyMinor(deleting.amount_minor)} — {deleting.reason}. Штраф перестанет
              учитываться в зарплате.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Отмена</Button>
            <Button color="error" variant="contained" onClick={() => void handleDelete(deleting)}>
              Снять
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

// Блок «Штраф» на детали орг-смены (org-shifts Show): кнопка «Оштрафовать за смену»
// с зафиксированными member_id/shift_id. member_id выводим из shift.user_id через members.
// Доступ — org owner/admin; super_admin (видит чужие смены, но штрафы не ведёт) → ничего.
export const ShiftPenaltySection = () => {
  const record = useRecordContext();
  const role = useMyOrgRole();
  const [open, setOpen] = useState(false);
  const canManage = role === 'owner' || role === 'admin';

  const { data: members, isPending } = useGetList(
    'members',
    { pagination: { page: 1, perPage: 500 }, sort: { field: 'user_name', order: 'ASC' } },
    { enabled: canManage && Boolean(record) },
  );

  if (!record || !canManage) return null;

  const userId = record.user_id ? String(record.user_id) : null;
  const shiftId = record.id ? String(record.id) : null;
  const member = (members ?? []).find((m) => String(m.user_id) === userId);
  const memberId = member?.id ? String(member.id) : null;
  const lockedLabel = `Смена от ${formatDateTime(record.started_at)}`;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Штраф
        </Typography>
        <Box sx={{ mb: 1.5 }}>
          <MemberNameCell user_name={record.user_name} display_name={record.display_name} />
        </Box>
        {isPending ? (
          <CircularProgress size={20} />
        ) : !memberId ? (
          <Typography color="text.secondary">
            Сотрудник не активен в организации — штраф недоступен.
          </Typography>
        ) : (
          <Button
            variant="contained"
            color="error"
            startIcon={<MoneyOffIcon />}
            onClick={() => setOpen(true)}
          >
            Оштрафовать за смену
          </Button>
        )}
        {open && memberId && shiftId && (
          <PenaltyFormDialog
            memberId={memberId}
            userId={userId}
            lockedShift={{ id: shiftId, label: lockedLabel }}
            editing={null}
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
};
