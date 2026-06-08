// Единственное место с базовым URL и хранением токенов.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

const ACCESS_KEY = 'smenka_admin_access_token';
const REFRESH_KEY = 'smenka_admin_refresh_token';

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_KEY);

export const setTokens = (access: string, refresh: string): void => {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};
