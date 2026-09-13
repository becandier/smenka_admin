// Единая точка для отказа fetch (сеть недоступна, CORS-ответ без заголовков — например
// 500 без CORS до бэкенд-фикса, — обрыв соединения): браузер поднимает голый TypeError без
// кода и статуса ("Load failed" в Safari, "Failed to fetch" в Chrome). tokenRefresh.ts
// (fetchWithAuthRetry) перехватывает такой TypeError и поднимает HttpError с этими
// значениями, чтобы dataProvider.request()/fetchPayrollExport()/authProvider.authGet()
// (все три ходят через fetchWithAuthRetry) видели единообразный error.body.code, а экранные
// сообщения (weeklyRulesErrorMessage в resources/workSchedules.tsx, scheduleErrorMessage в
// utils/format.ts) показывали понятный текст вместо сырого текста рантайма. Отказ
// /auth/refresh не затрагивается — он уже обрабатывается отдельно в performRefresh()
// (tokenRefresh.ts).
//
// Модуль намеренно без импортов, в т.ч. без HttpError из 'react-admin': прямой импорт
// 'react-admin' в vitest падает при резолве ESM ("Directory import '.../@mui/material/styles'
// is not supported") — react-admin тянет ra-ui-materialui/MUI, а Node ESM-резолвер, которым
// vitest грузит внешние модули, не поддерживает такие directory-импорты (в отличие от
// Vite/rollup в реальной сборке). Поэтому маппинг код→текст и аргументы для HttpError вынесены
// сюда и тестируются напрямую, без самого класса HttpError.
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const NETWORK_ERROR_MESSAGE = 'Нет связи с сервером. Проверьте сеть и повторите попытку.';

export interface NetworkHttpErrorArgs {
  message: string;
  status: 0;
  body: { code: string; message: string };
}

// Аргументы для `new HttpError(...)`, которые fetchWithAuthRetry бросает при отказе fetch.
export const networkHttpErrorArgs = (): NetworkHttpErrorArgs => ({
  message: NETWORK_ERROR_MESSAGE,
  status: 0,
  body: { code: NETWORK_ERROR_CODE, message: NETWORK_ERROR_MESSAGE },
});

// Человекочитаемый текст для NETWORK_ERROR, иначе undefined — вызывающая сторона сама решает
// про остальные коды/фолбэк (generic "<fallback> (CODE)" в weeklyRulesErrorMessage,
// SCHEDULE_ERROR_MESSAGES/error.message в scheduleErrorMessage).
export const networkErrorMessage = (code: unknown): string | undefined =>
  code === NETWORK_ERROR_CODE ? NETWORK_ERROR_MESSAGE : undefined;
