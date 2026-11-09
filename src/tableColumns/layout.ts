// Раскладка столбцов таблицы (table_column_settings/admin.md, «Формат раскладки»).
//
// Чистая логика без React и без знания о Datagrid: на входе — сохранённое значение (что угодно,
// пришедшее с сервера или из локальной копии) и текущий набор столбцов таблицы в стандартном
// порядке, на выходе — полная раскладка и то, что показывать пользователю.
//
// Термины:
// - «столбец» — настраиваемый столбец с идентификатором (латиница, snake_case). Служебные
//   столбцы без заголовка (кнопки действий, значки) сюда не входят вовсе — их расставляет
//   слой отрисовки (fields.ts), всегда в конце и всегда видимыми.
// - «ключевой столбец» — первый в стандартном порядке. Всегда первый и всегда видимый.
// - «недоступный столбец» (available=false) — есть в таблице, но не этому пользователю сейчас
//   (условие вроде showRate, профиль доступа). Остаётся в полной раскладке на своём месте,
//   но не попадает в вид (viewOf) — правило 5.

export const LAYOUT_VERSION = 1;

export interface ColumnDef {
  id: string;
  available: boolean;
}

// Значение в хранилище по ключу admin.table.<tableId>.
export interface StoredLayout {
  v: typeof LAYOUT_VERSION;
  order: string[];
  hidden: string[];
}

// Полная раскладка: каждый столбец таблицы ровно один раз, включая недоступные.
export interface Layout {
  order: string[];
  hidden: string[];
}

// Вид для пользователя: только доступные столбцы, ключевой первым.
export interface LayoutView {
  order: string[];
  hidden: string[];
}

const standardLayout = (columns: readonly ColumnDef[]): Layout => ({
  order: columns.map((c) => c.id),
  hidden: [],
});

const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : null;

// Правило 1: запись с незнакомой версией (или битая) — как отсутствие записи.
const parseStored = (saved: unknown): { order: string[]; hidden: string[] } | null => {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return null;
  const record = saved as Record<string, unknown>;
  if (record.v !== LAYOUT_VERSION) return null;
  const order = stringArray(record.order);
  if (order === null) return null;
  return { order, hidden: stringArray(record.hidden) ?? [] };
};

// Сохранённая раскладка + текущий набор столбцов → полная раскладка (правила 1–5).
export const resolveLayout = (saved: unknown, columns: readonly ColumnDef[]): Layout => {
  const parsed = parseStored(saved);
  if (parsed === null || columns.length === 0) return standardLayout(columns);

  const standard = columns.map((c) => c.id);
  const key = standard[0];
  const known = new Set(standard);

  // Правило 2: исчезнувшие идентификаторы пропускаем; дубли — тоже. Ключевой столбец ставим
  // в конце сам (правило 4), поэтому из сохранённого порядка его убираем.
  const order: string[] = [];
  for (const id of parsed.order) {
    if (known.has(id) && id !== key && !order.includes(id)) order.push(id);
  }

  // Правило 3: столбец, которого нет в order, встаёт сразу после ближайшего предшествующего
  // ему в стандартном порядке столбца, который в order есть. Уже вставленные новые столбцы
  // тоже считаются присутствующими — так два новых соседа сохраняют стандартный порядок между
  // собой. Нет такого предшественника (предшествует только ключевой) — сразу за ключевым.
  standard.forEach((id, index) => {
    if (id === key || order.includes(id)) return;
    let insertAt = 0;
    for (let j = index - 1; j >= 1; j -= 1) {
      const at = order.indexOf(standard[j]);
      if (at >= 0) {
        insertAt = at + 1;
        break;
      }
    }
    order.splice(insertAt, 0, id);
  });

  // Правило 4: ключевой столбец всегда первый и видимый.
  order.unshift(key);
  const hiddenSet = new Set(parsed.hidden.filter((id) => known.has(id) && id !== key));
  return { order, hidden: order.filter((id) => hiddenSet.has(id)) };
};

const availableIds = (columns: readonly ColumnDef[]): Set<string> =>
  new Set(columns.filter((c) => c.available).map((c) => c.id));

// Правило 5: в вид попадают только доступные столбцы.
export const viewOf = (layout: Layout, columns: readonly ColumnDef[]): LayoutView => {
  const available = availableIds(columns);
  return {
    order: layout.order.filter((id) => available.has(id)),
    hidden: layout.hidden.filter((id) => available.has(id)),
  };
};

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// Вид совпадает со стандартным (для точки «Вид таблицы изменён» и активности «Сбросить»).
// Считается по доступным столбцам: что пользователь не видит, то и «изменённым» не считает.
export const isStandardView = (layout: Layout, columns: readonly ColumnDef[]): boolean => {
  const view = viewOf(layout, columns);
  const standard = viewOf(standardLayout(columns), columns);
  return view.hidden.length === 0 && sameIds(view.order, standard.order);
};

// Новый порядок доступных столбцов вписывается обратно в полную раскладку: недоступные
// столбцы остаются на своих местах, доступные занимают свои позиции в новом порядке.
const withAvailableOrder = (
  layout: Layout,
  columns: readonly ColumnDef[],
  nextAvailable: readonly string[],
): Layout => {
  const available = availableIds(columns);
  let cursor = 0;
  const order = layout.order.map((id) => {
    if (!available.has(id)) return id;
    const next = nextAvailable[cursor];
    cursor += 1;
    return next;
  });
  return { order, hidden: order.filter((id) => layout.hidden.includes(id)) };
};

// Показать/скрыть столбец. Ключевой и недоступный не трогаем.
export const toggleColumn = (layout: Layout, columns: readonly ColumnDef[], id: string): Layout => {
  const view = viewOf(layout, columns);
  if (!view.order.includes(id) || id === view.order[0]) return layout;
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((x) => x !== id)
    : [...layout.hidden, id];
  return { order: layout.order, hidden: layout.order.filter((x) => hidden.includes(x)) };
};

// Переставить столбец на позицию toIndex в виде (среди доступных столбцов). Ключевой столбец
// не двигается, и перед ним ничего не ставится: позиция 0 зажимается до 1.
export const moveColumn = (
  layout: Layout,
  columns: readonly ColumnDef[],
  id: string,
  toIndex: number,
): Layout => {
  const view = viewOf(layout, columns);
  const from = view.order.indexOf(id);
  if (from <= 0) return layout;
  const target = Math.max(1, Math.min(toIndex, view.order.length - 1));
  if (target === from) return layout;
  const next = view.order.filter((x) => x !== id);
  next.splice(target, 0, id);
  return withAvailableOrder(layout, columns, next);
};

// Полная раскладка → значение для хранилища. null — стандартный вид: запись удаляется.
export const toStored = (layout: Layout, columns: readonly ColumnDef[]): StoredLayout | null => {
  const standard = standardLayout(columns);
  if (layout.hidden.length === 0 && sameIds(layout.order, standard.order)) return null;
  return { v: LAYOUT_VERSION, order: [...layout.order], hidden: [...layout.hidden] };
};
