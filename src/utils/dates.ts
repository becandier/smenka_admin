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
//
// datetime-local привязан к таймзоне БРАУЗЕРА, а форма ручного ввода/правки смены обязана
// работать в таймзоне ОРГАНИЗАЦИИ (admin.md: «смешивать локальную таймзону браузера и
// орг-таймзону в одной форме запрещено») — отдельные поля «Дата»/«Время» (type=date/time,
// уже нейтральны к таймзоне сами по себе, это просто три числа) конвертируются в UTC через
// Intl.DateTimeFormat с явным timeZone, без datetime-local.

const zonedPartsAt = (utcMs: number, tz: string): Record<string, string> => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return map;
};

// Смещение tz относительно UTC (мс) в момент utcMs: сколько нужно прибавить к UTC-времени,
// чтобы получить показания часов в tz. Пересчитывается на каждый вызов — переходы DST
// для разных tz/моментов имеют разное смещение, кэшировать по одному значению нельзя.
const offsetMsAt = (utcMs: number, tz: string): number => {
  const p = zonedPartsAt(utcMs, tz);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - utcMs;
};

// «Календарная дата» (YYYY-MM-DD) + «время» (HH:MM), понимаемые как настенные часы в tz →
// UTC ISO8601. Два прохода уточнения смещения — достаточно для сходимости у любых реальных
// IANA-зон (в т.ч. на границе перевода стрелок), не идём в бесконечный цикл.
export const zonedWallTimeToUtcIso = (
  day: string,
  time: string,
  tz: string,
): string | undefined => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return undefined;
  const wallMs = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    0,
  );
  let guess = wallMs;
  for (let i = 0; i < 2; i += 1) {
    guess = wallMs - offsetMsAt(guess, tz);
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? undefined : result.toISOString();
};

// Обратное преобразование: UTC ISO8601 → { day, time } настенных часов в tz (значения
// существующих полей формы правки — показ, как и требует admin.md, тоже в таймзоне org).
export const utcIsoToZonedParts = (
  iso: string | null | undefined,
  tz: string,
): { day: string; time: string } | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const p = zonedPartsAt(date.getTime(), tz);
  if (!p.year) return null;
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

// «Календарный день» (YYYY-MM-DD) в tz → UTC ISO начала этого дня (00:00 по орг-таймзоне).
// Используется для дат без времени (occurred_at ручных начислений).
export const zonedDayStartToUtcIso = (day: string, tz: string): string | undefined =>
  zonedWallTimeToUtcIso(day, '00:00', tz);

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
