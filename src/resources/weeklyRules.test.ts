import { describe, expect, it } from 'vitest';
import { persistWeeklyRulesAfterCreate, validateWeeklyRules, weeklyRulesPayload } from './weeklyRules';

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

  it('builds the full replacement API payload and clears disabled times', () => {
    expect(weeklyRulesPayload([
      { weekday: 6, is_enabled: true, start_time: '09:00', end_time: '19:00' },
      { weekday: 7, is_enabled: false, start_time: '08:00', end_time: '17:00' },
    ])).toEqual({ rules: [
      { weekday: 6, is_enabled: true, start_time: '09:00', end_time: '19:00' },
      { weekday: 7, is_enabled: false, start_time: null, end_time: null },
    ] });
  });

  it('propagates create API failure so the UI can show the error code and skip redirect', async () => {
    const writer = {
      setScheduleWeeklyRules: () => Promise.reject(new Error('WEEKLY_RULES_SAVE_FAILED')),
    };
    let redirectCalled = false;
    try {
      await persistWeeklyRulesAfterCreate(writer, 'schedule-1', [
        { weekday: 6, is_enabled: true, start_time: '09:00', end_time: '19:00' },
      ]);
      redirectCalled = true;
    } catch (error) {
      expect(error).toHaveProperty('message', 'WEEKLY_RULES_SAVE_FAILED');
    }
    expect(redirectCalled).toBe(false);
  });
});
