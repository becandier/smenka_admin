// Онлайн-оплата подписки через ЮKassa (online_payments/backend.md). Типы отдельно от
// SubscriptionContext.tsx: это не React-контекст (нет additive-поля в GET /organizations/{id},
// каждый экран сам дёргает нужный billing-эндпоинт через dataProvider), а параллельный
// платёжный домен поверх тех же подписок.

// GET /billing/config (backend.md п.1) — authenticated, секреты не отдаются. `enabled: false`
// полностью выключает фичу на клиенте (admin.md, «Блокировка при выключенной фиче»).
export interface BillingConfig {
  enabled: boolean;
  mode: 'test' | 'live';
  provider: string;
}

// Один вариант продления витрины (GET .../billing/options, backend.md п.2, extend[]).
// Все суммы и проценты — с сервера, в коде админки не пересчитываются и не хардкодятся
// (backend.md «Приёмка»: «Сумма из клиента не принимается ни в каком виде»).
export interface BillingExtendOption {
  plan_code: string;
  plan_name: string;
  months: number;
  base_amount_minor: number;
  discount_percent: number;
  amount_minor: number;
  savings_minor: number;
  monthly_minor: number;
}

// available=false → апгрейд сейчас невозможен, `reason` объясняет почему (already_premium/
// trialing и т.п.) — блок на экране просто не показывается (admin.md, «Блок «Перейти на
// Премиум»»), reason клиенту не нужен для отображения, только для отладки.
export interface BillingUpgradeOption {
  available: boolean;
  reason?: 'not_applicable' | 'already_premium' | 'no_paid_period' | null;
  from_plan_code?: string | null;
  to_plan_code?: string | null;
  to_plan_name?: string | null;
  months_remaining?: number | null;
  amount_minor?: number | null;
  current_period_end?: string | null;
}

export interface BillingOptions {
  currency: string;
  current_plan_code: string;
  extend: BillingExtendOption[];
  upgrade: BillingUpgradeOption;
}

// POST .../billing/checkout (backend.md п.3): months игнорируется сервером при kind=upgrade —
// не отправляем поле вовсе в этом случае (см. usePaymentCheckout).
export interface BillingCheckoutRequest {
  kind: 'extend' | 'upgrade';
  plan_code: string;
  months?: number;
}

export interface BillingCheckoutResult {
  payment_id: string;
  confirmation_url: string;
  amount_minor: number;
  currency: string;
  status: 'pending';
}

export type PaymentKind = 'extend' | 'upgrade';
// refunded — из вебхука refund.succeeded (backend.md, «Возвраты»); полноценно этот статус в
// v1 нигде на клиенте не разруливается автоматически (ручное решение super_admin), но должен
// корректно отображаться в истории/реестре, а не падать в «неизвестно».
export type PaymentStatus = 'pending' | 'succeeded' | 'canceled' | 'refunded';

// Элемент из GET .../billing/payments/{id} и .../billing/payments (backend.md пп.5-6).
export interface PaymentRow {
  id: string;
  kind: PaymentKind;
  plan_code: string;
  plan_name: string;
  months: number | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  is_test: boolean;
  paid_at: string | null;
  applied_at: string | null;
  created_at: string;
}

// GET .../billing/payments (backend.md п.6) — пагинация серверная.
export interface PaymentListResult {
  items: PaymentRow[];
  total: number;
  limit: number;
  offset: number;
}

// GET /admin/payments (backend.md п.7): элементы п.5 + organization_name/created_by.
// organization_id не перечислен в тексте контракта явно, но нужен для навигации «переход
// на организацию» (admin.md, «Реестр «Платежи»») — платёж физически принадлежит
// organization_id (payments.organization_id, backend.md «Новая таблица payments»), поэтому
// поле включено в тип; если бэк его не пришлёт, ссылки на организацию/историю строятся по
// organization_name (см. PaymentList) — деградация без падения экрана.
export interface AdminPaymentRow extends PaymentRow {
  organization_id?: string;
  organization_name: string;
  created_by: { id: string; email: string; name: string } | null;
}

export interface AdminPaymentsTotals {
  succeeded_amount_minor: number;
  count: number;
}
