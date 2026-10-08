import { calendarDayForInstant, type TimeContext } from '../../utils/time';
import { categoryLabel } from '../adjustmentCategoryUtils';
import type { PayrollCategoryAmount, PayrollMoneyBreakdown } from './types';

// payroll_breakdown: раскладка денег строки отчёта («Из чего сложилось», «Доплаты»/
// «Удержания», подсказка к «Начислено»). Чистые функции — без React, покрыты тестами.
// Все новые поля опциональны (на время раскатки бэк может быть старым) — не падаем и
// показываем то, что есть.

// Минимум полей строки/итога, нужный для раскладки (PayrollItem и PayrollTotals оба подходят).
export interface PayrollMoneyRow extends PayrollMoneyBreakdown {
  gross_amount_minor: number;
  penalty_amount_minor: number;
  penalties_count: number;
  adjustment_amount_minor: number;
  adjustments_count: number;
  net_amount_minor: number;
}

// -0 → 0: toLocaleString(-0) печатает «-0».
const negate = (value: number): number => (value === 0 ? 0 : -value);

// Оплата за время / переработку. Без новых полей — всё «Начислено» считаем оплатой за время
// (переработку старый бэк не выделял).
export const grossSplit = (row: {
  gross_amount_minor: number;
  base_amount_minor?: number;
  overtime_amount_minor?: number;
}): { base: number; overtime: number } => {
  const overtime = row.overtime_amount_minor ?? 0;
  const base = row.base_amount_minor ?? row.gross_amount_minor - overtime;
  return { base, overtime };
};

// Подсказка к «Начислено»: только если есть переработка (admin.md). Форматтер денег
// передаёт вызывающий (formatMoneyMinor) — utils/format тянет react-admin, а этот модуль
// остаётся чистым для unit-тестов.
export const grossTooltip = (
  row: {
    gross_amount_minor: number;
    base_amount_minor?: number;
    overtime_amount_minor?: number;
  },
  formatMoney: (minor: number) => string,
): string | null => {
  const { base, overtime } = grossSplit(row);
  if (overtime === 0) return null;
  return `за время ${formatMoney(base)} · переработка ${formatMoney(overtime)}`;
};

// «Доплаты» (≥ 0) и «Удержания» (по модулю, ≥ 0). Старый бэк отдаёт только знаковую сумму
// adjustment_amount_minor — относим её целиком в доплаты или удержания по знаку, чтобы
// К выплате = Начислено − Штраф + Доплаты − Удержания продолжало сходиться.
export const adjustmentSplit = (
  row: Pick<
    PayrollMoneyRow,
    'adjustment_amount_minor' | 'adjustment_accrual_minor' | 'adjustment_deduction_minor'
  >,
): { accrual: number; deduction: number } => {
  if (row.adjustment_accrual_minor !== undefined || row.adjustment_deduction_minor !== undefined) {
    return {
      accrual: row.adjustment_accrual_minor ?? 0,
      deduction: row.adjustment_deduction_minor ?? 0,
    };
  }
  const signed = row.adjustment_amount_minor ?? 0;
  return signed >= 0 ? { accrual: signed, deduction: 0 } : { accrual: 0, deduction: -signed };
};

// Значение для ячейки «Удержания»: со знаком минус, без «-0».
export const deductionDisplayMinor = (deduction: number): number => negate(Math.abs(deduction));

// Категории с ненулевым количеством начислений (пустой список, если поля нет).
export const categoryAmounts = (
  row: Pick<PayrollMoneyBreakdown, 'adjustments_by_category'>,
): PayrollCategoryAmount[] => (row.adjustments_by_category ?? []).filter((c) => c.count > 0);

export type BreakdownLineKind = 'item' | 'subtotal' | 'total';

export interface BreakdownLine {
  key: string;
  label: string;
  amount_minor: number;
  kind: BreakdownLineKind;
  // Знаковое отображение (+/−) — для штрафов и начислений.
  signed: boolean;
  count?: number;
}

// Строки блока «Из чего сложилось» (admin.md, «Раскрытие строки сотрудника»).
export const buildBreakdownLines = (row: PayrollMoneyRow): BreakdownLine[] => {
  const { base, overtime } = grossSplit(row);
  const lines: BreakdownLine[] = [
    {
      key: 'base',
      label: 'За отработанное время',
      amount_minor: base,
      kind: 'item',
      signed: false,
    },
  ];
  if (overtime !== 0) {
    lines.push({
      key: 'overtime',
      label: 'За переработку',
      amount_minor: overtime,
      kind: 'item',
      signed: false,
    });
  }
  lines.push({
    key: 'gross',
    label: 'Начислено',
    amount_minor: row.gross_amount_minor,
    kind: 'subtotal',
    signed: false,
  });
  lines.push({
    key: 'penalties',
    label: 'Штрафы',
    amount_minor: negate(row.penalty_amount_minor),
    kind: 'item',
    signed: true,
    count: row.penalties_count,
  });
  const categories = categoryAmounts(row);
  if (categories.length > 0) {
    for (const c of categories) {
      lines.push({
        key: `category:${c.category_id ?? 'none'}`,
        label: categoryLabel(c.category_name),
        amount_minor: c.amount_minor,
        kind: 'item',
        signed: true,
        count: c.count,
      });
    }
  } else if (row.adjustments_count > 0 || row.adjustment_amount_minor !== 0) {
    // Старый бэк без adjustments_by_category — одна свёрнутая строка, итог всё равно сходится.
    lines.push({
      key: 'adjustments',
      label: 'Начисления и удержания',
      amount_minor: row.adjustment_amount_minor,
      kind: 'item',
      signed: true,
      count: row.adjustments_count,
    });
  }
  lines.push({
    key: 'net',
    label: 'К выплате',
    amount_minor: row.net_amount_minor,
    kind: 'total',
    signed: false,
  });
  return lines;
};

// Ссылка на реестр «Начисления» с фильтром по сотруднику и периоду отчёта (календарные дни
// в таймзоне отчёта — тот же формат, что у DateInput фильтров списка).
export const adjustmentsListHref = (
  memberId: string,
  period: { date_from: string | null; date_to: string | null },
  timeContext: TimeContext,
): string => {
  const filter: Record<string, string> = { member_id: memberId };
  const dateFromDay = calendarDayForInstant(period.date_from, timeContext);
  const dateToDay = calendarDayForInstant(period.date_to, timeContext);
  if (dateFromDay) filter.date_from = dateFromDay;
  if (dateToDay) filter.date_to = dateToDay;
  return `/adjustments?filter=${encodeURIComponent(JSON.stringify(filter))}`;
};
