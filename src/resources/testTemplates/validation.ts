import { textOrEmpty } from '../../utils/format';

// Тип вопроса (employee_tests/backend.md): single_choice — ровно один верный вариант,
// multiple_choice — минимум один. Значения — контрактные строки enum'а (native_enum=False).
export const QUESTION_TYPE_CHOICES = [
  { id: 'single_choice', name: 'Один вариант ответа' },
  { id: 'multiple_choice', name: 'Несколько вариантов ответа' },
];

// Значения по умолчанию для Create (Edit подставляет их из record через getOne). Фабрика,
// а не общий объект-константа: SimpleForm defaultValues передаётся напрямую в useForm,
// и общий на все монтирования Create массив questions — латентная ловушка на случай,
// если react-hook-form когда-нибудь перестанет клонировать defaultValues на входе.
export const getTestTemplateDefaultValues = () => ({
  pass_threshold_percent: 70,
  max_attempts: 1,
  reveal_answers: true,
  shuffle_questions: false,
  questions: [] as unknown[],
});

// «Целое число ≥ min (и ≤ max, если задан)» — общая проверка для pass_threshold_percent/
// max_attempts/points (одна и та же форма инварианта из import-format.md с разными границами).
const isValidInt = (value: unknown, min: number, max = Infinity): boolean => {
  if (value === undefined || value === null || value === '') return false;
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
};

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

  if (!textOrEmpty(values.title).trim()) {
    errors.title = 'Укажите название';
  }
  if (!isValidInt(values.pass_threshold_percent, 0, 100)) {
    errors.pass_threshold_percent = 'Целое число от 0 до 100';
  }
  if (!isValidInt(values.max_attempts, 1)) {
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
      if (!textOrEmpty(q.text).trim()) qErr.text = 'Укажите текст вопроса';

      const isValidType = q.type === 'single_choice' || q.type === 'multiple_choice';
      if (!isValidType) qErr.type = 'Выберите тип вопроса';

      if (!isValidInt(q.points, 1)) {
        qErr.points = 'Целое число, не меньше 1';
      }

      const options: Record<string, unknown>[] = Array.isArray(q.options)
        ? (q.options as Record<string, unknown>[])
        : [];
      if (options.length < 2) {
        qErr.options = 'Минимум 2 варианта ответа';
      } else {
        const optionErrors = options.map((o) =>
          !textOrEmpty(o.text).trim() ? { text: 'Укажите текст варианта' } : {},
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
