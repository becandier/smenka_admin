import { AuthProvider } from 'react-admin';
import { API_BASE_URL, getAccessToken, getRefreshToken, setTokens, clearTokens } from '../config';

// Ошибка авторизации с сохранённым кодом контракта (для маппинга по error.code).
interface AuthError extends Error {
  code?: string;
}

const post = async (path: string, body: unknown): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    const err: AuthError = new Error(json?.error?.message ?? 'Ошибка авторизации');
    err.code = json?.error?.code;
    throw err;
  }
  return json?.data;
};

// Сообщение для формы входа по error.code (контракт security_hardening).
// react-admin показывает message отклонённого login как нотификацию.
const loginErrorMessage = (error: unknown): string => {
  // Явный type-guard вместо приведения: код берём только у объекта с полем code.
  const code =
    error && typeof error === 'object' && 'code' in error ? (error as AuthError).code : undefined;
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return 'Слишком много попыток входа, попробуйте позже';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Слишком много запросов, подождите';
    default:
      return (error as Error)?.message ?? 'Ошибка авторизации';
  }
};

const authGet = async (path: string): Promise<any> => {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
  });
  let json: any;
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
    let data: any;
    try {
      data = await post('/auth/login', { email: username, password });
    } catch (error) {
      // 423 ACCOUNT_LOCKED / 429 RATE_LIMIT_EXCEEDED → понятная нотификация по коду.
      // Переписываем message исходной ошибки и пробрасываем её же (сохраняем причину).
      if (error instanceof Error) error.message = loginErrorMessage(error);
      throw error;
    }
    // Контракт {data,error}: при успехе data с токенами обязателен; страхуемся от нарушения.
    if (!data?.access_token || !data?.refresh_token) {
      throw new Error('Ошибка авторизации: сервер не вернул токены');
    }
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

  checkAuth: () =>
    getAccessToken() ? Promise.resolve() : Promise.reject(new Error('Не авторизован')),

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
