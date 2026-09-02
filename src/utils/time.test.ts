import { describe, expect, it } from 'vitest';
import {
  dayUtcBounds,
  deviceTime,
  formatDateTime,
  organizationTime,
  utcBoundsForCalendarDay,
} from './time';

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
});
