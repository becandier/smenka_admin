import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useGetOne, usePermissions } from 'react-admin';
import { useCurrentOrg } from '../orgContext';
import type { Permissions } from '../providers/authProvider';

export interface PlanLimits {
  max_employees: number | null;
  max_locations: number | null;
}

export interface PlanFeatures {
  fines: boolean;
  test_import: boolean;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';

// Тот же контракт, что GET /organizations/{org_id}/subscription и additive-поле
// `subscription` в GET /organizations/{org_id} (backend.md, п.2/3) — значения уже
// эффективные (в trialing limits/features берутся от premium).
export interface OrgSubscription {
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  days_left: number | null;
  is_read_only: boolean;
  limits: PlanLimits;
  usage: Record<string, number>;
  features: PlanFeatures;
  price_minor: number;
  currency: string;
}

// Строка витрины тарифов (GET /plans, backend.md п.1) — цены/лимиты приходят с бэка,
// не хардкодятся в компонентах (admin.md, «Приёмка»).
export interface PlanRow {
  code: string;
  name: string;
  price_minor: number;
  currency: string;
  limits: PlanLimits;
  features: PlanFeatures;
  sort_order: number;
}

// Сводка супер-админа (GET /admin/subscriptions/summary, backend.md п.8).
export interface SubscriptionsSummary {
  by_status: Record<SubscriptionStatus, number>;
  by_plan: Record<string, number>;
  mrr_minor: number;
  expiring_in_7_days: number;
}

// Строка реестра подписок супер-админа (GET /admin/subscriptions, backend.md п.4).
export interface AdminSubscriptionRow {
  id: string; // = organization_id, проставляется dataProvider'ом
  organization_id: string;
  organization_name: string;
  owner_email: string;
  owner_login: string | null;
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  days_left: number | null;
  usage: { employees: number; locations: number };
  note: string | null;
  updated_at: string;
}

// Событие журнала подписки (GET .../subscription/events, backend.md п.7) — append-only.
export interface SubscriptionEvent {
  id: string;
  type: 'created' | 'extended' | 'plan_changed' | 'status_changed' | 'auto_suspended';
  from_plan_code: string | null;
  to_plan_code: string | null;
  from_status: string | null;
  to_status: string | null;
  period_end_before: string | null;
  period_end_after: string | null;
  months: number | null;
  amount_minor: number | null;
  note: string | null;
  actor: { id: string; email: string | null; name: string } | null;
  created_at: string;
}

interface SubscriptionContextValue {
  subscription: OrgSubscription | null;
  loading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: false,
});

// Источник данных — additive-поле `subscription` из GET /organizations/{org_id}
// (admin.md, «Баннер и гейтинг»: «данные — из блока subscription … отдельного запроса
// не нужно»). Провайдер живёт внутри Layout (см. layout/Layout.tsx) — оборачивает и
// AppBar (баннер), и Menu (гейтинг пунктов), и содержимое страниц (гейтинг кнопок).
//
// Fail-open (admin.md, «Состояния»): сеть/5xx, организация без строки subscriptions
// (в проде невозможно, в тестах бывает) или employee (бэк отдаёт null) — subscription
// остаётся null, баннер и гейтинг просто не показываются, остальная админка не ломается.
export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { org } = useCurrentOrg();
  const { data, isPending } = useGetOne(
    'organizations',
    { id: org?.id ?? '' },
    { enabled: Boolean(org?.id) },
  );

  const subscription = useMemo<OrgSubscription | null>(() => {
    const raw = (data as { subscription?: unknown } | undefined)?.subscription;
    if (!raw || typeof raw !== 'object') return null;
    return raw as OrgSubscription;
  }, [data]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({ subscription, loading: Boolean(org?.id) && isPending }),
    [subscription, org?.id, isPending],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscription = (): SubscriptionContextValue => useContext(SubscriptionContext);

// Режим «только для чтения» (backend.md, «Read-only режим»): эффективный статус
// suspended/canceled. Любые операции super_admin — исключение (он и есть тот, кто
// возвращает доступ, backend.md «Исключения», п.4) — платформенная роль обходит
// read-only на бэке, поэтому UI не должен прятать от неё то, что реально работает.
// eslint-disable-next-line react-refresh/only-export-components
export const useIsReadOnly = (): boolean => {
  const { subscription } = useSubscription();
  const { permissions } = usePermissions<Permissions>();
  if (permissions?.role === 'super_admin') return false;
  return subscription?.is_read_only ?? false;
};

// Fail-open (admin.md, «Состояния»): пока подписка не загрузилась или недоступна — фича
// считается доступной, чтобы сбой тарифного сервиса не запирал функциональность и не
// мигал замком при первой отрисовке.
// eslint-disable-next-line react-refresh/only-export-components
export const useHasFeature = (feature: keyof PlanFeatures): boolean => {
  const { subscription } = useSubscription();
  return subscription ? subscription.features[feature] : true;
};
