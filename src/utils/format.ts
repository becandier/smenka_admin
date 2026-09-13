import { HttpError } from 'react-admin';
import type { PaymentKind, PaymentStatus } from '../subscription/billingTypes';
import { networkErrorMessage } from './networkError';
import {
  deviceTime,
  formatDate as formatDateInContext,
  formatDateTime as formatDateTimeInContext,
  organizationTime,
} from './time';

// Форматирование рабочего времени из секунд в «Чч Ммин».
export const formatDuration = (seconds: number | null | undefined): string => {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0 && minutes === 0) return '0 мин';
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  return parts.join(' ');
};

// Дата-время ISO → локальная строка ru-RU (для вложенных полей вне DateField).
export const formatDateTime = (value: string | null | undefined): string => {
  return formatDateTimeInContext(value, deviceTime());
};

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  employee: 'Сотрудник',
};

// Системная роль участника. null/неизвестно (исключён из org / персональный контекст) → «—».
export const memberRoleLabel = (role: string | null | undefined): string =>
  (role && MEMBER_ROLE_LABELS[role]) || '—';

// Choices для SelectInput/SelectField — единый источник с MEMBER_ROLE_LABELS.
export const MEMBER_ROLE_CHOICES = Object.entries(MEMBER_ROLE_LABELS).map(([id, name]) => ({
  id,
  name,
}));

export const SHIFT_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  paused: 'На паузе',
  finished: 'Завершена',
};

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  pending: 'Не заполнен',
  completed: 'Заполнен',
  incomplete: 'Не завершён',
};

export const shiftStatusLabel = (status: string | null | undefined): string =>
  (status && SHIFT_STATUS_LABELS[status]) || status || '—';

// Дата без времени: ISO → «01.03.2026».
export const formatDate = (value: string | null | undefined): string => {
  return formatDateInContext(value, deviceTime());
};

// --- Деньги (payroll): хранение в копейках, отображение в рублях ---

