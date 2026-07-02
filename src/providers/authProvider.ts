import { AuthProvider } from 'react-admin';
import { API_BASE_URL, getAccessToken, getRefreshToken, setTokens, clearTokens } from '../config';

// Ошибка авторизации с сохранённым кодом контракта (для маппинга по error.code)
// и HTTP-статусом (checkError отличает 401-сессию от 5xx/сети именно по status).
interface AuthError extends Error {
  code?: string;
  status?: number;
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

// GET без авторизации (нужен до входа — конфиг OAuth-кнопок на LoginPage).
const publicGet = async (path: string): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    // code/status сохраняем по тому же контракту, что post/authGet — на случай, если
    // ошибку этого хелпера когда-нибудь начнут разбирать по error.code, а не глотать.
    const err: AuthError = new Error(json?.error?.message ?? 'Ошибка запроса');
    err.code = json?.error?.code;
    err.status = res.status;
    throw err;
  }
  return json?.data;
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
    // Сохраняем HTTP-статус и error.code: по ним checkError/getPermissions отличают
    // 401 (мёртвая сессия) от 5xx/сети. Раньше status терялся и 401 «глотался».
    const err: AuthError = new Error(json?.error?.message ?? 'Ошибка запроса');
    err.code = json?.error?.code;
    err.status = res.status;
    throw err;
  }
  return json?.data;
};

// Конфигурация OAuth-провайдера для web (oauth_login): показывать кнопку и с каким
// Client ID/Services ID инициализировать SDK. null — провайдер не настроен супер-админом.
export interface OauthProviderConfig {
  client_id: string;
  enabled: boolean;
}
export interface OauthConfig {
  google: OauthProviderConfig | null;
  apple: OauthProviderConfig | null;
}

// GET /auth/oauth/config?client_type=web — public, дергается на LoginPage до рендера кнопок.
export const getOauthConfig = async (): Promise<OauthConfig> => {
  const data = await publicGet('/auth/oauth/config?client_type=web');
  return { google: data?.google ?? null, apple: data?.apple ?? null };
};

// Параметры входа: пароль ИЛИ OAuth (id-токен, полученный на LoginPage от Google/Apple SDK).
// useLogin() передаёт params как есть в authProvider.login — переиспользуем его для обеих веток
// (редирект/инвалидация кэша после входа отрабатывают одинаково).
export type LoginParams =
  | { username: string; password: string }
  | { oauthProvider: 'google'; idToken: string }
  | { oauthProvider: 'apple'; identityToken: string; email?: string; name?: string };

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

// Обновление access по refresh-токену. true — токены обновлены, false — refresh
// невозможен/отклонён (мёртвая сессия). Единый источник логики для checkError и getPermissions.
const tryRefresh = async (): Promise<boolean> => {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const data = await post('/auth/refresh', { refresh_token: refresh });
    if (!data?.access_token || !data?.refresh_token) return false;
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
};

// Загрузка роли + организаций пользователя. Ошибку /users/me НЕ глотает (её обработка —
// в getPermissions). Сбой под-запроса /organizations деградирует до пустого списка:
// роль уже получена, OrgSwitcher просто будет пуст.
const loadPermissions = async (): Promise<Permissions> => {
  const me = await authGet('/users/me');
  const role: string = me?.role ?? 'user';
  let organizations: OrgPermission[];
  try {
    const orgs = await authGet('/organizations');
    const items: any[] = orgs?.items ?? [];
    organizations = items.map((o) => ({ id: o.id, name: o.name, my_role: o.my_role ?? null }));
  } catch {
    organizations = [];
  }
  return { role, organizations };
};

export const authProvider: AuthProvider = {
  login: async (params: LoginParams) => {
    let data: any;
    try {
      if (!('oauthProvider' in params)) {
        // react-admin шлёт username/password; маппим username → email.
        data = await post('/auth/login', { email: params.username, password: params.password });
      } else if (params.oauthProvider === 'google') {
        data = await post('/auth/oauth/google', { id_token: params.idToken, client_type: 'web' });
      } else {
        data = await post('/auth/oauth/apple', {
          identity_token: params.identityToken,
          client_type: 'web',
          email: params.email,
          name: params.name,
        });
      }
    } catch (error) {
      // 423 ACCOUNT_LOCKED / 429 RATE_LIMIT_EXCEEDED (пароль) и коды oauth_login
      // (INVALID_OAUTH_TOKEN и т.д., для них достаточно message) → понятная нотификация.
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
      if (await tryRefresh()) return;
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
      return await loadPermissions();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      // Сеть/5xx (нет статуса или не 401): сессию не трогаем — пробрасываем ошибку.
      // usePermissions → logoutIfAccessDenied → checkError; checkError на не-401 резолвится,
      // ложного логаута нет, а Dashboard покажет ошибку вместо вечного спиннера.
      if (status !== 401) throw error;
      // Протухший access (401 INVALID_TOKEN): пробуем refresh и повторяем запрос.
      if (await tryRefresh()) return await loadPermissions();
      // Мёртвая сессия (refresh тоже отклонён): чистим токены и пробрасываем 401 →
      // usePermissions → logoutIfAccessDenied → checkError → logout + redirect /login.
      clearTokens();
      throw error;
    }
  },
};
