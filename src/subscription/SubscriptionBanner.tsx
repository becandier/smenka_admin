import { Alert, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { formatDate, pluralizeDays } from '../utils/format';
import { useSubscription } from './SubscriptionContext';

// Глобальный баннер состояния подписки (admin.md, «Глобальный баннер состояния»):
// - trialing, ≤5 дней — «пробный период заканчивается»;
// - past_due — предупреждающий (оранжевый);
// - suspended/canceled — read-only (красный, несбрасываемый — рендерится, пока держится
//   статус, без локального dismiss-состояния).
// В active и «здоровом» trialing (>5 дней) баннера нет — «не мозолим глаза платящему клиенту».
// Fail-open: subscription===null (сбой/нет данных/employee) — баннер не рендерится вовсе.
export const SubscriptionBanner = () => {
  const { subscription } = useSubscription();
  if (!subscription) return null;

  const { status, days_left, current_period_end, trial_ends_at, grace_ends_at } = subscription;

  if (status === 'suspended' || status === 'canceled') {
    return (
      <Alert severity="error" sx={{ borderRadius: 0 }}>
        Организация переведена в режим только для чтения — оплата не поступила вовремя.{' '}
        <RouterLink to="/tariff" style={{ color: 'inherit', fontWeight: 600 }}>
          Открыть «Тариф»
        </RouterLink>
      </Alert>
    );
  }

  if (status === 'past_due') {
    const periodEnd = current_period_end ?? trial_ends_at;
    return (
      <Alert severity="warning" sx={{ borderRadius: 0 }}>
        Период оплачен до {formatDate(periodEnd)}. Доступ сохраняется до {formatDate(grace_ends_at)}
        .{' '}
        <RouterLink to="/tariff" style={{ color: 'inherit', fontWeight: 600 }}>
          Открыть «Тариф»
        </RouterLink>
      </Alert>
    );
  }

  if (status === 'trialing' && days_left !== null && days_left <= 5) {
    return (
      <Alert severity="info" sx={{ borderRadius: 0 }}>
        Пробный период заканчивается через {days_left} {pluralizeDays(days_left)}.{' '}
        <RouterLink to="/tariff" style={{ color: 'inherit', fontWeight: 600 }}>
          Открыть «Тариф»
        </RouterLink>
      </Alert>
    );
  }

  return null;
};

// Обёртка для AppBar: занимает всю ширину, без отступов — баннер выглядит как продолжение
// шапки, а не как случайная плашка внутри контента.
export const SubscriptionBannerBar = () => (
  <Box sx={{ width: '100%' }}>
    <SubscriptionBanner />
  </Box>
);