// Копейки → число рублей строкой; копейки показываем, только когда они есть.
export const formatRubles = (minor: number): string => {
  const digits = minor % 100 === 0 ? 0 : 2;
  return (minor / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const formatMoneyMinor = (minor: number | null | undefined): string =>
  minor === null || minor === undefined ? '—' : `${formatRubles(minor)} ₽`;

// Знаковая сумма со «+» перед положительным значением (manual_time_entry, payroll_adjustments):
// formatRubles уже отдаёт «-» для отрицательных через toLocaleString, «+» дописываем сами.
export const formatSignedMoneyMinor = (minor: number): string =>
  minor > 0 ? `+${formatMoneyMinor(minor)}` : formatMoneyMinor(minor);

// Ввод суммы в рублях → копейки; максимум 2 знака после запятой. По умолчанию — целое > 0
// (зарплатные ставки, штрафы, начисления — везде ноль бессмыслен). `allowZero: true` — для
// разовых мест, где 0 — валидное значение по контракту бэка (ExtendDialog: amount_minor >= 0,
// бесплатное продление подписки).
export const parseRublesToMinor = (
  raw: string,
  options?: { allowZero?: boolean },
): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  if (minor === 0) return options?.allowZero ? 0 : null;
  return minor > 0 ? minor : null;
};

// Отработанное время в денежных отчётах: «чч:мм» (ТЗ payroll).
export const formatClockDuration = (seconds: number | null | undefined): string => {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
};

// --- Ставки сотрудника ---

const RATE_TYPE_UNITS: Record<string, string> = {
  hourly: '₽/час',
  per_shift: '₽/смена',
};

export const RATE_TYPE_LABELS: Record<string, string> = {
  hourly: 'За час',
  per_shift: 'За смену',
};

export const RATE_TYPE_CHOICES = Object.entries(RATE_TYPE_LABELS).map(([id, name]) => ({
  id,
  name,
}));

export interface CurrentRate {
  rate_amount_minor: number;
  rate_type: string;
  currency: string;
  effective_from: string;
}

// Бейдж ставки: «180 ₽/час, с 01.03.2026».
export const formatRateBadge = (rate: CurrentRate | null | undefined): string => {
  if (!rate) return 'Ставка не задана';
  const unit = RATE_TYPE_UNITS[rate.rate_type] ?? rate.rate_type;
  return `${formatRubles(rate.rate_amount_minor)} ${unit}, с ${formatDate(rate.effective_from)}`;
};

export const checklistStatusLabel = (status: string | null | undefined): string =>
  (status && CHECKLIST_STATUS_LABELS[status]) || status || '—';

// Расширенные метки статуса для реестра экземпляров (checklist_reports, `/checklist-instances`):
// incomplete поясняет причину («смена закрыта»). Отдельная карта, а не правка
// CHECKLIST_STATUS_LABELS — секция чек-листов внутри детали смены (orgShifts.tsx) не меняется
// (admin.md, «Прочее на странице»), а она использует общий checklistStatusLabel.
export const CHECKLIST_REPORT_STATUS_LABELS: Record<string, string> = {
  ...CHECKLIST_STATUS_LABELS,
  incomplete: 'Не заполнен (смена закрыта)',
};

export const checklistReportStatusLabel = (status: string | null | undefined): string =>
  (status && CHECKLIST_REPORT_STATUS_LABELS[status]) || status || '—';

// --- Фото к пунктам чек-листов (checklist_photos) ---

// Требование к фото на пункте шаблона (enum PhotoRequirement). Дефолт none.
export const PHOTO_REQUIREMENT_LABELS: Record<string, string> = {
  none: 'Нет',
  optional: 'Опционально',
  required: 'Обязательно',
};

// Короткий текст для чипа-индикатора в превью пунктов («Фото: опц./обяз.»).
export const PHOTO_REQUIREMENT_SHORT: Record<string, string> = {
  none: 'нет',
  optional: 'опц.',
  required: 'обяз.',
};

export const PHOTO_REQUIREMENT_CHOICES = Object.entries(PHOTO_REQUIREMENT_LABELS).map(
  ([id, name]) => ({ id, name }),
);

// Источник фото (enum PhotoSource). Дефолт camera. Только подсказка мобильному UI.
export const PHOTO_SOURCE_LABELS: Record<string, string> = {
  camera: 'Только камера',
  camera_or_gallery: 'Камера или галерея',
};

export const PHOTO_SOURCE_CHOICES = Object.entries(PHOTO_SOURCE_LABELS).map(([id, name]) => ({
  id,
  name,
}));

// Метка момента/места на фото: camera — реальная съёмка («Снято»); camera_or_gallery —
// фото могло быть выбрано из галереи, тогда метка = момент добавления («Добавлено»).
export const photoCaptureLabel = (source: string | null | undefined): string =>
  source === 'camera_or_gallery' ? 'Добавлено' : 'Снято';

// --- Привязка чек-листов к точкам (checklist_work_location) ---

// Код ошибки бэка → понятный текст для админа (docs/tasks/checklist_work_location/admin.md,
// раздел «Обработка ошибок»). Не экспортируется — наружу отдаём только helper ниже; тот же
// приём, что knowledgeErrorMessage в src/resources/knowledge/hooks.ts и errorMessage в
// src/resources/payroll/index.tsx.
const CHECKLIST_LOCATION_ERROR_MESSAGES: Record<string, string> = {
  INVALID_LOCATION: 'Точка не найдена в этой организации',
  INVALID_TEMPLATE: 'Чек-лист не найден в этой организации',
  WORK_LOCATION_NOT_FOUND: 'Точка не найдена',
  TEMPLATE_NOT_FOUND: 'Чек-лист не найден',
};

// Человекочитаемый текст по error.code; фолбэк — message ошибки либо переданный текст
// (message из конверта {data,error} уже человекочитаем по ERROR_FORMAT.md).
export const checklistLocationErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && CHECKLIST_LOCATION_ERROR_MESSAGES[code])
    return CHECKLIST_LOCATION_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// Русское склонение «N чек-лист/чек-листа/чек-листов» — для текста предупреждения при удалении
