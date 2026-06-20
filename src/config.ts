// Единственное место с базовым URL и хранением токенов/текущей организации.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

// Яндекс.Карты (карта-пикер на форме рабочих точек). Ключ задаётся при сборке Vite;
// если он пуст — карта не подключается, форма работает в ручном режиме (ввод координат).
const yandexMapsApiKey = (import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? '').trim();
export const YANDEX_MAPS_SCRIPT_URL = yandexMapsApiKey
  ? `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(yandexMapsApiKey)}&lang=ru_RU`
  : null;

const ACCESS_KEY = 'smenka_admin_access_token';
const REFRESH_KEY = 'smenka_admin_refresh_token';
const ORG_KEY = 'smenka_admin_current_org';

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_KEY);

export const setTokens = (access: string, refresh: string): void => {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ORG_KEY);
};

// Текущая организация org-кабинета (выбирается OrgSwitcher'ом / при «Открыть кабинет»).
export interface CurrentOrg {
  id: string;
  name: string;
}

export const getCurrentOrg = (): CurrentOrg | null => {
  const raw = localStorage.getItem(ORG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CurrentOrg;
    return parsed.id ? parsed : null;
  } catch {
    return null;
  }
};

export const getCurrentOrgId = (): string | null => getCurrentOrg()?.id ?? null;

export const setCurrentOrg = (org: CurrentOrg | null): void => {
  if (org && org.id) localStorage.setItem(ORG_KEY, JSON.stringify(org));
  else localStorage.removeItem(ORG_KEY);
};
