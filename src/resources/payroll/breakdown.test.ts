import { describe, expect, it } from 'vitest';
import {
  adjustmentSplit,
  adjustmentsListHref,
  buildBreakdownLines,
  categoryAmounts,
  deductionDisplayMinor,
  grossSplit,
  grossTooltip,
  type PayrollMoneyRow,
} from './breakdown';
import { organizationTime } from '../../utils/time';

// payroll_breakdown/backend.md, «Отчёт payroll»: base + overtime == gross,
// accrual − deduction == adjustment_amount, sum(by_category.amount) == adjustment_amount.

// Тот же вид, что formatMoneyMinor (utils/format тянет react-admin — в тест не импортируем).
const money = (minor: number): string => `${minor / 100} ₽`;

const row = (overrides: Partial<PayrollMoneyRow> = {}): PayrollMoneyRow => ({
  gross_amount_minor: 1_200_000,
  penalty_amount_minor: 50_000,
  penalties_count: 2,
  adjustment_amount_minor: 200_000,
  adjustments_count: 3,
  net_amount_minor: 1_350_000,
  base_amount_minor: 1_000_000,
  overtime_amount_minor: 200_000,
  adjustment_accrual_minor: 500_000,
  adjustment_deduction_minor: 300_000,
  adjustments_by_category: [
    {
      category_id: 'c1',
      category_name: 'Премия',
      amount_minor: 500_000,
      accrual_minor: 500_000,
      deduction_minor: 0,
      count: 1,
    },
    {
      category_id: null,
      category_name: null,
      amount_minor: -300_000,
      accrual_minor: 0,
      deduction_minor: 300_000,
      count: 2,
    },
  ],
  ...overrides,
});

// Старый бэк (до раскатки): новых полей нет вовсе.
const legacyRow = (overrides: Partial<PayrollMoneyRow> = {}): PayrollMoneyRow => ({
  gross_amount_minor: 1_200_000,
  penalty_amount_minor: 0,
  penalties_count: 0,
  adjustment_amount_minor: -30_000,
  adjustments_count: 1,
  net_amount_minor: 1_170_000,
  ...overrides,
});

describe('grossSplit / grossTooltip', () => {
  it('берёт base/overtime из ответа', () => {
    expect(grossSplit(row())).toEqual({ base: 1_000_000, overtime: 200_000 });
  });

  it('подсказка только при переработке ≠ 0', () => {
    expect(grossTooltip(row(), money)).toBe('за время 10000 ₽ · переработка 2000 ₽');
    expect(
      grossTooltip(row({ base_amount_minor: 1_200_000, overtime_amount_minor: 0 }), money),
    ).toBe(null);
  });

  it('старый бэк: всё «Начислено» — за время, без подсказки', () => {
    expect(grossSplit(legacyRow())).toEqual({ base: 1_200_000, overtime: 0 });
    expect(grossTooltip(legacyRow(), money)).toBeNull();
  });
});

describe('adjustmentSplit', () => {
  it('доплаты и удержания из ответа', () => {
    expect(adjustmentSplit(row())).toEqual({ accrual: 500_000, deduction: 300_000 });
  });

  it('старый бэк: знаковая сумма уходит в доплаты или удержания по знаку', () => {
    expect(adjustmentSplit(legacyRow())).toEqual({ accrual: 0, deduction: 30_000 });
    expect(adjustmentSplit(legacyRow({ adjustment_amount_minor: 40_000 }))).toEqual({
      accrual: 40_000,
      deduction: 0,
    });
    expect(adjustmentSplit(legacyRow({ adjustment_amount_minor: 0 }))).toEqual({
      accrual: 0,
      deduction: 0,
    });
  });

  it('удержание для ячейки — со знаком минус и без «-0»', () => {
    expect(deductionDisplayMinor(300_000)).toBe(-300_000);
    expect(Object.is(deductionDisplayMinor(0), 0)).toBe(true);
  });
});

describe('categoryAmounts', () => {
  it('пустой список, если поля нет', () => {
    expect(categoryAmounts({})).toEqual([]);
    expect(categoryAmounts({ adjustments_by_category: [] })).toEqual([]);
  });
});

describe('buildBreakdownLines', () => {
  it('полная раскладка: время, переработка, начислено, штрафы, категории, к выплате', () => {
    const lines = buildBreakdownLines(row());
    expect(lines.map((l) => [l.key, l.label, l.amount_minor, l.kind, l.count])).toEqual([
      ['base', 'За отработанное время', 1_000_000, 'item', undefined],
      ['overtime', 'За переработку', 200_000, 'item', undefined],
      ['gross', 'Начислено', 1_200_000, 'subtotal', undefined],
      ['penalties', 'Штрафы', -50_000, 'item', 2],
      ['category:c1', 'Премия', 500_000, 'item', 1],
      ['category:none', 'Без категории', -300_000, 'item', 2],
      ['net', 'К выплате', 1_350_000, 'total', undefined],
    ]);
  });

  it('строки сходятся в «К выплате»: начислено + штрафы + категории', () => {
    const lines = buildBreakdownLines(row());
    const sumOf = (keys: (k: string) => boolean) =>
      lines.filter((l) => keys(l.key)).reduce((acc, l) => acc + l.amount_minor, 0);
    const gross = sumOf((k) => k === 'base' || k === 'overtime');
    expect(gross).toBe(1_200_000);
    const net = gross + sumOf((k) => k === 'penalties' || k.startsWith('category:'));
    expect(net).toBe(1_350_000);
  });

  it('без переработки строки «За переработку» нет; нулевой штраф — «0», а не «-0»', () => {
    const lines = buildBreakdownLines(
      row({
        base_amount_minor: 1_200_000,
        overtime_amount_minor: 0,
        penalty_amount_minor: 0,
        penalties_count: 0,
      }),
    );
    expect(lines.some((l) => l.key === 'overtime')).toBe(false);
    const penalties = lines.find((l) => l.key === 'penalties');
    expect(penalties && Object.is(penalties.amount_minor, 0)).toBe(true);
  });

  it('старый бэк без категорий — одна свёрнутая строка начислений', () => {
    const lines = buildBreakdownLines(legacyRow());
    expect(lines.map((l) => l.key)).toEqual(['base', 'gross', 'penalties', 'adjustments', 'net']);
    expect(lines.find((l) => l.key === 'adjustments')?.amount_minor).toBe(-30_000);
  });

  it('без начислений — ни категорий, ни свёрнутой строки', () => {
    const lines = buildBreakdownLines(
      legacyRow({ adjustment_amount_minor: 0, adjustments_count: 0, adjustments_by_category: [] }),
    );
    expect(lines.map((l) => l.key)).toEqual(['base', 'gross', 'penalties', 'net']);
  });
});

describe('adjustmentsListHref', () => {
  it('фильтр по сотруднику и календарным дням периода в таймзоне отчёта', () => {
    const href = adjustmentsListHref(
      'm1',
      { date_from: '2026-08-31T21:00:00Z', date_to: '2026-09-30T20:59:59Z' },
      organizationTime('Europe/Moscow'),
    );
    const filter = JSON.parse(decodeURIComponent(href.replace('/adjustments?filter=', '')));
    expect(filter).toEqual({ member_id: 'm1', date_from: '2026-09-01', date_to: '2026-09-30' });
  });

  it('период «за всё время» — только сотрудник', () => {
    const href = adjustmentsListHref(
      'm1',
      { date_from: null, date_to: null },
      organizationTime('Europe/Moscow'),
    );
    expect(href).toBe(`/adjustments?filter=${encodeURIComponent('{"member_id":"m1"}')}`);
  });
});
