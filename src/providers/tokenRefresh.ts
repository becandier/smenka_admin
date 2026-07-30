// Общий транспортный слой авторизованных запросов: single-flight обновление access-токена +
// обёртка fetch, которая сама тихо ретраит один раз при 401.
//
// Используется из dataProvider.ts (request(), fetchPayrollExport()) и authProvider.ts
// (authGet()): все Bearer-запросы получают retry-after-refresh через fetchWithAuthRetry()
// вместо того, чтобы каждый хелпер писал token/заголовок/fetch/401-детект сам — так и
// накапливалось рассогласование (например, в одном месте пустой токен всё равно уходил в
// заголовок, в другом — нет), пока фикс не свёл это к одной реализации.
//
// Single-flight обязателен: бэкенд жёстко ротирует refresh-токен (revoke old / issue new),
// поэтому параллельные 401 обязаны ждать ОДИН и тот же вызов /auth/refresh, а не слать
// каждый свой (потенциально уже отозванный) refresh_token — см.
// docs/tasks/admin_token_refresh_bug/admin.md.
import { API_BASE_URL, getAccessToken, getRefreshToken, setTokens } from '../config';
import { postJsonRaw } from './httpJson';

const performRefresh = async (): Promise<boolean> => {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const { ok, json } = await postJsonRaw('/auth/refresh', { refresh_token: refresh });
    if (!ok || json?.error) return false;
    const data = json?.data;
    if (!data?.access_token || !data?.refresh_token) return false;
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    // Сеть недоступна — не трогаем токены, вызывающий код (checkError/getPermissions)
    // сам решает, что делать с исходной ошибкой.
    return false;
  }
};

let refreshInFlight: Promise<boolean> | null = null;

// true — токены обновлены (можно повторять исходный запрос), false — refresh
// невозможен/отклонён (мёртвая сессия, refresh-токен тоже протух или отозван).
//
// usedToken — access-токен, на котором вызывающий словил 401. Если к этому моменту
// getAccessToken() уже отличается от usedToken — значит, токен только что обновил другой
// параллельный вызов (single-flight ниже уже отработал и обнулился) и сетевой поход не
// нужен: можно сразу сказать «да, обновлён» и повторить исходный запрос с новым токеном.
// Без этой проверки «штормовые» пачки 401, пришедшие не строго одновременно, а с небольшим
// разбросом по времени, каждая заново бьёт по /auth/refresh, хотя токен уже свежий.
export const refreshTokens = (usedToken: string | null): Promise<boolean> => {
  if (usedToken !== getAccessToken()) return Promise.resolve(true);
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

// Bearer-запрос с тихим retry-after-refresh: при 401 один раз обновляет токен (single-flight
// выше) и повторяет ЭТОТ ЖЕ запрос. Content-Type/Accept и разбор тела ответа (JSON-конверт vs
// blob) — забота вызывающего; эта обёртка знает только про транспорт и авторизацию.
// retried — внутренний флаг одного повтора; вызывающий код его не передаёт.
export const fetchWithAuthRetry = async (
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> => {
  const token = getAccessToken();
  const headers = new Headers(options.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && !retried && (await refreshTokens(token))) {
    return fetchWithAuthRetry(path, options, true);
  }
  return res;
};
