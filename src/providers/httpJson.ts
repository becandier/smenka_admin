// Сырой POST JSON-запрос без авторизации: fetch + безопасный разбор ответа, без Bearer-заголовка
// (нужен для эндпоинтов, которые ходят без access-токена: login/oauth/refresh/logout — они
// аутентифицируются паролем/id-токеном/refresh-токеном в теле, не заголовком).
// Что считать ошибкой — решает вызывающий: authProvider.ts:post() бросает AuthError,
// tokenRefresh.ts:performRefresh() просто возвращает false. Здесь — общая точка, чтобы
// fetch + try/catch JSON.parse + сборка запроса не дублировались в обоих местах.
import { API_BASE_URL } from '../config';

export interface RawJsonResponse {
  ok: boolean;
  status: number;
  json: any;
}

export const postJsonRaw = async (path: string, body: unknown): Promise<RawJsonResponse> => {
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
  return { ok: res.ok, status: res.status, json };
};
