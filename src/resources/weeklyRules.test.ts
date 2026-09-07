import { describe, expect, it } from 'vitest';
import { validateWeeklyRules } from './weeklyRules';

describe('validateWeeklyRules', () => {
  it('accepts an empty set and a valid Saturday override', () => {
    expect(validateWeeklyRules([])).toBeUndefined();
    expect(validateWeeklyRules([{ weekday: 6, is_enabled: true, start_time: '09:00', end_time: '19:00' }])).toBeUndefined();
  });

  it('accepts a disabled Sunday only with null times', () => {
    expect(validateWeeklyRules([{ weekday: 7, is_enabled: false, start_time: null, end_time: null }])).toBeUndefined();
    expect(validateWeeklyRules([{ weekday: 7, is_enabled: false, start_time: '09:00', end_time: null }])).toBeTruthy();
  });

  it('rejects duplicates, invalid time and equal endpoints', () => {
    expect(validateWeeklyRules([
      { weekday: 1, is_enabled: true, start_time: '09:00', end_time: '19:00' },
      { weekday: 1, is_enabled: true, start_time: '10:00', end_time: '20:00' },
    ])).toBeTruthy();
    expect(validateWeeklyRules([{ weekday: 2, is_enabled: true, start_time: '25:00', end_time: '19:00' }])).toBeTruthy();
    expect(validateWeeklyRules([{ weekday: 3, is_enabled: true, start_time: '09:00', end_time: '09:00' }])).toBeTruthy();
  });
});
