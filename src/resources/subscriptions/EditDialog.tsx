import { useState } from 'react';
import { useDataProvider, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { usePlans } from '../../subscription/usePlans';
import type { AdminSubscriptionRow, OrgSubscription } from '../../subscription/SubscriptionContext';
import { SUBSCRIPTION_MANUAL_STATUS_CHOICES, tariffErrorMessage } from '../../utils/format';
import { localInputToUtcIso, utcIsoToLocalInput } from '../../utils/dates';

// «Изменить» — ручная правка для нестандартных ситуаций (admin.md, «Действия на строке», п.2):
// тариф/статус/даты/заметка, все поля опциональны и применяются только переданные
// (backend.md п.5). Поля-даты и статус по умолчанию пустые («не менять») — сам реестр
// (GET /admin/subscriptions) не отдаёт current_period_start и «сырой» хранимый статус
// (только эффективный), поэтому безопасный дефолт — ничего не предзаполнять и не гадать.
export const EditDialog = ({
  row,
  onClose,
  onDone,
}: {
  row: AdminSubscriptionRow;
  onClose: () => void;
  onDone: (updated: OrgSubscription) => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { plans } = usePlans();

  const [planCode, setPlanCode] = useState('');
  const [status, setStatus] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState(utcIsoToLocalInput(row.trial_ends_at));
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(utcIsoToLocalInput(row.current_period_end));
  const [note, setNote] = useState(row.note ?? '');
  const [errors, setErrors] = useState<{ trialEndsAt?: string; periodEnd?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initialTrialEndsAt = utcIsoToLocalInput(row.trial_ends_at);
  const initialPeriodEnd = utcIsoToLocalInput(row.current_period_end);

  const CANNOT_CLEAR_HINT =
    'Бэк не отличает "очистить" от "не передано" (services/subscription.py) — null молча ' +
    'игнорируется. Укажите дату или верните исходное значение.';

  const handleSubmit = async (): Promise<void> => {
    // Бэк трактует `null` в PATCH как «поле не передано» (см. services/subscription.py:
    // `if trial_ends_at is not None: …`) — явную очистку сервер отбрасывает молча, а UI до
    // этой правки рапортовал «Подписка изменена» поверх фактического no-op. Раз очистить
    // по-настоящему нельзя, честно останавливаем сабмит вместо того, чтобы врать об успехе.
    const nextErrors: { trialEndsAt?: string; periodEnd?: string } = {};
    if (trialEndsAt === '' && initialTrialEndsAt !== '') {
      nextErrors.trialEndsAt = CANNOT_CLEAR_HINT;
    }
    if (periodEnd === '' && initialPeriodEnd !== '') {
      nextErrors.periodEnd = CANNOT_CLEAR_HINT;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const body: Record<string, unknown> = {};
    if (planCode !== '') body.plan_code = planCode;
    if (status !== '') body.status = status;
    if (trialEndsAt !== initialTrialEndsAt && trialEndsAt !== '') {
      body.trial_ends_at = localInputToUtcIso(trialEndsAt);
    }
    if (periodStart !== '') body.current_period_start = localInputToUtcIso(periodStart);
    if (periodEnd !== initialPeriodEnd && periodEnd !== '') {
      body.current_period_end = localInputToUtcIso(periodEnd);
    }
    if (note !== (row.note ?? '')) body.note = note.trim();

    setServerError(null);
    setSaving(true);
    try {
      const updated = await dataProvider.patchSubscription(row.organization_id, body);
      notify('Подписка изменена', { type: 'success' });
      onDone(updated);
    } catch (e) {
      setServerError(tariffErrorMessage(e, 'Не удалось изменить подписку'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Изменить подписку — {row.organization_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            select
            label="Тариф"
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
            helperText="Пусто — не менять"
          >
            <MenuItem value="">— не менять —</MenuItem>
            {plans.map((p) => (
              <MenuItem key={p.code} value={p.code}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Статус"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            helperText="Пусто — не менять; past_due/suspended задать нельзя — они вычисляются"
          >
            <MenuItem value="">— не менять —</MenuItem>
            {SUBSCRIPTION_MANUAL_STATUS_CHOICES.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="datetime-local"
            label="Конец триала"
            InputLabelProps={{ shrink: true }}
            value={trialEndsAt}
            onChange={(e) => {
              setTrialEndsAt(e.target.value);
              if (errors.trialEndsAt) setErrors((prev) => ({ ...prev, trialEndsAt: undefined }));
            }}
            error={Boolean(errors.trialEndsAt)}
            helperText={errors.trialEndsAt}
          />
          <TextField
            type="datetime-local"
            label="Начало периода"
            InputLabelProps={{ shrink: true }}
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            helperText="Пусто — не менять"
          />
          <TextField
            type="datetime-local"
            label="Конец периода"
            InputLabelProps={{ shrink: true }}
            value={periodEnd}
            onChange={(e) => {
              setPeriodEnd(e.target.value);
              if (errors.periodEnd) setErrors((prev) => ({ ...prev, periodEnd: undefined }));
            }}
            error={Boolean(errors.periodEnd)}
            helperText={errors.periodEnd ?? 'Обязателен при статусе «Активна»'}
          />
          <TextField
            label="Заметка"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            inputProps={{ maxLength: 512 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};
