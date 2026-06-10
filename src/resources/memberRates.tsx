import { useCallback, useEffect, useState } from 'react';
import { useDataProvider, useNotify, useRecordContext, useRefresh } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
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
import {
  RATE_TYPE_CHOICES,
  RATE_TYPE_LABELS,
  formatDateTime,
  formatRateBadge,
  formatRubles,
  parseRublesToMinor,
} from '../utils/format';
import { localInputToUtcIso, utcIsoToLocalInput } from '../utils/dates';
import { useMyOrgRole } from '../utils/useMyOrgRole';

interface Rate {
  id: string;
  member_id: string;
  rate_amount_minor: number;
  rate_type: string;
  currency: string;
  effective_from: string;
  note: string | null;
  created_at: string;
}

interface RateFormErrors {
  amount?: string;
  effectiveFrom?: string;
  note?: string;
}

const EFFECTIVE_FROM_TAKEN_MESSAGE =
  'На эту дату у сотрудника уже есть ставка — измените дату или исправьте существующую запись';

// Действующая сейчас запись: максимальный effective_from <= now (будущие не считаются).
// Сравнение по timestamp, а не по строкам — устойчиво к варианту суффикса ISO (Z/+00:00).
const findCurrentRate = (rates: Rate[]): Rate | null => {
  const now = Date.now();
  let current: Rate | null = null;
  let currentTs = Number.NEGATIVE_INFINITY;
  for (const rate of rates) {
    const ts = Date.parse(rate.effective_from);
    if (!Number.isNaN(ts) && ts <= now && ts > currentTs) {
      current = rate;
      currentTs = ts;
    }
  }
  return current;
};

