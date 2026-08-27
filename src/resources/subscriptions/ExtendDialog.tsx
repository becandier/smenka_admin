import { useEffect, useState } from 'react';
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
import { formatDate, parseRublesToMinor, tariffErrorMessage } from '../../utils/format';

// «Продлить» — основная кнопка ежедневной работы супер-админа (admin.md, «Действия на
// строке», п.1): месяцы (1–24, дефолт 1), опционально смена тарифа, сумма фактического
// платежа (по умолчанию — цена тарифа × месяцы, редактируется) и заметка. POST
// .../subscription/extend (backend.md п.6): период сдвигается от большей из двух дат.
export const ExtendDialog = ({
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

  const [months, setMonths] = useState(1);
  const [planCode, setPlanCode] = useState<string>(''); // '' — не менять тариф
  const [amountRub, setAmountRub] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ months?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const effectivePlanCode = planCode !== '' ? planCode : row.plan_code;
  const effectivePlan = plans.find((p) => p.code === effectivePlanCode) ?? null;

  // Пересчитываем предпросмотр суммы (цена тарифа × месяцы), пока админ не тронул поле
  // руками — тот же приём, что «Часы × ставка» в adjustments (onHoursChange/reasonTouched).
  useEffect(() => {
    if (amountTouched || !effectivePlan) return;
    setAmountRub(String((effectivePlan.price_minor * months) / 100));
  }, [amountTouched, effectivePlan, months]);

  const handleSubmit = async (): Promise<void> => {
    const nextErrors: { months?: string; amount?: string } = {};
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      nextErrors.months = 'От 1 до 24 месяцев';
    }
    const amountMinor = amountRub.trim() === '' ? null : parseRublesToMinor(amountRub);
    if (amountRub.trim() !== '' && amountMinor === null) {
      nextErrors.amount = 'Сумма больше нуля, не более 2 знаков';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setServerError(null);
    setSaving(true);
    try {
      const updated = await dataProvider.extendSubscription(row.organization_id, {
        months,
        plan_code: planCode !== '' ? planCode : null,
        amount_minor: amountMinor,
        note: note.trim() === '' ? null : note.trim(),
      });
      notify(`Продлено до ${formatDate(updated.current_period_end)}`, { type: 'success' });
      onDone(updated);
    } catch (e) {
      setServerError(tariffErrorMessage(e, 'Не удалось продлить подписку'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Продлить подписку — {row.organization_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            type="number"
            label="Месяцев"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            error={Boolean(errors.months)}
            helperText={errors.months}
            inputProps={{ min: 1, max: 24 }}
          />
          <TextField
            select
            label="Тариф"
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
            helperText="Пусто — оставить текущий тариф"
          >
            <MenuItem value="">— оставить текущий —</MenuItem>
            {plans.map((p) => (
              <MenuItem key={p.code} value={p.code}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Сумма фактического платежа, ₽"
            value={amountRub}
            onChange={(e) => {
              setAmountTouched(true);
              setAmountRub(e.target.value);
            }}
            error={Boolean(errors.amount)}
            helperText={errors.amount ?? 'По умолчанию — цена тарифа × месяцы'}
            inputProps={{ inputMode: 'decimal' }}
          />
          <TextField
            label="Заметка"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: оплачено 27.08, перевод"
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
          Продлить
        </Button>
      </DialogActions>
    </Dialog>
  );
};