// точки, к которой привязаны чек-листы.
export const pluralizeChecklists = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'чек-лист';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'чек-листа';
  return 'чек-листов';
};

// --- Графики работы (work_schedules) ---

// Диапазон «HH:MM – HH:MM», с пометкой «через полночь» для ночных графиков (crosses_midnight).
export const formatScheduleTimeRange = (
  start_time: string,
  end_time: string,
  crosses_midnight: boolean,
): string =>
  crosses_midnight ? `${start_time} – ${end_time} (через полночь)` : `${start_time} – ${end_time}`;

// Результат клиентского расчёта длительности графика по двум полям времени (живая подсказка
// под полями формы, backend.md R2 — та же арифметика, что и на сервере, без учёта DST:
// клиенту DST не нужен, это лишь предпросмотр «сколько часов», сервер посчитает точно).
export interface ScheduleDurationInfo {
  minutes: number;
  crossesMidnight: boolean;
}

// null — время не заполнено или начало равно концу (невалидно, см. SCHEDULE_INVALID_TIME).
export const computeScheduleDuration = (
  start: string | null | undefined,
  end: string | null | undefined,
): ScheduleDurationInfo | null => {
  if (!start || !end) return null;
  const startMatch = /^(\d{2}):(\d{2})$/.exec(start);
  const endMatch = /^(\d{2}):(\d{2})$/.exec(end);
  if (!startMatch || !endMatch) return null;
  const startMin = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMin = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (startMin === endMin) return null;
  const crossesMidnight = endMin < startMin;
  const minutes = crossesMidnight ? 24 * 60 - startMin + endMin : endMin - startMin;
  return { minutes, crossesMidnight };
};

// Живой текст подсказки под полями времени формы графика (admin.md, «Создание/редактирование»).
export const scheduleDurationHint = (
  info: ScheduleDurationInfo,
  start: string,
  end: string,
): string =>
  info.crossesMidnight
    ? `Ночная смена: ${start} → ${end} следующего дня, ${formatDuration(info.minutes * 60)}`
    : `Смена длится ${formatDuration(info.minutes * 60)}`;

// Код ошибки бэка (work_schedules/backend.md) → понятный текст. Тот же приём, что
// checklistLocationErrorMessage.
const SCHEDULE_ERROR_MESSAGES: Record<string, string> = {
  SCHEDULE_NOT_FOUND: 'График не найден',
  SCHEDULE_INVALID_TIME: 'Время начала и конца не должны совпадать',
  SCHEDULE_NOT_AVAILABLE: 'График недоступен этому сотруднику',
  SCHEDULE_REQUIRED: 'Сотруднику нужно выбрать график',
  SCHEDULE_REQUIRED_NO_SCHEDULES: 'В организации нет ни одного активного графика',
  ROLE_NOT_FOUND: 'Роль не найдена в этой организации',
  WORK_LOCATION_NOT_FOUND: 'Точка не найдена',
  INVALID_TIMEZONE: 'Неизвестный часовой пояс',
};

export const scheduleErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  const network = networkErrorMessage(code);
  if (network) return network;
  if (code && SCHEDULE_ERROR_MESSAGES[code]) return SCHEDULE_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// --- Переработки (shift_overtime_requests) ---

export const OVERTIME_STATUS_LABELS: Record<string, string> = {
  pending: 'на согласовании',
  approved: 'согласовано',
  rejected: 'отклонено',
};

export const overtimeStatusLabel = (status: string | null | undefined): string =>
  (status && OVERTIME_STATUS_LABELS[status]) || status || '—';

export const OVERTIME_STATUS_CHOICES = Object.entries({
  pending: 'На согласовании',
  approved: 'Согласовано',
  rejected: 'Отклонено',
}).map(([id, name]) => ({ id, name }));

// Причина завершения смены (finish_reason, work_schedules R4): null — активна/старая смена.
export const FINISH_REASON_LABELS: Record<string, string> = {
  manual: 'Завершена вручную',
  auto_schedule: 'Завершена автоматически по графику',
};

