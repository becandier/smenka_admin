export type TimeContext =
  | { kind: 'organization'; timeZone: string }
  | { kind: 'device' };

export interface CalendarDayUtcBounds {
  from: string;
  to: string;
  durationHours: number;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMPTY_VALUE = '—';

export const organizationTime = (timeZone: string): TimeContext => ({
  kind: 'organization',
  timeZone,
});

export const deviceTime = (): TimeContext => ({ kind: 'device' });

const asValidDate = (value: string | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const withTimeZone = <T>(context: TimeContext, format: (timeZone?: string) => T): T => {
  if (context.kind === 'device') return format();
  try {
    return format(context.timeZone);
  } catch (error) {
    if (error instanceof RangeError) return format();
    throw error;
  }
};

const dateTimeFormatter = (timeZone?: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

const dateFormatter = (timeZone?: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const timeFormatter = (timeZone?: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

export const formatDateTime = (
  value: string | Date | null | undefined,
  context: TimeContext,
): string => {
  const date = asValidDate(value);
  return date ? withTimeZone(context, (timeZone) => dateTimeFormatter(timeZone).format(date)) : EMPTY_VALUE;
};

export const formatDate = (
  value: string | Date | null | undefined,
  context: TimeContext,
): string => {
  const date = asValidDate(value);
  return date ? withTimeZone(context, (timeZone) => dateFormatter(timeZone).format(date)) : EMPTY_VALUE;
};

export const formatTime = (
  value: string | Date | null | undefined,
  context: TimeContext,
): string => {
  const date = asValidDate(value);
  return date ? withTimeZone(context, (timeZone) => timeFormatter(timeZone).format(date)) : EMPTY_VALUE;
};

const parseCalendarDay = (day: string): { year: number; month: number; day: number } | null => {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== date
  ) {
    return null;
  }
  return { year, month, day: date };
};

const calendarDayAfter = (day: string): string | null => {
  const parsed = parseCalendarDay(day);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1));
  return date.toISOString().slice(0, 10);
};

type ZonedParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

const zonedPartsAt = (utcMs: number, timeZone: string): ZonedParts => {
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {} as ZonedParts;
  for (const part of formatter.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type as keyof ZonedParts] = part.value;
  }
  return parts;
};

const offsetMsAt = (utcMs: number, timeZone: string): number => {
  const parts = zonedPartsAt(utcMs, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - utcMs;
};

const zonedMidnightToUtcMs = (day: string, timeZone: string): number | null => {
  const parsed = parseCalendarDay(day);
  if (!parsed) return null;
  const wallMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  let guess = wallMs;
  // The offset is recalculated for the target instant on every iteration. This is what makes
  // adjacent calendar days correct around DST transitions instead of assuming a fixed offset.
  for (let index = 0; index < 4; index += 1) guess = wallMs - offsetMsAt(guess, timeZone);
  return Number.isNaN(guess) ? null : guess;
};

const deviceMidnightToUtcMs = (day: string): number | null => {
  const parsed = parseCalendarDay(day);
  if (!parsed) return null;
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const calendarDayStartMs = (day: string, context: TimeContext): number | null =>
  withTimeZone(context, (timeZone) =>
    timeZone ? zonedMidnightToUtcMs(day, timeZone) : deviceMidnightToUtcMs(day),
  );

export const dayUtcBounds = (day: string, context: TimeContext): CalendarDayUtcBounds => {
  const followingDay = calendarDayAfter(day);
  const fromMs = calendarDayStartMs(day, context);
  const nextStartMs = followingDay ? calendarDayStartMs(followingDay, context) : null;
  if (fromMs === null || nextStartMs === null) return { from: '', to: '', durationHours: 0 };
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(nextStartMs - 1).toISOString(),
    durationHours: (nextStartMs - fromMs) / 3_600_000,
  };
};

// API date filters use an inclusive `date_to`; `dayUtcBounds` keeps the exclusive next
// midnight internally only to expose the exact calendar-day duration to tests and callers.
export const utcBoundsForCalendarDay = (
  day: string,
  context: TimeContext,
): Pick<CalendarDayUtcBounds, 'from' | 'to'> => {
  const { from, to } = dayUtcBounds(day, context);
  return { from, to };
};
