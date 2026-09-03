// Валидация поля «Дозаполнение чек-листа после закрытия смены, мин»
// (checklist_grace_minutes; docs/tasks/checklist_grace_period/admin.md).
//
// Отдельная функция, а не голые minValue()/maxValue() из react-admin: помимо диапазона
// 0–240 нужна проверка на целое число, которую react-admin из коробки не делает
// (NumberInput пропускает дробные значения), а три отдельных правила ради одного поля
// усложнили бы форму без пользы — сообщение об ошибке одинаковое для всех случаев.
export const CHECKLIST_GRACE_MINUTES_MIN = 0;
export const CHECKLIST_GRACE_MINUTES_MAX = 240;

export const CHECKLIST_GRACE_MINUTES_ERROR = `Целое число от ${CHECKLIST_GRACE_MINUTES_MIN} до ${CHECKLIST_GRACE_MINUTES_MAX}`;

// react-admin вызывает field-level validate с «сырым» значением поля: пустая строка —
// нормальное промежуточное состояние текстового инпута (пользователь ещё не ввёл число
// или стирает значение), не ошибка сама по себе. required() для этого поля не нужен —
// в форме задан defaultValue.
export const validateChecklistGraceMinutes = (value: unknown): string | undefined => {
  if (value === '' || value === undefined || value === null) return undefined;

  const num = Number(value);
  const isValid =
    Number.isFinite(num) &&
    Number.isInteger(num) &&
    num >= CHECKLIST_GRACE_MINUTES_MIN &&
    num <= CHECKLIST_GRACE_MINUTES_MAX;

  return isValid ? undefined : CHECKLIST_GRACE_MINUTES_ERROR;
};
