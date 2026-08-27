// Шина «увидели тарифную 402-ошибку» (SUBSCRIPTION_INACTIVE/PLAN_LIMIT_REACHED/
// PLAN_FEATURE_UNAVAILABLE, backend.md «Новые коды ошибок»). Единая точка: dataProvider.ts
// (request(), единственное место с конвертом {data,error}) репортит код+текст сюда без
// хуков — dataProvider не React-компонент и useNotify() дёрнуть не может. TariffErrorAlert
// (смонтирован в Layout рядом с SubscriptionBannerBar) подписывается и показывает
// персистентный алерт со ссылкой на экран «Тариф» (admin.md, «error»: «понятный текст и
// ссылка на экран «Тариф» вместо сырой ошибки» — вторая линия обороны после UI-гейтинга,
// на случай состояния гонки или необновившегося кэша прав/лимитов).
export const TARIFF_GATE_ERROR_CODES = new Set([
  'SUBSCRIPTION_INACTIVE',
  'PLAN_LIMIT_REACHED',
  'PLAN_FEATURE_UNAVAILABLE',
]);

export interface TariffGateErrorEvent {
  code: string;
  message: string;
  at: number;
}

type Listener = (event: TariffGateErrorEvent) => void;

const listeners = new Set<Listener>();

export const reportTariffGateError = (code: string | undefined, message: string): void => {
  if (!code || !TARIFF_GATE_ERROR_CODES.has(code)) return;
  const event: TariffGateErrorEvent = { code, message, at: Date.now() };
  listeners.forEach((listener) => listener(event));
};

export const subscribeTariffGateError = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
