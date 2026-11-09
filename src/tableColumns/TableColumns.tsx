import type { ReactNode } from 'react';
import {
  CreateButton,
  Datagrid,
  ExportButton,
  FilterButton,
  TopToolbar,
  useFilterContext,
  useListContext,
  useResourceDefinition,
  type DatagridProps,
} from 'react-admin';
import { ColumnsButton } from './ColumnsButton';
import { TableColumnsContext, useTableColumnsState } from './context';
import { arrangeFields, type ColumnField } from './fields';
import { useTableColumns } from './useTableColumns';

// Подключение настройки столбцов к спискам на <Datagrid> (table_column_settings/admin.md).
//
//   <TableColumns tableId="members" fields={[<TextField key="name" label="Имя" />, ...]}>
//     <List actions={<Actions />}>        // в Actions — <TableColumnsButton />
//       <ColumnsDatagrid rowClick="edit" />
//     </List>
//   </TableColumns>
//
// Столбцы объявляются один раз массивом полей (соглашение — fields.tsx) над <List>, чтобы
// кнопка работала и тогда, когда сама таблица не смонтирована (список пуст или грузится).

export const TableColumns = ({
  tableId,
  fields,
  children,
}: {
  tableId: string;
  fields: readonly ColumnField[];
  children: ReactNode;
}) => {
  const state = useTableColumns(tableId, fields);
  return <TableColumnsContext.Provider value={state}>{children}</TableColumnsContext.Provider>;
};

// <Datagrid> со столбцами в порядке и видимости из раскладки. Все пропсы — как у Datagrid.
export const ColumnsDatagrid = (props: Omit<DatagridProps, 'children'>) => {
  const state = useTableColumnsState();
  if (state === null) throw new Error('ColumnsDatagrid должен быть внутри <TableColumns>');
  return <Datagrid {...props}>{arrangeFields(state.parsed, state.view)}</Datagrid>;
};

// Кнопка «Столбцы» таблицы из ближайшего <TableColumns>.
export const TableColumnsButton = () => {
  const state = useTableColumnsState();
  if (state === null) return null;
  return (
    <ColumnsButton
      columns={state.menuColumns}
      hidden={state.view.hidden}
      changed={state.changed}
      onToggle={state.toggle}
      onMove={state.move}
      onReset={state.reset}
    />
  );
};

// Стандартная панель действий react-admin (ListActions 5.14: фильтры, создание, экспорт)
// плюс «Столбцы» последней справа — для списков, у которых своей панели не было.
export const ListActionsWithColumns = () => {
  const { exporter, total } = useListContext();
  const { hasCreate } = useResourceDefinition();
  const filters = useFilterContext();
  return (
    <TopToolbar>
      {filters && <FilterButton />}
      {hasCreate && <CreateButton />}
      {exporter !== false && <ExportButton disabled={total === 0} />}
      <TableColumnsButton />
    </TopToolbar>
  );
};