// Диалог «Добавить ставку» (POST, новая строка истории) / «Исправить» (PATCH записи).
// Разделение принципиально (ТЗ): правка — для опечаток, повышение — новой строкой.
const RateDialog = ({
  memberId,
  editing,
  onClose,
  onDone,
}: {
  memberId: string;
  editing: Rate | null;
  onClose: () => void;
  // Успех ИЛИ устаревшая запись (404): закрыть диалог и перезагрузить данные.
  onDone: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [amount, setAmount] = useState(editing ? String(editing.rate_amount_minor / 100) : '');
  const [rateType, setRateType] = useState(editing?.rate_type ?? 'hourly');
  const [effectiveFrom, setEffectiveFrom] = useState(
    editing ? utcIsoToLocalInput(editing.effective_from) : '',
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<RateFormErrors>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const nextErrors: RateFormErrors = {};
    const minor = parseRublesToMinor(amount);
    if (minor === null) {
      nextErrors.amount = 'Сумма в рублях больше нуля, не более 2 знаков после запятой';
    }
    const effectiveIso = effectiveFrom === '' ? undefined : localInputToUtcIso(effectiveFrom);
    if (!effectiveIso) {
      nextErrors.effectiveFrom = 'Укажите дату начала действия';
    }
    if (Object.keys(nextErrors).length > 0 || minor === null || !effectiveIso) {
      setErrors(nextErrors);
      return;
    }

    const body: Record<string, unknown> = {
      rate_amount_minor: minor,
      rate_type: rateType,
      currency: 'RUB',
      effective_from: effectiveIso,
      note: note.trim() === '' ? null : note.trim(),
    };
    setSaving(true);
    try {
      if (editing) {
        await dataProvider.updateMemberRate(memberId, editing.id, body);
      } else {
        await dataProvider.createMemberRate(memberId, body);
      }
      notify(editing ? 'Запись исправлена' : 'Ставка добавлена', { type: 'success' });
      onDone();
    } catch (e: any) {
      const code = e?.body?.code;
      if (code === 'RATE_EFFECTIVE_FROM_TAKEN') {
        setErrors({ effectiveFrom: EFFECTIVE_FROM_TAKEN_MESSAGE });
      } else if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        setErrors({
          amount: fieldErrors.rate_amount_minor,
          effectiveFrom: fieldErrors.effective_from,
          note: fieldErrors.note,
        });
        if (Object.keys(fieldErrors).length === 0) {
          notify(e?.message ?? 'Некорректные данные', { type: 'error' });
        }
      } else if (code === 'MEMBER_NOT_FOUND' || code === 'RATE_NOT_FOUND') {
        notify('Запись не найдена', { type: 'warning' });
        onDone();
      } else {
        notify(e?.message ?? 'Ошибка сохранения', { type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editing ? 'Исправить запись' : 'Добавить ставку'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Сумма, ₽"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={Boolean(errors.amount)}
            helperText={errors.amount}
            inputProps={{ inputMode: 'decimal' }}
            autoFocus
          />
          <TextField
            select
            label="Тип ставки"
            value={rateType}
            onChange={(e) => setRateType(e.target.value)}
          >
            {RATE_TYPE_CHOICES.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="datetime-local"
            label="Действует с"
            InputLabelProps={{ shrink: true }}
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            error={Boolean(errors.effectiveFrom)}
            helperText={errors.effectiveFrom}
          />
          <TextField
            label="Комментарий"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={Boolean(errors.note)}
            helperText={errors.note}
          />
          <TextField label="Валюта" value="RUB" disabled />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {editing ? 'Исправить' : 'Добавить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Секция «Ставки» в карточке участника: история (effective_from DESC), действующая
// запись подсвечена. Просмотр — owner и admin; правка — только org admin (ТЗ payroll).
export const MemberRatesSection = () => {
  const record = useRecordContext();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Rate | null }>({
    open: false,
    editing: null,
  });
  const [deleting, setDeleting] = useState<Rate | null>(null);

  const memberId = record?.id ? String(record.id) : null;
  const canView = role === 'owner' || role === 'admin';
  const canEdit = role === 'admin';

  const loadRates = useCallback(async () => {
    if (!memberId) return;
    setLoadError(false);
    try {
      const items: Rate[] = await dataProvider.getMemberRates(memberId);
      // Сервер отдаёт effective_from DESC; сортируем сами на случай старого бэка.
      setRates([...items].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)));
    } catch {
      setLoadError(true);
      setRates([]);
    }
  }, [dataProvider, memberId]);

  useEffect(() => {
    if (canView && memberId) void loadRates();
  }, [canView, memberId, loadRates]);

  if (!record || !canView) return null;

  const current = rates ? findCurrentRate(rates) : null;

  // После мутаций обновляем и историю, и запись участника (current_rate в списке).
  const reloadAll = (): void => {
    setDialog({ open: false, editing: null });
    setDeleting(null);
    void loadRates();
    refresh();
  };

  const handleDelete = async (rate: Rate): Promise<void> => {
    try {
      await dataProvider.deleteMemberRate(String(record.id), rate.id);
      notify('Запись удалена', { type: 'success' });
    } catch (e: any) {
      if (e?.body?.code === 'RATE_NOT_FOUND') {
        notify('Запись не найдена', { type: 'warning' });
      } else {
        notify(e?.message ?? 'Ошибка удаления', { type: 'error' });
      }
    }
    reloadAll();
  };

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap">
        <Typography variant="h6">Ставки</Typography>
        <Chip
          size="small"
          color={current ? 'default' : 'warning'}
          label={formatRateBadge(current)}
        />
        {canEdit && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ open: true, editing: null })}
          >
            Добавить ставку
          </Button>
        )}
      </Stack>

      {loadError && <Alert severity="error">Не удалось загрузить историю ставок</Alert>}
      {!rates && !loadError && <CircularProgress size={20} />}

      {rates && rates.length === 0 && !loadError && (
        <Typography color="text.secondary">Ставок ещё нет. Добавьте первую ставку.</Typography>
      )}

      {rates && rates.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Действует с</TableCell>
              <TableCell>Сумма</TableCell>
              <TableCell>Тип</TableCell>
              <TableCell>Комментарий</TableCell>
              <TableCell>Создана</TableCell>
              {canEdit && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {rates.map((rate) => {
              const isCurrent = current?.id === rate.id;
              return (
                <TableRow key={rate.id} sx={isCurrent ? { bgcolor: 'action.selected' } : undefined}>
                  <TableCell>
                    {formatDateTime(rate.effective_from)}
                    {isCurrent && (
                      <Chip size="small" color="success" label="Действует" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>{formatRubles(rate.rate_amount_minor)} ₽</TableCell>
                  <TableCell>{RATE_TYPE_LABELS[rate.rate_type] ?? rate.rate_type}</TableCell>
                  <TableCell>{rate.note ?? '—'}</TableCell>
                  <TableCell>{formatDateTime(rate.created_at)}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label="Исправить"
                        onClick={() => setDialog({ open: true, editing: rate })}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Удалить"
                        onClick={() => setDeleting(rate)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialog.open && memberId && (
        <RateDialog
          memberId={memberId}
          editing={dialog.editing}
          onClose={() => setDialog({ open: false, editing: null })}
          onDone={reloadAll}
        />
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Удалить запись ставки?</DialogTitle>
          <DialogContent>
            <Typography>
              {formatRubles(deleting.rate_amount_minor)} ₽ (
              {RATE_TYPE_LABELS[deleting.rate_type] ?? deleting.rate_type}), действует с{' '}
              {formatDateTime(deleting.effective_from)}. Действующая ставка для затронутых периодов
              может измениться.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Отмена</Button>
            <Button color="error" variant="contained" onClick={() => void handleDelete(deleting)}>
              Удалить
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};
