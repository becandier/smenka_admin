import { describe, expect, it } from 'vitest';
import {
  NO_CATEGORY_LABEL,
  categoryLabel,
  deleteCategoryConfirmText,
  validateCategoryName,
} from './adjustmentCategoryUtils';

describe('categoryLabel', () => {
  it('имя категории как есть', () => {
    expect(categoryLabel('Премия')).toBe('Премия');
  });

  it('null/undefined/пусто — «Без категории» (старые начисления, старый бэк)', () => {
    expect(categoryLabel(null)).toBe(NO_CATEGORY_LABEL);
    expect(categoryLabel(undefined)).toBe(NO_CATEGORY_LABEL);
    expect(categoryLabel('  ')).toBe(NO_CATEGORY_LABEL);
  });
});

describe('validateCategoryName', () => {
  it('пустое и из пробелов — ошибка', () => {
    expect(validateCategoryName('')).toBe('Укажите название');
    expect(validateCategoryName('   ')).toBe('Укажите название');
    expect(validateCategoryName(undefined)).toBe('Укажите название');
  });

  it('1..100 символов после trim — ок, больше — ошибка', () => {
    expect(validateCategoryName(' Премия ')).toBeUndefined();
    expect(validateCategoryName('а'.repeat(100))).toBeUndefined();
    expect(validateCategoryName('а'.repeat(101))).toBe('Не более 100 символов');
  });
});

describe('deleteCategoryConfirmText', () => {
  it('без начислений — без пояснения про сохранение', () => {
    expect(deleteCategoryConfirmText(0)).toBe('Категория исчезнет из списка выбора.');
    expect(deleteCategoryConfirmText(undefined)).toBe('Категория исчезнет из списка выбора.');
  });

  it('с начислениями — поясняет, что они сохранят категорию (ADR-003, без «архива»)', () => {
    const text = deleteCategoryConfirmText(12);
    expect(text).toContain('Уже созданные начисления (12) сохранят эту категорию');
    expect(text).toContain('новые назначить на неё будет нельзя');
    expect(text.toLowerCase()).not.toContain('архив');
  });
});
