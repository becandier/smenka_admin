import { AuthProvider } from 'react-admin';
import {
  API_BASE_URL,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from '../config';

const post = async (path: string, body: unknown): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? 'Ошибка авторизации');
  }
  return json?.data;
};

export const authProvider: AuthProvider = {
  // react-admin шлёт username/password; маппим username → email.
  login: async ({ username, password }) => {
    const data = await post('/auth/login', { email: username, password });
    setTokens(data.access_token, data.refresh_token);
  },

  logout: async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await post('/auth/logout', { refresh_token: refresh });
      } catch {
        // выход локально даже если бэк недоступен
      }
    }
    clearTokens();
  },

  checkAuth: async () => {
    if (!getAccessToken()) throw new Error('Не авторизован');
  },

  checkError: async (error) => {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      const refresh = getRefreshToken();
      if (refresh) {
        try {
          const data = await post('/auth/refresh', { refresh_token: refresh });
          setTokens(data.access_token, data.refresh_token);
          return;
        } catch {
          // refresh не удался — разлогиниваем
        }
      }
      clearTokens();
      throw new Error('Сессия истекла');
    }
  },

  getIdentity: async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
    });
    const json = await res.json();
    const user = json?.data ?? {};
    return { id: user.id, fullName: user.name ?? user.email, role: user.role };
  },

  getPermissions: async () => {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const json = await res.json();
      return json?.data?.role ?? null;
    } catch {
      return null;
    }
  },
};
