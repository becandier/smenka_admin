import {
  utcIsoToZonedParts as toZonedParts,
  zonedWallTimeToUtcIso as wallTimeToUtcIso,
} from './time';

// Диапазон невалиден, только если заданы ОБА дня и from > to; открытый диапазон
// (одна граница) валиден. YYYY-MM-DD корректно сравнивается лексикографически.
export const isDayRangeInvalid = (from?: unknown, to?: unknown): boolean =>
  typeof from === 'string' && from !== '' && typeof to === 'string' && to !== '' && from > to;

export const INVALID_RANGE_MESSAGE = 'Дата начала позже даты конца';

// Значение инпута datetime-local (локаль пользователя) → UTC ISO8601.
export const localInputToUtcIso = (value: string): string | undefined => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

// UTC ISO8601 → значение для инпута datetime-local (локаль, без секунд).
export const utcIsoToLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

// --- Ввод в таймзоне организации (manual_time_entry) ---
// Gap policy: datetime-local values in a missing DST wall interval are rejected; overlap policy:
// the earlier UTC instant is selected. The implementation and round-trip validation live in
// time.ts, so every org form shares the same policy.
export const zonedWallTimeToUtcIso = wallTimeToUtcIso;
export const utcIsoToZonedParts = toZonedParts;

export const zonedDayStartToUtcIso = (day: string, tz: string): string | undefined =>
  wallTimeToUtcIso(day, '00:00', tz);

export const zonedInputToUtcIso = (value: string, tz: string): string | undefined => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return match ? wallTimeToUtcIso(match[1], match[2], tz) : undefined;
};

export const utcIsoToZonedInput = (iso: string | null | undefined, tz: string): string => {
  const parts = toZonedParts(iso, tz);
  return parts ? `${parts.day}T${parts.time}` : '';
};

// Календарный сдвиг дня (YYYY-MM-DD) на delta суток — чистая календарная арифметика
// (UTC внутри используется только как нейтральный счётчик дней, не как таймзона результата).
// Нужен для ночных смен manual_time_entry: «конец раньше начала» → следующие сутки.
export const addDaysToDay = (day: string, delta: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  date.setUTCDate(date.getUTCDate() + delta);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

// «01.03.2026» из календарного дня (YYYY-MM-DD) — без создания Date/риска съехать на
// соседние сутки от таймзоны браузера (formatDate из format.ts гоняет через new Date(iso),
// это годится только для настоящих ISO-моментов, не для голого календарного дня).
export const formatDayRu = (day: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${m[3]}.${m[2]}.${m[1]}`;
};
