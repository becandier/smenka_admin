export type WeeklyRule = {
  weekday: number;
  is_enabled: boolean;
  start_time: string | null;
  end_time: string | null;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const validateWeeklyRules = (rules: WeeklyRule[]): string | undefined => {
  const weekdays = new Set<number>();
  for (const rule of rules) {
    if (weekdays.has(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) return 'Неверный день недели';
    weekdays.add(rule.weekday);
    if (!rule.is_enabled) {
      if (rule.start_time !== null || rule.end_time !== null) return 'У выходного дня время должно быть пустым';
      continue;
    }
    if (typeof rule.start_time !== 'string' || !TIME_PATTERN.test(rule.start_time) ||
        typeof rule.end_time !== 'string' || !TIME_PATTERN.test(rule.end_time)) return 'Некорректное время';
    if (rule.start_time === rule.end_time) return 'Время начала и конца не должны совпадать';
  }
  return undefined;
};

