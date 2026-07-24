// Тип вопроса (employee_tests/backend.md): single_choice — ровно один верный вариант,
// multiple_choice — минимум один. Значения — контрактные строки enum'а (native_enum=False).
export const QUESTION_TYPE_CHOICES = [
  { id: 'single_choice', name: 'Один вариант ответа' },
  { id: 'multiple_choice', name: 'Несколько вариантов ответа' },
];

// Значения по умолчанию для Create (Edit подставляет их из record через getOne).
export const TEST_TEMPLATE_DEFAULT_VALUES = {
  pass_threshold_percent: 70,
  max_attempts: 1,
  reveal_answers: true,
  shuffle_questions: false,
  questions: [],
};

// Текстовое значение формы (react-hook-form хранит поле как unknown) — только если это
// действительно строка; иначе '' (без риска словить [object Object] через String(obj)).
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

// Валидация конструктора теста целиком — одна form-level функция (SimpleForm validate),
// а не validate на отдельных инпутах: react-hook-form-резолвер, который react-admin строит
// из form-level validate (см. ra-core useAugmentedForm/getSimpleValidationResolver), подменяет
// собой встроенную валидацию отдельных полей — смешивать их ненадёжно. Инварианты single/
// multiple_choice (сколько верных вариантов) к тому же требуют доступа к соседним полям
// того же вопроса, что естественно решается одной функцией над всем деревом значений.
// Зеркалит инварианты import-format.md, «Правила валидности» (те же, что TEST_TEMPLATE_INVALID
// на бэке): title обязателен; pass_threshold_percent — целое 0..100; max_attempts — целое ≥1;
// ≥1 вопрос; у вопроса ≥2 варианта; single_choice — ровно один верный, multiple_choice — ≥1;
// points — целое ≥1.
// Сигнатура намеренно (values: Record<string, any>) => Record<string, any>: react-hook-form
// (FieldValues = Record<string, any>) ожидает именно такую форму у SimpleForm.validate —
// unknown здесь конфликтует с generic-ограничением при выводе типа этого prop'а.
export const validateTestTemplate = (values: Record<string, any>): Record<string, any> => {
  const errors: Record<string, any> = {};

  if (!asText(values.title).trim()) {
    errors.title = 'Укажите название';
  }

  const thresholdNum = Number(values.pass_threshold_percent);
  if (
    values.pass_threshold_percent === undefined ||
    values.pass_threshold_percent === null ||
    values.pass_threshold_percent === '' ||
    !Number.isInteger(thresholdNum) ||
    thresholdNum < 0 ||
    thresholdNum > 100
  ) {
    errors.pass_threshold_percent = 'Целое число от 0 до 100';
  }

  const maxAttemptsNum = Number(values.max_attempts);
  if (
    values.max_attempts === undefined ||
    values.max_attempts === null ||
    values.max_attempts === '' ||
    !Number.isInteger(maxAttemptsNum) ||
    maxAttemptsNum < 1
  ) {
    errors.max_attempts = 'Целое число, не меньше 1';
  }

  const questions: Record<string, unknown>[] = Array.isArray(values.questions)
    ? (values.questions as Record<string, unknown>[])
    : [];
  if (questions.length === 0) {
    errors.questions = 'Добавьте хотя бы один вопрос';
  } else {
    const questionErrors = questions.map((q) => {
      const qErr: Record<string, unknown> = {};
      if (!asText(q.text).trim()) qErr.text = 'Укажите текст вопроса';

      const isValidType = q.type === 'single_choice' || q.type === 'multiple_choice';
      if (!isValidType) qErr.type = 'Выберите тип вопроса';

      const pointsNum = Number(q.points);
      if (
        q.points === undefined ||
        q.points === null ||
        q.points === '' ||
        !Number.isInteger(pointsNum) ||
        pointsNum < 1
      ) {
        qErr.points = 'Целое число, не меньше 1';
      }

      const options: Record<string, unknown>[] = Array.isArray(q.options)
        ? (q.options as Record<string, unknown>[])
        : [];
      if (options.length < 2) {
        qErr.options = 'Минимум 2 варианта ответа';
      } else {
        const optionErrors = options.map((o) =>
          !asText(o.text).trim() ? { text: 'Укажите текст варианта' } : {},
        );
        if (optionErrors.some((e) => Object.keys(e).length > 0)) {
          qErr.options = optionErrors;
        }
        if (isValidType) {
          const correctCount = options.filter((o) => Boolean(o.is_correct)).length;
          if (q.type === 'single_choice' && correctCount !== 1) {
            qErr.type = 'Для одиночного выбора нужен ровно один верный вариант';
          } else if (q.type === 'multiple_choice' && correctCount < 1) {
            qErr.type = 'Для множественного выбора нужен хотя бы один верный вариант';
          }
        }
      }
      return qErr;
    });
    if (questionErrors.some((e) => Object.keys(e).length > 0)) {
      errors.questions = questionErrors;
    }
  }

  return errors;
};
