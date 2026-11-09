import { createContext, useContext } from 'react';
import type { TableLayoutStore } from './store';
import type { FieldColumn, ParsedFields } from './fields';
import type { LayoutView } from './layout';

// Хранилище раскладок текущего пользователя (одно на сессию, см. TableLayoutProvider).
export const TableLayoutStoreContext = createContext<TableLayoutStore | null>(null);

export const useTableLayoutStore = (): TableLayoutStore | null =>
  useContext(TableLayoutStoreContext);

// Состояние столбцов одной таблицы: общее для кнопки «Столбцы» и самой таблицы.
export interface TableColumnsState {
  tableId: string;
  parsed: ParsedFields;
  // Настраиваемые доступные столбцы в текущем порядке, ключевой первым.
  menuColumns: FieldColumn[];
  view: LayoutView;
  changed: boolean;
  toggle: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  reset: () => void;
}

export const TableColumnsContext = createContext<TableColumnsState | null>(null);

export const useTableColumnsState = (): TableColumnsState | null => useContext(TableColumnsContext);
