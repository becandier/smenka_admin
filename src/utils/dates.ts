// Конвертация выбранного календарного дня (YYYY-MM-DD, локаль пользователя) в UTC
// ISO8601 по контракту date_filters: date_from = начало дня, date_to = конец дня
// (23:59:59.999) в локали; бэк границы не округляет, обе границы включительны.

const parseDay = (day: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const localDayStartToUtcIso = (day: string): string | undefined => {
  const date = parseDay(day);
  if (!date) return undefined;
  return date.toISOString();
};

export const localDayEndToUtcIso = (day: string): string | undefined => {
  const date = parseDay(day);
  if (!date) return undefined;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

// Диапазон невалиден, только если заданы ОБА дня и from > to; открытый диапазон
// (одна граница) валиден. YYYY-MM-DD корректно сравнивается лексикографически.
export const isDayRangeInvalid = (from?: unknown, to?: unknown): boolean =>
  typeof from === 'string' && from !== '' && typeof to === 'string' && to !== '' && from > to;

export const INVALID_RANGE_MESSAGE = 'Дата начала позже даты конца';