export const finishReasonLabel = (reason: string | null | undefined): string =>
  (reason && FINISH_REASON_LABELS[reason]) || '—';

// Дата-время ISO → строка в конкретной IANA-таймзоне (плановое окно смены — «по этому времени
// считаются графики», admin.md §3). Фолбэк на локальную таймзону браузера при некорректной зоне.
export const formatDateTimeInTz = (value: string | null | undefined, tz: string): string => {
  return formatDateTimeInContext(value, organizationTime(tz));
};

// --- Тестирование сотрудников (employee_tests) ---

// Текстовое значение формы (react-hook-form хранит поле как unknown) — только если это
// действительно строка; иначе '' (без риска словить [object Object] через String(obj)).
// Общий хелпер для dataProvider (buildTestTemplateBody) и клиентской валидации
// (validateTestTemplate) — раньше дублировался в обоих местах с чуть разным поведением.
export const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value : '');

// Код ошибки бэка (employee_tests/backend.md) → понятный текст. Тот же приём, что
// scheduleErrorMessage/checklistLocationErrorMessage. TEST_TEMPLATE_INVALID сюда намеренно
// не включён: у него нет фиксированного текста (message описывает конкретный вопрос),
// поэтому для него используется фолбэк — уже человекочитаемый error.message с бэка.
// TEST_ASSIGNMENT_NOT_FOUND — текст завязан на снятие назначения (test_assignment_unassign/
// admin.md, «Ошибки»): DELETE повторно на уже снятое назначение — единственный практический
// источник этого кода в админке (карточка деталей не делает getOne по test-assignments).
// TEST_ASSIGNMENT_HAS_ATTEMPTS сюда больше не входит: бэкенд этот код никогда не отдаёт
// (test_assignment_unassign/backend.md, «убрать проверку attempts_used > 0») — DELETE снимает
// назначение при любых attempts_used/статусе.
const TEST_ERROR_MESSAGES: Record<string, string> = {
  TEST_TEMPLATE_NOT_FOUND: 'Тест не найден',
  TEST_TEMPLATE_DELETED: 'Тест удалён — восстановите его, чтобы редактировать',
  TEST_ASSIGNMENT_NOT_FOUND: 'Назначение уже снято',
  TEST_ATTEMPT_NOT_FOUND: 'Попытка не найдена',
  MEMBER_NOT_FOUND: 'Сотрудник не найден в организации',
};

export const testErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && TEST_ERROR_MESSAGES[code]) return TEST_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// Строка уже устарела (назначение снято кем-то ещё/в другой вкладке) — вызывающий код должен
// освежить список так же, как после собственного успешного снятия (admin.md, «Ошибки»).
export const isTestAssignmentNotFoundError = (error: unknown): boolean =>
  error instanceof HttpError && error.body?.code === 'TEST_ASSIGNMENT_NOT_FOUND';

// Русское склонение «N попытка/попытки/попыток» — текст подтверждения снятия назначения
// с результатами (test_assignment_unassign/admin.md, «Диалог подтверждения»).
export const pluralizeAttempts = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'попытка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'попытки';
  return 'попыток';
};

// Русское склонение «N назначение/назначения/назначений» — сводка массового снятия.
export const pluralizeAssignments = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'назначение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'назначения';
  return 'назначений';
};

export const TEST_ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: 'Назначен',
  in_progress: 'Проходит',
  passed: 'Сдан',
  failed: 'Не сдан',
};

export const testAssignmentStatusLabel = (status: string | null | undefined): string =>
  (status && TEST_ASSIGNMENT_STATUS_LABELS[status]) || status || '—';

export const TEST_ASSIGNMENT_STATUS_CHOICES = Object.entries(TEST_ASSIGNMENT_STATUS_LABELS).map(
  ([id, name]) => ({ id, name }),
);

export const TEST_ASSIGNMENT_STATUS_COLOR: Record<
  string,
  'default' | 'info' | 'success' | 'error'
