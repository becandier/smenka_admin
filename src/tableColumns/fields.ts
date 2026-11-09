import { cloneElement, createElement, isValidElement, type ReactElement } from 'react';
import type { ColumnDef, LayoutView } from './layout';

// Связка раскладки (layout.ts) с элементами-полями таблицы.
//
// Таблица описывает столбцы массивом элементов в стандартном порядке:
// - элемент с `key` — настраиваемый столбец; key — его идентификатор (латиница, snake_case,
//   не переименовывается после выпуска), заголовок для меню — проп `label`;
// - элемент без `key` — служебный столбец без заголовка (кнопки, значки): в меню не попадает,
//   всегда показан и стоит в конце в исходном порядке;
// - unavailableColumn('id') — столбец, недоступный пользователю сейчас (правило 5): занимает
//   своё место в стандартном порядке, но не показывается ни в таблице, ни в меню;
// - false/null/undefined (условный рендер служебного столбца) пропускаются.

// Маркер-заглушка: ничего не рисует, отличается от полей по типу элемента.
const unavailableMarker = () => null;

export const unavailableColumn = (id: string): ReactElement =>
  createElement(unavailableMarker, { key: id });

export type ColumnField = ReactElement | false | null | undefined;

export interface FieldColumn extends ColumnDef {
  label: string;
}

export interface ParsedFields {
  columns: FieldColumn[];
  fieldById: Map<string, ReactElement>;
  service: ReactElement[];
  // Нарушения соглашения об идентификаторах (для предупреждения в dev-сборке).
  problems: string[];
}

const COLUMN_ID = /^[a-z][a-z0-9_]*$/;

const labelOf = (element: ReactElement): string => {
  const label = (element.props as { label?: unknown }).label;
  return typeof label === 'string' ? label : '';
};

export const parseFields = (fields: readonly ColumnField[]): ParsedFields => {
  const columns: FieldColumn[] = [];
  const fieldById = new Map<string, ReactElement>();
  const service: ReactElement[] = [];
  const problems: string[] = [];
  for (const field of fields) {
    if (!isValidElement(field)) continue;
    const id = field.key;
    if (id === null) {
      service.push(cloneElement(field, { key: `service-${service.length}` }));
      continue;
    }
    if (!COLUMN_ID.test(id)) problems.push(`идентификатор столбца «${id}» не в snake_case`);
    if (columns.some((c) => c.id === id)) {
      problems.push(`идентификатор столбца «${id}» повторяется`);
      continue;
    }
    if (field.type === unavailableMarker) {
      columns.push({ id, label: '', available: false });
      continue;
    }
    const label = labelOf(field);
    if (label === '') problems.push(`у столбца «${id}» нет заголовка (label)`);
    columns.push({ id, label, available: true });
    fieldById.set(id, field);
  }
  if (columns.length > 0 && !columns[0].available) {
    problems.push('ключевой (первый) столбец не может быть недоступным');
  }
  return { columns, fieldById, service, problems };
};

// Поля для Datagrid/Table в порядке вида: видимые настраиваемые столбцы, затем служебные.
export const arrangeFields = (parsed: ParsedFields, view: LayoutView): ReactElement[] => {
  const hidden = new Set(view.hidden);
  const visible: ReactElement[] = [];
  for (const id of view.order) {
    if (hidden.has(id)) continue;
    const field = parsed.fieldById.get(id);
    if (field !== undefined) visible.push(field);
  }
  return [...visible, ...parsed.service];
};
