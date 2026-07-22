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
// overtime_seconds/planned_*/delta_amount_minor/late_* — additive (work_schedules, backend.md R8):
// план/факт и опоздания, тоже только агрегат на сотрудника (в breakdown не разбиваются).
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
  // work_schedules R8 — план против факта:
  overtime_seconds: number; // сумма approved-заявок на переработку по сменам периода
  planned_seconds: number; // план по графику; для смен без графика — факт (backend.md)
  planned_amount_minor: number;
  delta_amount_minor: number; // gross − planned; отрицательное = недозаработал
  late_count: number;
  late_seconds_total: number;
  breakdown?: PayrollBucket[];
}

// Итоги отчёта (additive penalty_*/net_* — fines). overtime_*/planned_*/delta_*/late_* —
// work_schedules R8 описывает их только «к строке сотрудника» (PayrollItem), про totals явно
// не говорит — держим опциональными и подстраховываемся `?? 0` в рендере (PayrollListView/Matrix),
// чтобы не упасть, если бэк первое время не будет агрегировать их в totals.
export interface PayrollTotals {
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  penalty_amount_minor: number;
  penalties_count: number;
  net_amount_minor: number;
  overtime_seconds?: number;
  planned_seconds?: number;
  planned_amount_minor?: number;
  delta_amount_minor?: number;
  late_count?: number;
  late_seconds_total?: number;
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
