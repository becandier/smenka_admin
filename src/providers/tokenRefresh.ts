// Single-flight обновление access-токена по refresh-токену.
//
// Используется из dataProvider.ts (request()) и authProvider.ts (authGet()): оба хелпера
// при 401 тихо обновляют токен и повторяют оригинальный запрос один раз — silent refresh
// не долетает до UI как ошибка (react-admin сам исходный запрос не ретраит).
//
// Вынесено в отдельный модуль, а не продублировано в обоих providers, по двум причинам:
//  - единая точка правды по контракту /auth/refresh;
//  - single-flight обязан быть ОДИН на всё приложение, а не по одному на каждый provider —
//    иначе dataProvider и authProvider завели бы себе по независимому in-flight Promise
//    и всё равно гонялись бы друг с другом за один и тот же (жёстко ротируемый бэком)
//    refresh_token, что и было корнем бага №2.
import { API_BASE_URL, getRefreshToken, setTokens } from '../config';

let refreshInFlight: Promise<boolean> | null = null;

const performRefresh = async (): Promise<boolean> => {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    // Сеть недоступна — не трогаем токены, вызывающий код (checkError/getPermissions)
    // сам решает, что делать с исходной ошибкой.
    return false;
  }
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) return false;
  const data = json?.data;
  if (!data?.access_token || !data?.refresh_token) return false;
  setTokens(data.access_token, data.refresh_token);
  return true;
};

// true — токены обновлены (можно повторять исходный запрос), false — refresh
// невозможен/отклонён (мёртвая сессия, refresh-токен тоже протух или отозван).
// Параллельные вызовы, пришедшие пока предыдущий рефреш ещё в полёте, переиспользуют
// тот же Promise вместо того, чтобы каждый слал на /auth/refresh свой (потенциально
// уже отозванный победителем гонки) refresh_token.
export const refreshTokens = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};
