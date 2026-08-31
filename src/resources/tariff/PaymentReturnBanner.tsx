import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import type { PaymentReturnState } from './usePaymentReturn';

// Три из четырёх исходов возврата с оплаты (admin.md, «Возврат с оплаты») — статичная
// плашка над блоком продления; 'succeeded' — намеренно не здесь (см. usePaymentReturn):
// это одноразовое уведомление (useNotify), а не персистентная плашка, ТЗ явно говорит
// «уведомление», а не «баннер».
export const PaymentReturnBanner = ({
  state,
  onRetryCheckout,
}: {
  state: PaymentReturnState;
  // Повторить последний платёж теми же параметрами (kind/plan_code/months из state.payment) —
  // для canceled/timeout/error, где у нас уже есть эти данные из последнего опроса.
  onRetryCheckout: () => void;
}) => {
  if (state.phase === 'checking') {
    return (
      <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
        Проверяем оплату…
      </Alert>
    );
  }

  if (state.phase === 'canceled') {
    return (
      <Alert
        severity="error"
        sx={{ mb: 2 }}
        action={
          <Button color="inherit" size="small" onClick={onRetryCheckout}>
            Повторить
          </Button>
        }
      >
        Платёж не прошёл. Деньги не списаны, попробуйте ещё раз.
      </Alert>
    );
  }

  if (state.phase === 'timeout') {
    return (
      <Alert
        severity="warning"
        sx={{ mb: 2 }}
        action={
          <Button color="inherit" size="small" onClick={state.recheck}>
            Проверить снова
          </Button>
        }
      >
        Платёж обрабатывается. Обновите страницу через минуту — если тариф не изменится, напишите в
        поддержку.
      </Alert>
    );
  }

  if (state.phase === 'error') {
    return (
      <Stack sx={{ mb: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={state.recheck}>
              Проверить снова
            </Button>
          }
        >
          {state.errorMessage ?? 'Не удалось проверить статус платежа'}
        </Alert>
      </Stack>
    );
  }

  return null;
};
