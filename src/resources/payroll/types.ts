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
export interface PayrollItem {
  user_id: string;
  user_name: string;
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  unpaid_seconds: number;
  unpaid_shifts_count: number;
  has_missing_rate: boolean;
  breakdown?: PayrollBucket[];
}

// Ответ GET /organizations/{org}/payroll. granularity/tz эхо-возвращаются (что применилось).
export interface PayrollReport {
  period: { date_from: string | null; date_to: string | null };
  granularity?: Granularity;
  tz?: string;
  currency: string;
  items: PayrollItem[];
  totals: { worked_seconds: number; shifts_count: number; gross_amount_minor: number };
}

export type { PayrollQuery };
