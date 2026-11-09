import { useEffect, useState, type ReactNode } from 'react';
import { useDataProvider, useGetIdentity, useNotify, type DataProvider } from 'react-admin';
import { TableLayoutStore, type LocalStorageLike, type PreferencesApi } from './store';
import { TableLayoutStoreContext } from './context';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить вид таблицы';

const browserStorage = (): LocalStorageLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Методы /users/me/preferences — кастомные методы dataProvider (providers/dataProvider.ts).
const preferencesApi = (dataProvider: DataProvider): PreferencesApi => ({
  load: (prefix) => dataProvider.getPreferences(prefix),
  save: (key, value) => dataProvider.putPreference(key, value),
  remove: (key) => dataProvider.deletePreference(key),
});

// Раскладки столбцов текущего пользователя на всю сессию админки. Монтируется в Layout
// (внутри <Admin>: есть dataProvider, authProvider и уведомления). Пользователь — из
// getIdentity; пока он неизвестен, таблицы в стандартном виде.
export const TableLayoutProvider = ({ children }: { children: ReactNode }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { identity } = useGetIdentity();

  const [store] = useState(
    () =>
      new TableLayoutStore({
        api: preferencesApi(dataProvider),
        storage: browserStorage(),
        onSaveError: () => notify(SAVE_ERROR_MESSAGE, { type: 'error' }),
      }),
  );

  useEffect(() => {
    store.connect(preferencesApi(dataProvider), () =>
      notify(SAVE_ERROR_MESSAGE, { type: 'error' }),
    );
  }, [store, dataProvider, notify]);

  const userId = identity?.id;
  useEffect(() => {
    store.setUser(userId === undefined || userId === '' ? null : String(userId));
  }, [store, userId]);

  useEffect(() => () => store.dispose(), [store]);

  return (
    <TableLayoutStoreContext.Provider value={store}>{children}</TableLayoutStoreContext.Provider>
  );
};
