import { describe, expect, it } from 'vitest';
import {
  calendarDayForInstant,
  dayUtcBounds,
  deviceTime,
  formatDateTime,
  organizationTime,
  resolveOrganizationTime,
  utcBoundsForCalendarDay,
  zonedWallTimeToUtcIso,
} from './time';
import { utcIsoToZonedInput, zonedInputToUtcIso } from './dates';

describe('time', () => {
  it('formats an organization instant independently of the browser timezone', () => {
    expect(formatDateTime('2026-09-01T04:39:06Z', organizationTime('Europe/Moscow'))).toBe(
      '01.09.2026, 07:39',
    );
  });

  it.each([
    ['2026-01-15T12:00:00Z', '13:00'],
    ['2026-07-15T12:00:00Z', '14:00'],
  ])('uses the offset active at the instant for Europe/Berlin (%s)', (instant, expectedTime) => {
    expect(formatDateTime(instant, organizationTime('Europe/Berlin'))).toContain(expectedTime);
  });

  it.each([
    ['2026-03-29', 23],
    ['2026-10-25', 25],
  ])('calculates the DST-aware duration of a Berlin calendar day (%s)', (day, expectedHours) => {
    expect(dayUtcBounds(day, organizationTime('Europe/Berlin')).durationHours).toBe(expectedHours);
  });

  it('uses an inclusive API end bound for the organization calendar day', () => {
    expect(utcBoundsForCalendarDay('2026-03-29', organizationTime('Europe/Berlin'))).toEqual({
      from: '2026-03-28T23:00:00.000Z',
      to: '2026-03-29T21:59:59.999Z',
    });
  });

  it('falls back to device time for an invalid IANA zone without throwing', () => {
    const context = organizationTime('Not/AZone');
    expect(() => formatDateTime('2026-09-01T04:39:06Z', context)).not.toThrow();
    expect(formatDateTime('2026-09-01T04:39:06Z', context)).toBe(
      formatDateTime('2026-09-01T04:39:06Z', deviceTime()),
    );
  });

  it('uses a valid scoped timezone before device time when the record timezone is invalid', () => {
    const context = resolveOrganizationTime('Not/AZone', 'Europe/Moscow');
    expect(formatDateTime('2026-09-01T04:39:06Z', context)).toBe('01.09.2026, 07:39');
  });

  it('rejects a non-existent Berlin wall time during the DST gap', () => {
    expect(zonedWallTimeToUtcIso('2026-03-29', '02:30', 'Europe/Berlin')).toBeUndefined();
  });

  it('uses the earlier instant for an ambiguous Berlin wall time during the DST overlap', () => {
    expect(zonedWallTimeToUtcIso('2026-10-25', '02:30', 'Europe/Berlin')).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('normalizes a midnight DST gap to the first valid instant of the calendar day', () => {
    expect(utcBoundsForCalendarDay('2019-09-08', organizationTime('America/Santiago'))).toEqual({
      from: '2019-09-08T04:00:00.000Z',
      to: '2019-09-09T02:59:59.999Z',
    });
  });

  it('converts organization datetime-local form values without using device-local time', () => {
    expect(zonedInputToUtcIso('2026-09-01T07:39', 'Europe/Moscow')).toBe(
      '2026-09-01T04:39:00.000Z',
    );
    expect(utcIsoToZonedInput('2026-09-01T04:39:00.000Z', 'Europe/Moscow')).toBe(
      '2026-09-01T07:39',
    );
  });

  it('builds orgStats calendar range in the scoped organization timezone', () => {
    expect(utcBoundsForCalendarDay('2026-09-01', organizationTime('Europe/Moscow'))).toEqual({
      from: '2026-08-31T21:00:00.000Z',
      to: '2026-09-01T20:59:59.999Z',
    });
  });

  it('restores payroll deep-link calendar days in the report timezone', () => {
    expect(calendarDayForInstant('2026-09-01T21:00:00.000Z', organizationTime('Europe/Moscow'))).toBe(
      '2026-09-02',
    );
  });

  it('returns null for calendarDayForInstant given an invalid instant', () => {
    expect(calendarDayForInstant('not-a-date', organizationTime('Europe/Moscow'))).toBeNull();
  });

  it('resolves calendarDayForInstant in the device context without throwing', () => {
    expect(calendarDayForInstant('2026-09-01T12:00:00Z', deviceTime())).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('falls back to device time when both the record and scoped timezone are invalid', () => {
    const context = resolveOrganizationTime('Not/AZone', 'Also/Invalid');
    expect(formatDateTime('2026-09-01T04:39:06Z', context)).toBe(
      formatDateTime('2026-09-01T04:39:06Z', deviceTime()),
    );
  });

  it('falls back to the scoped timezone when the record timezone is missing', () => {
    const context = resolveOrganizationTime(null, 'Europe/Moscow');
    expect(formatDateTime('2026-09-01T04:39:06Z', context)).toBe('01.09.2026, 07:39');
  });

  it('rejects a manual-entry datetime-local value that falls in a Berlin DST gap', () => {
    expect(zonedInputToUtcIso('2026-03-29T02:30', 'Europe/Berlin')).toBeUndefined();
  });

  it.each([
    ['2026-01-15', '13:00'],
    ['2026-07-15', '14:00'],
  ])(
    'round-trips a manual-entry wall time through the organization timezone (Berlin %s)',
    (day, time) => {
      const iso = zonedWallTimeToUtcIso(day, time, 'Europe/Berlin');
      expect(iso).toBeDefined();
      expect(utcIsoToZonedInput(iso, 'Europe/Berlin')).toBe(`${day}T${time}`);
    },
  );
});
