// Справочник категорий начислений (payroll_breakdown) — чистые помощники без React,
// общие для ресурса «Категории начислений», формы начисления и dataProvider.

export interface AdjustmentCategory {
  id: string;
  organization_id: string;
  name: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  adjustments_count: number;
}

export const NO_CATEGORY_LABEL = 'Без категории';
export const CATEGORY_DUPLICATE_MESSAGE = 'Категория с таким названием уже есть';
export const CATEGORY_NOT_FOUND_MESSAGE = 'Категория не найдена или удалена';
export const CATEGORY_NAME_MAX = 100;

// Спецзначение фильтра `category_id` у GET .../adjustments: начисления без категории.
export const NO_CATEGORY_FILTER = 'none';

// Коды ошибок категорий → поле формы (dataProvider раскладывает их в body.errors, чтобы
// react-admin подсветил «Название», а не показал только toast).
export const ADJUSTMENT_CATEGORY_ERROR_FIELDS: Record<
  string,
  { field: string; status: number; message?: string }
> = {
  ADJUSTMENT_CATEGORY_DUPLICATE: {
    field: 'name',
    status: 409,
    message: CATEGORY_DUPLICATE_MESSAGE,
  },
};

// Сравнение имён без учёта регистра — как сортирует бэк (lower(name)).
export const compareCategoryNames = (a: string, b: string): number =>
  a.localeCompare(b, 'ru', { sensitivity: 'base' });

// Имя категории для отображения: null/пусто (старое начисление или «Без категории»).
export const categoryLabel = (name: string | null | undefined): string =>
  typeof name === 'string' && name.trim() !== '' ? name : NO_CATEGORY_LABEL;

// Валидация названия: 1..100 символов после trim (контракт backend.md).
export const validateCategoryName = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return 'Укажите название';
  if (text.length > CATEGORY_NAME_MAX) return `Не более ${CATEGORY_NAME_MAX} символов`;
  return undefined;
};

// Текст подтверждения удаления (ADR-003: только «Удалить»). При наличии начислений
// поясняем, что они сохранят категорию.
export const deleteCategoryConfirmText = (adjustmentsCount: number | null | undefined): string => {
  const count = adjustmentsCount ?? 0;
  const base = 'Категория исчезнет из списка выбора.';
  if (count <= 0) return base;
  return `${base} Уже созданные начисления (${count}) сохранят эту категорию; новые назначить на неё будет нельзя.`;
};