> = {
  assigned: 'default',
  in_progress: 'info',
  passed: 'success',
  failed: 'error',
};

// --- Ручной учёт времени и начисления (manual_time_entry) ---

// Код ошибки бэка (manual_time_entry/backend.md «Новые коды ошибок» + переиспользуемые) →
// понятный текст. Тот же приём, что scheduleErrorMessage/checklistLocationErrorMessage.
const MANUAL_SHIFT_ERROR_MESSAGES: Record<string, string> = {
  SHIFT_OVERLAP: 'У сотрудника уже есть смена в это время',
  MEMBER_NOT_FOUND: 'Сотрудник не найден в организации',
  SHIFT_NOT_FOUND: 'Смена не найдена',
  WORK_LOCATION_NOT_FOUND: 'Точка не найдена',
  SCHEDULE_NOT_FOUND: 'График не найден',
  ORG_NOT_FOUND: 'Организация не найдена',
  FORBIDDEN: 'Нет прав на это действие',
};

export const manualShiftErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && MANUAL_SHIFT_ERROR_MESSAGES[code]) return MANUAL_SHIFT_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// Отдельный текст для SHIFT_OVERLAP при восстановлении удалённой смены (admin.md §3.1):
// та же ошибка, что и при создании/правке, но причина другая — за время «удалённости»
// на этот интервал завели другую смену.
export const restoreErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code === 'SHIFT_OVERLAP') return 'На это время уже заведена другая смена';
  return manualShiftErrorMessage(error, fallback);
};

const ADJUSTMENT_ERROR_MESSAGES: Record<string, string> = {
  ADJUSTMENT_NOT_FOUND: 'Начисление не найдено или уже отменено',
  MEMBER_NOT_FOUND: 'Сотрудник не найден в организации',
  SHIFT_NOT_FOUND: 'Смена не найдена или не принадлежит этому сотруднику',
  ORG_NOT_FOUND: 'Организация не найдена',
  FORBIDDEN: 'Нет прав на это действие',
};

export const adjustmentErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && ADJUSTMENT_ERROR_MESSAGES[code]) return ADJUSTMENT_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// Тип ручного начисления по знаку суммы (payroll_adjustments: сервер знает только сумму,
// UI-концепция «доплата/удержание» — только на клиенте, backend.md «Калькулятор часов»).
export const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  credit: 'Доплата',
  debit: 'Удержание',
};

export const ADJUSTMENT_TYPE_CHOICES = [
  { id: 'all', name: 'Все' },
  ...Object.entries(ADJUSTMENT_TYPE_LABELS).map(([id, name]) => ({ id, name })),
];

export const adjustmentTypeOf = (amountMinor: number): 'credit' | 'debit' =>
  amountMinor >= 0 ? 'credit' : 'debit';

// --- Старт смены без геопроверки (shift_geo_photo_fallback) ---

// Машинные коды гео-ошибок клиента (контракт мобилки ↔ бэка, shift_geo_photo_fallback/
// backend.md): бэк хранит и отдаёт их как есть в ShiftResponse.geo_fallback_reason.
// Набор фиксирован — держим единым словарём, чтобы коды не расползались строками по экранам.
export const GEO_FALLBACK_REASON_LABELS: Record<string, string> = {
  GEO_PERMISSION_DENIED: 'Доступ к геолокации отклонён',
  GEO_PERMISSION_DENIED_FOREVER: 'Доступ к геолокации заблокирован (браузер/ОС)',
  GEO_SERVICE_DISABLED: 'Служба геолокации на устройстве выключена',
  GEO_UNAVAILABLE: 'Не удалось определить геопозицию',
  GEO_UNSUPPORTED: 'Браузер не поддерживает геолокацию',
  GEO_INSECURE_CONTEXT: 'Небезопасное соединение (не HTTPS)',
};

