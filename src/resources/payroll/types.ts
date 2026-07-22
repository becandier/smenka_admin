import type { PayrollQuery } from '../../providers/dataProvider';

// Уровень разбивки отчёта. none → плоский агрегат по сотруднику (старый контракт payroll).
export type Granularity = 'none' | 'day' | 'week' | 'month';

// Корзина детализации (день/неделя/месяц). Приходит в items[].breakdown при granularity != none.
// bucket_start — ISO-дата начала корзины, вычислена бэком в таймзоне tz; пустые корзины не приходят.
export interface PayrollBucket {
  bucket_start: string;
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  unpaid_seconds: number;
  has_missing_rate: boolean;
}

// Строка по сотруднику. breakdown присутствует только при granularity != none.
// penalty_*/net_* — additive (fines): при include_penalties=false бэк отдаёт 0 и net=gross.
// Штрафы не разбиваются по корзинам (breakdown их не содержит) — только агрегат на сотрудника.
export interface PayrollItem {
  user_id: string;
  user_name: string;
  // member_display_name/admin.md: «Зарплата» — приоритет обратный (см. MemberNameCell reversed).
  display_name: string | null;
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  unpaid_seconds: number;
  unpaid_shifts_count: number;
  has_missing_rate: boolean;
  penalty_amount_minor: number;
  penalties_count: number;
  net_amount_minor: number; // gross − penalty; может быть < 0 (не обрезаем)
  breakdown?: PayrollBucket[];
}

// Итоги отчёта (additive penalty_*/net_* — fines).
export interface PayrollTotals {
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  penalty_amount_minor: number;
  penalties_count: number;
  net_amount_minor: number;
}

// Ответ GET /organizations/{org}/payroll. granularity/tz эхо-возвращаются (что применилось).
export interface PayrollReport {
  period: { date_from: string | null; date_to: string | null };
  granularity?: Granularity;
  tz?: string;
  currency: string;
  items: PayrollItem[];
  totals: PayrollTotals;
}

export type { PayrollQuery };
