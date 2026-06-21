import type { Granularity, PayrollBucket, PayrollReport, PayrollItem } from './types';

// Матрица осмысленна на коротком периоде; шире — предлагаем сузить/укрупнить (ТЗ: гард по ширине).
export const MAX_MATRIX_COLUMNS = 31;

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

interface Ymd {
  y: number;
  mo: number;
  d: number;
}

// bucket_start — дата без времени, нарезана бэком в нужной tz. Парсим компоненты строки
// напрямую (не через new Date), чтобы не было сдвига дня из-за таймзоны браузера.
const parseYmd = (value: string): Ymd | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Полная подпись корзины для дневной детализации (режим «Список»).
export const formatBucketLabel = (bucketStart: string, granularity: Granularity): string => {
  const p = parseYmd(bucketStart);
  if (!p) return bucketStart;
  if (granularity === 'month') return `${MONTHS_NOMINATIVE[p.mo - 1]} ${p.y}`;
  if (granularity === 'week') return `нед. с ${pad2(p.d)}.${pad2(p.mo)}.${p.y}`;
  return `${pad2(p.d)}.${pad2(p.mo)}.${p.y}`;
};

// Компактная подпись столбца матрицы.
export const formatBucketShort = (bucketStart: string, granularity: Granularity): string => {
  const p = parseYmd(bucketStart);
  if (!p) return bucketStart;
  if (granularity === 'month') return `${MONTHS_SHORT[p.mo - 1]} ${String(p.y).slice(2)}`;
  return `${pad2(p.d)}.${pad2(p.mo)}`;
};

export interface MatrixRow {
  item: PayrollItem;
  byBucket: Map<string, PayrollBucket>;
}

export interface MatrixColumnTotal {
  worked_seconds: number;
  gross_amount_minor: number;
}

export interface MatrixModel {
  columns: string[]; // bucket_start, ASC (ISO-даты сортируются лексикографически = хронологически)
  rows: MatrixRow[];
  colTotals: Map<string, MatrixColumnTotal>;
}

// Сводит report в сетку сотрудник × корзина. Столбцы — объединение всех bucket_start
// (корзины без смен бэк не отдаёт, поэтому у сотрудников набор корзин может различаться).
export const buildMatrix = (report: PayrollReport): MatrixModel => {
  const colSet = new Set<string>();
  const colTotals = new Map<string, MatrixColumnTotal>();
  const rows: MatrixRow[] = report.items.map((item) => {
    const byBucket = new Map<string, PayrollBucket>();
    for (const bucket of item.breakdown ?? []) {
      colSet.add(bucket.bucket_start);
      byBucket.set(bucket.bucket_start, bucket);
      const total = colTotals.get(bucket.bucket_start) ?? {
        worked_seconds: 0,
        gross_amount_minor: 0,
      };
      total.worked_seconds += bucket.worked_seconds;
      total.gross_amount_minor += bucket.gross_amount_minor;
      colTotals.set(bucket.bucket_start, total);
    }
    return { item, byBucket };
  });
  const columns = [...colSet].sort();
  return { columns, rows, colTotals };
};
