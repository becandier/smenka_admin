import { describe, expect, it } from 'vitest';
import { CHECKLIST_GRACE_MINUTES_ERROR, validateChecklistGraceMinutes } from './settingsValidation';

describe('validateChecklistGraceMinutes', () => {
  it('принимает нижнюю границу диапазона (0 — дозаполнение запрещено)', () => {
    expect(validateChecklistGraceMinutes(0)).toBeUndefined();
  });

  it('принимает верхнюю границу диапазона (240)', () => {
    expect(validateChecklistGraceMinutes(240)).toBeUndefined();
  });

  it('принимает значение default (30) и произвольное значение внутри диапазона', () => {
    expect(validateChecklistGraceMinutes(30)).toBeUndefined();
    expect(validateChecklistGraceMinutes(120)).toBeUndefined();
  });

  it('отклоняет значение ниже диапазона', () => {
    expect(validateChecklistGraceMinutes(-1)).toBe(CHECKLIST_GRACE_MINUTES_ERROR);
  });

  it('отклоняет значение выше диапазона', () => {
    expect(validateChecklistGraceMinutes(241)).toBe(CHECKLIST_GRACE_MINUTES_ERROR);
  });

  it('отклоняет нецелое число', () => {
    expect(validateChecklistGraceMinutes(30.5)).toBe(CHECKLIST_GRACE_MINUTES_ERROR);
  });

  it('отклоняет нецелую числовую строку (ввод из NumberInput)', () => {
    expect(validateChecklistGraceMinutes('12.5')).toBe(CHECKLIST_GRACE_MINUTES_ERROR);
  });

  it('отклоняет нечисловой ввод', () => {
    expect(validateChecklistGraceMinutes('abc')).toBe(CHECKLIST_GRACE_MINUTES_ERROR);
  });

  it('не считает пустое значение ошибкой (промежуточное состояние поля)', () => {
    expect(validateChecklistGraceMinutes('')).toBeUndefined();
    expect(validateChecklistGraceMinutes(undefined)).toBeUndefined();
    expect(validateChecklistGraceMinutes(null)).toBeUndefined();
  });
});
