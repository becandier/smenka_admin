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

const authGet = async (path: string): Promise<any> => {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? 'Ошибка запроса');
  }
  return json?.data;
};

// Роль + список организаций пользователя для RBAC-гейтинга и OrgSwitcher.
export interface OrgPermission {
  id: string;
  name: string;
  my_role: string | null;
}
export interface Permissions {
  role: string;
  organizations: OrgPermission[];
}

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
    if (status === 401) {
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
    // 403 — нет прав на конкретное действие; не разлогиниваем.
  },

  getIdentity: async () => {
    const user = (await authGet('/users/me')) ?? {};
    return { id: user.id ?? '', fullName: user.name ?? user.email ?? '', role: user.role };
  },

  getPermissions: async (): Promise<Permissions | null> => {
    if (!getAccessToken()) return null;
    try {
      const me = await authGet('/users/me');
      const role: string = me?.role ?? 'user';
      let organizations: OrgPermission[] = [];
      try {
        const orgs = await authGet('/organizations');
        const items: any[] = orgs?.items ?? [];
        organizations = items.map((o) => ({ id: o.id, name: o.name, my_role: o.my_role ?? null }));
      } catch {
        organizations = [];
      }
      return { role, organizations };
    } catch {
      return null;
    }
  },
};
