import { useCallback, useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { billingErrorMessage } from '../../utils/format';
import type { PaymentRow } from '../../subscription/billingTypes';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

// Возврат с оплаты (admin.md, «Возврат с оплаты»): ЮKassa кладёт `?payment={id}` в URL
// (`/#/tariff?payment={id}`, backend.md п.3 «return_url»). Четыре исхода из ТЗ:
//  - 'checking'  — опрашиваем каждые 2с, «Проверяем оплату»;
//  - 'succeeded' — платёж применён, параметр убирается из URL, вызывающий код обновляет
//                  подписку и показывает уведомление с новым сроком;
//  - 'canceled'  — «Платёж не прошёл», предлагаем повтор;
//  - 'timeout'   — 60с истекли, платёж всё ещё pending — не ошибка, а «обрабатывается».
// 'refunded' (из вебхука refund.succeeded) в этом флоу практически не встречается —
// смысловая близость к canceled: ничего оплатить второй раз в рамках возврата не нужно.
export type PaymentReturnPhase =
  | 'idle'
  | 'checking'
  | 'succeeded'
  | 'canceled'
  | 'timeout'
  | 'error';

export interface PaymentReturnState {
  paymentId: string | null;
  phase: PaymentReturnPhase;
  payment: PaymentRow | null;
  errorMessage: string | null;
  // «Экран не должен предлагать заплатить второй раз, пока платёж в pending» (admin.md) —
  // true, пока исход ещё не известен или платёж завис в pending дольше 60с.
  blocksNewCheckout: boolean;
  // Перезапуск опроса без перезагрузки страницы (тот же контракт: до 60с новыми интервалами
  // по 2с) — мягче буквального «обновите страницу» из ТЗ, тот же результат.
  recheck: () => void;
}

export const usePaymentReturn = (
  orgId: string | null,
  onSucceeded: (payment: PaymentRow) => void,
): PaymentReturnState => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentId = searchParams.get('payment');
  const dataProvider = useDataProvider();
  const [phase, setPhase] = useState<PaymentReturnPhase>('idle');
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const clearPaymentParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('payment');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (!paymentId || !orgId) {
      setPhase('idle');
      return undefined;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setPhase('checking');
    setErrorMessage(null);

    const poll = async (): Promise<void> => {
      try {
        const result = await dataProvider.getBillingPayment(orgId, paymentId);
        if (!active) return;
        setPayment(result);
        if (result.status === 'succeeded') {
          setPhase('succeeded');
          clearPaymentParam();
          onSucceeded(result);
          return;
        }
        if (result.status === 'canceled') {
          // Параметр из URL НЕ убираем (в отличие от succeeded, где это прямое требование
          // ТЗ): paymentId — deps самого эффекта, его обнуление тут же перезапустило бы
          // эффект и сбросило phase обратно в 'idle' раньше, чем пользователь успел бы
          // увидеть баннер «Платёж не прошёл» и кнопку «Повторить». «Повторить» создаёт
          // новый checkout и уводит на другой confirmation_url — старый параметр становится
          // неактуальным сам по себе после редиректа.
          setPhase('canceled');
          return;
        }
        if (result.status === 'refunded') {
          // Терминальный статус вне обычного флоу оплаты (см. пометку типа выше) —
          // не блокируем экран бесконечным «проверяем»; та же причина не трогать URL, что и у canceled.
          setPhase('canceled');
          return;
        }
        // pending
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          setPhase('timeout');
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (e) {
        if (!active) return;
        setErrorMessage(billingErrorMessage(e, 'Не удалось проверить статус платежа'));
        setPhase('error');
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // searchParams/setSearchParams сознательно не в deps: обновление URL идёт через
    // мемоизированный clearPaymentParam (обёртка над setSearchParams с функциональным update),
    // повторный запуск эффекта должен решать только paymentId/orgId/attempt.
  }, [paymentId, orgId, dataProvider, attempt, clearPaymentParam, onSucceeded]);

  return {
    paymentId,
    phase,
    payment,
    errorMessage,
    blocksNewCheckout: phase === 'checking' || phase === 'timeout',
    recheck: () => setAttempt((a) => a + 1),
  };
};
