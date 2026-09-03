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

const isValidTimeZone = (timeZone: string | null | undefined): timeZone is string => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch (error) {
    return !(error instanceof RangeError);
  }
};

// Self-contained DTO timezone wins only when it is valid. During rolling deploy an invalid or
// missing DTO field must not discard the valid timezone already loaded for the scoped org.
export const resolveOrganizationTime = (
  recordTimeZone: string | null | undefined,
  scopedTimeZone: string | null | undefined,
): TimeContext => {
  if (isValidTimeZone(recordTimeZone)) return organizationTime(recordTimeZone);
  if (isValidTimeZone(scopedTimeZone)) return organizationTime(scopedTimeZone);
  return deviceTime();
};

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
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

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

const matchesWallTime = (parts: ZonedParts, wallMs: number): boolean => {
  const expected = new Date(wallMs);
  return (
    Number(parts.year) === expected.getUTCFullYear() &&
    Number(parts.month) === expected.getUTCMonth() + 1 &&
    Number(parts.day) === expected.getUTCDate() &&
    Number(parts.hour) === expected.getUTCHours() &&
    Number(parts.minute) === expected.getUTCMinutes() &&
    Number(parts.second) === expected.getUTCSeconds()
  );
};

// A local wall time has zero (DST gap), one, or two (DST overlap) matching UTC instants. We
// sample offsets around the target wall date, validate each candidate by a formatToParts
// round-trip, and choose the earlier instant for an overlap. No iterative offset convergence is
// used, so a midnight transition cannot oscillate between offsets.
const wallTimeCandidates = (wallMs: number, timeZone: string): number[] => {
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(offsetMsAt(wallMs + hours * 3_600_000, timeZone));
  }
  return [...offsets]
    .map((offset) => wallMs - offset)
    .filter((candidate) => matchesWallTime(zonedPartsAt(candidate, timeZone), wallMs))
    .sort((left, right) => left - right);
};

export const zonedWallTimeToUtcIso = (
  day: string,
  time: string,
  timeZone: string,
): string | undefined => {
  const parsed = parseCalendarDay(day);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!parsed || !timeMatch || !isValidTimeZone(timeZone)) return undefined;
  const wallMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  const [earlierCandidate] = wallTimeCandidates(wallMs, timeZone);
  return earlierCandidate === undefined ? undefined : new Date(earlierCandidate).toISOString();
};

const zonedCalendarDayStartMs = (day: string, timeZone: string): number | null => {
  const parsed = parseCalendarDay(day);
  if (!parsed || !isValidTimeZone(timeZone)) return null;
  const midnightWallMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const exactMidnight = wallTimeCandidates(midnightWallMs, timeZone)[0];
  if (exactMidnight !== undefined) return exactMidnight;
  // Gap policy for calendar bounds: normalize a missing midnight to the first valid wall minute
  // of the same calendar day. Form input uses zonedWallTimeToUtcIso and rejects gaps instead.
  for (let minute = 1; minute < 24 * 60; minute += 1) {
    const candidate = wallTimeCandidates(midnightWallMs + minute * 60_000, timeZone)[0];
    if (candidate !== undefined) return candidate;
  }
  return null;
};

export const utcIsoToZonedParts = (
  iso: string | null | undefined,
  timeZone: string,
): { day: string; time: string } | null => {
  const date = asValidDate(iso);
  if (!date || !isValidTimeZone(timeZone)) return null;
  const parts = zonedPartsAt(date.getTime(), timeZone);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

export const calendarDayForInstant = (
  value: string | Date | null | undefined,
  context: TimeContext,
): string | null => {
  const date = asValidDate(value);
  if (!date) return null;
  return withTimeZone(context, (timeZone) => {
    const parts = timeZone
      ? zonedPartsAt(date.getTime(), timeZone)
      : (() => {
          const local = new Date(date.getTime());
          const pad = (value: number): string => String(value).padStart(2, '0');
          return {
            year: String(local.getFullYear()),
            month: pad(local.getMonth() + 1),
            day: pad(local.getDate()),
            hour: pad(local.getHours()),
            minute: pad(local.getMinutes()),
            second: pad(local.getSeconds()),
          };
        })();
    return `${parts.year}-${parts.month}-${parts.day}`;
  });
};

const deviceMidnightToUtcMs = (day: string): number | null => {
  const parsed = parseCalendarDay(day);
  if (!parsed) return null;
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const calendarDayStartMs = (day: string, context: TimeContext): number | null =>
  withTimeZone(context, (timeZone) =>
    timeZone ? zonedCalendarDayStartMs(day, timeZone) : deviceMidnightToUtcMs(day),
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