// Причина гео-сбоя → человекочитаемый текст. Неизвестный код (мобилка добавила новый раньше
// админки) показываем как есть — так админ хотя бы видит факт и может его сообщить.
export const geoFallbackReasonLabel = (reason: string | null | undefined): string =>
  (reason && GEO_FALLBACK_REASON_LABELS[reason]) || reason || '—';

// Точка смены: денормализованный work_location { name, address } | null (backend.md).
export const workLocationLabel = (
  wl: { name?: string | null; address?: string | null } | null | undefined,
): string => {
  if (!wl) return '—';
  const name = wl.name ?? '—';
  return wl.address ? `${name} · ${wl.address}` : name;
};

// --- Тарифы и подписки (tariffs) ---

// Эффективный статус подписки (backend.md, «Эффективный статус — производная»): пять значений,
// БД хранит только trialing/active/canceled, past_due/suspended вычисляются на бэке.
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: 'Пробный период',
  active: 'Активна',
  past_due: 'Просрочена',
  suspended: 'Приостановлена',
  canceled: 'Отменена',
};

export const subscriptionStatusLabel = (status: string | null | undefined): string =>
  (status && SUBSCRIPTION_STATUS_LABELS[status]) || status || '—';

// Цвета чипов статуса (admin.md, «Список»): trialing — info, active — success,
// past_due — warning, suspended/canceled — error.
export const SUBSCRIPTION_STATUS_COLOR: Record<
  string,
  'info' | 'success' | 'warning' | 'error' | 'default'
> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'error',
  canceled: 'error',
};

export const SUBSCRIPTION_STATUS_CHOICES = Object.entries(SUBSCRIPTION_STATUS_LABELS).map(
  ([id, name]) => ({ id, name }),
);

// Ручные статусы (для формы «Изменить», PATCH .../subscription: только trialing/active/canceled —
// past_due/suspended нельзя проставить руками, это производные, backend.md п.5).
export const SUBSCRIPTION_MANUAL_STATUS_CHOICES = ['trialing', 'active', 'canceled'].map((id) => ({
  id,
  name: SUBSCRIPTION_STATUS_LABELS[id],
}));

// code плана (справочник `plans`, backend.md): названия — фолбэк, если GET /plans почему-то
// недоступен в конкретном месте экрана; там, где план приходит с бэка целиком — используем
// его собственное поле name, а не эту карту.
export const PLAN_CODE_LABELS: Record<string, string> = {
  standard: 'Стандарт',
  premium: 'Премиум',
};

export const planCodeLabel = (code: string | null | undefined): string =>
  (code && PLAN_CODE_LABELS[code]) || code || '—';

// Русское склонение «N день/дня/дней» — «осталось N дней» (admin.md, экран «Тариф» и реестр).
export const pluralizeDays = (n: number): string => {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
};

// «Осталось N дней» / «Просрочено на N дней» (days_left отрицательный в past_due,
// null в suspended/canceled, backend.md п.2 «GET .../subscription»).
export const daysLeftLabel = (daysLeft: number | null | undefined): string => {
  if (daysLeft === null || daysLeft === undefined) return '—';
  if (daysLeft < 0) {
    const overdue = Math.abs(daysLeft);
    return `Просрочено на ${overdue} ${pluralizeDays(overdue)}`;
  }
  return `Осталось ${daysLeft} ${pluralizeDays(daysLeft)}`;
};

// Код ошибки бэка (tariffs/backend.md «Новые коды ошибок») → понятный текст. Тот же приём,
// что scheduleErrorMessage/checklistLocationErrorMessage. PLAN_LIMIT_REACHED/
// PLAN_FEATURE_UNAVAILABLE/SUBSCRIPTION_INACTIVE сюда намеренно не включены — их message с
// бэка уже человекочитаем и точнее общего текста (называет конкретный лимит/фичу,
// backend.md «PLAN_LIMIT_REACHED — message человекочитаемо называет лимит»), фолбэк на
// error.message ниже отдаёт его как есть. Ссылку на экран «Тариф» (admin.md, «error» —
// вторая линия обороны после UI-гейтинга) для этих трёх кодов добавляет отдельный механизм —
// dataProvider.request() репортит их в tariffErrorBus.ts, TariffErrorAlert.tsx показывает
// персистентный алерт со ссылкой рядом со стандартным toast'ом.
const TARIFF_ERROR_MESSAGES: Record<string, string> = {
  SUBSCRIPTION_NOT_FOUND: 'У организации нет подписки',
  PLAN_NOT_FOUND: 'Тариф не найден или неактивен',
  ORG_NOT_FOUND: 'Организация не найдена',
};

