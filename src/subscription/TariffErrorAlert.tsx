import { useEffect, useState } from 'react';
import { Alert, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { subscribeTariffGateError, type TariffGateErrorEvent } from './tariffErrorBus';

const AUTO_HIDE_MS = 10000;

// Персистентный алерт (не toast) под AppBar — вторая линия обороны после UI-гейтинга
// (admin.md, «error»: SUBSCRIPTION_INACTIVE/PLAN_LIMIT_REACHED/PLAN_FEATURE_UNAVAILABLE —
// «понятный текст и ссылка на экран «Тариф» вместо сырой ошибки»). Стандартный toast
// react-admin с текстом бэка (уже человекочитаемым, backend.md «message человекочитаемо
// называет лимит/фичу») продолжает показываться штатно — этот алерт добавляет именно
// ссылку на «Тариф», которой в toast нет, тем же визуальным паттерном, что и
// SubscriptionBanner.tsx. Событие приходит из dataProvider.request() через tariffErrorBus.
export const TariffErrorAlert = () => {
  const [event, setEvent] = useState<TariffGateErrorEvent | null>(null);

  useEffect(() => subscribeTariffGateError(setEvent), []);

  useEffect(() => {
    if (!event) return undefined;
    const timer = setTimeout(() => setEvent(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [event]);

  if (!event) return null;

  return (
    <Alert severity="warning" onClose={() => setEvent(null)} sx={{ borderRadius: 0 }}>
      {event.message}{' '}
      <RouterLink to="/tariff" style={{ color: 'inherit', fontWeight: 600 }}>
        Открыть «Тариф»
      </RouterLink>
    </Alert>
  );
};

// Обёртка для AppBar — тот же приём, что SubscriptionBannerBar.
export const TariffErrorAlertBar = () => (
  <Box sx={{ width: '100%' }}>
    <TariffErrorAlert />
  </Box>
);
