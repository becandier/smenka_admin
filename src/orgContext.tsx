import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { type CurrentOrg, getCurrentOrg, setCurrentOrg as persist } from './config';

interface OrgContextValue {
  org: CurrentOrg | null;
  selectOrg: (org: CurrentOrg | null) => void;
}

const OrgContext = createContext<OrgContextValue>({ org: null, selectOrg: () => {} });

// Хранит выбранную организацию org-кабинета в React-состоянии (синхронно с localStorage,
// откуда её читает dataProvider). Меню и OrgSwitcher перерисовываются при смене.
export const OrgProvider = ({ children }: { children: ReactNode }) => {
  const [org, setOrg] = useState<CurrentOrg | null>(() => getCurrentOrg());

  const selectOrg = useCallback((next: CurrentOrg | null) => {
    persist(next);
    setOrg(next);
  }, []);

  return <OrgContext.Provider value={{ org, selectOrg }}>{children}</OrgContext.Provider>;
};

export const useCurrentOrg = (): OrgContextValue => useContext(OrgContext);
