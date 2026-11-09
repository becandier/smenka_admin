import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  isStandardView,
  moveColumn,
  resolveLayout,
  toStored,
  toggleColumn,
  viewOf,
  type Layout,
} from './layout';
import { parseFields, type ColumnField, type FieldColumn } from './fields';
import { useTableLayoutStore, type TableColumnsState } from './context';

const noopSubscribe = () => () => undefined;

// Состояние столбцов таблицы tableId по массиву полей (см. fields.tsx). Не знает о Datagrid:
// результат одинаково подходит для Datagrid и для голой MUI Table.
export const useTableColumns = (
  tableId: string,
  fields: readonly ColumnField[],
): TableColumnsState => {
  const store = useTableLayoutStore();
  const saved = useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => store?.get(tableId));
  const parsed = useMemo(() => parseFields(fields), [fields]);

  // fields пересоздаются каждый рендер, а набор столбцов меняется редко (права, showRate):
  // держим стабильную ссылку на столбцы, пока не изменилась их подпись.
  const signature = parsed.columns
    .map((c) => `${c.id}:${c.available ? 1 : 0}:${c.label}`)
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => parsed.columns, [signature]);

  const problems = parsed.problems.join('; ');
  useEffect(() => {
    if (import.meta.env.DEV && problems !== '') {
      console.error(`[table_column_settings] ${tableId}: ${problems}`);
    }
  }, [tableId, problems]);

  const layout = useMemo(() => resolveLayout(saved, columns), [saved, columns]);
  const view = useMemo(() => viewOf(layout, columns), [layout, columns]);
  const changed = useMemo(() => !isStandardView(layout, columns), [layout, columns]);

  const commit = useCallback(
    (next: Layout) => {
      if (next !== layout) store?.set(tableId, toStored(next, columns));
    },
    [store, tableId, layout, columns],
  );
  const toggle = useCallback(
    (id: string) => commit(toggleColumn(layout, columns, id)),
    [commit, layout, columns],
  );
  const move = useCallback(
    (id: string, toIndex: number) => commit(moveColumn(layout, columns, id, toIndex)),
    [commit, layout, columns],
  );
  const reset = useCallback(() => store?.set(tableId, null), [store, tableId]);

  const menuColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    return view.order.flatMap((id): FieldColumn[] => {
      const column = byId.get(id);
      return column === undefined ? [] : [column];
    });
  }, [view, columns]);

  return { tableId, parsed, menuColumns, view, changed, toggle, move, reset };
};