// Тип события журнала подписки (subscription_events, backend.md «Новая таблица
// subscription_events»): append-only, читается в диалоге «История».
export const SUBSCRIPTION_EVENT_TYPE_LABELS: Record<string, string> = {
  created: 'Создана',
  extended: 'Продлена',
  plan_changed: 'Смена тарифа',
  status_changed: 'Смена статуса',
  auto_suspended: 'Авто-приостановка',
};

export const subscriptionEventTypeLabel = (type: string | null | undefined): string =>
  (type && SUBSCRIPTION_EVENT_TYPE_LABELS[type]) || type || '—';

export const tariffErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && TARIFF_ERROR_MESSAGES[code]) return TARIFF_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// --- Онлайн-оплата подписки через ЮKassa (online_payments) ---

// Русское склонение «N месяц/месяца/месяцев» — период продления (admin.md, «Блок «Продление»»).
export const pluralizeMonths = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'месяц';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'месяца';
  return 'месяцев';
};

export const monthsLabel = (n: number): string => `${n} ${pluralizeMonths(n)}`;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'В обработке',
  succeeded: 'Оплачен',
  canceled: 'Отменён',
  refunded: 'Возврат',
};

export const paymentStatusLabel = (status: string | null | undefined): string =>
  (status && PAYMENT_STATUS_LABELS[status as PaymentStatus]) || status || '—';

export const PAYMENT_STATUS_COLOR: Record<
  string,
  'info' | 'success' | 'warning' | 'error' | 'default'
> = {
  pending: 'warning',
  succeeded: 'success',
  canceled: 'default',
  refunded: 'info',
};

export const PAYMENT_STATUS_CHOICES = Object.entries(PAYMENT_STATUS_LABELS).map(([id, name]) => ({
  id,
  name,
}));

// «Назначение» платежа для истории/реестра (admin.md, «История платежей»): «Премиум, 6 мес»
// для продления, «Апгрейд до Премиума» для доплаты — months у апгрейда означает число
// доплаченных месяцев (backend.md «payments.months»), а не срок продления, поэтому в
// назначении не участвует.
export const paymentPurposeLabel = (payment: {
  kind: PaymentKind;
  plan_name: string;
  months: number | null;
}): string =>
  payment.kind === 'upgrade'
    ? `Апгрейд до ${payment.plan_name}`
    : `${payment.plan_name}, ${payment.months ?? '—'} мес`;

// Код ошибки бэка (online_payments/backend.md «Новые коды ошибок» + переиспользуемые из
// tariffs) → понятный текст. Тот же приём, что tariffErrorMessage; переиспользует его карту
// (SUBSCRIPTION_NOT_FOUND/PLAN_NOT_FOUND/ORG_NOT_FOUND всплывают и на checkout).
const BILLING_ERROR_MESSAGES: Record<string, string> = {
  ...TARIFF_ERROR_MESSAGES,
  BILLING_DISABLED: 'Онлайн-оплата сейчас недоступна',
  PAYMENT_PROVIDER_ERROR: 'Платёжный провайдер недоступен, попробуйте ещё раз чуть позже',
  PAYMENT_NOT_FOUND: 'Платёж не найден',
  UPGRADE_NOT_APPLICABLE: 'Апгрейд сейчас недоступен',
  PAYMENT_AMOUNT_LIMIT: 'Сумма превышает лимит одного платежа — обратитесь в поддержку',
};

export const billingErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
  if (code && BILLING_ERROR_MESSAGES[code]) return BILLING_ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};
