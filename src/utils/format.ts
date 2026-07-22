import { HttpError } from 'react-admin';

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
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
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
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
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

// Ввод суммы в рублях → копейки (целое > 0); максимум 2 знака после запятой.
export const parseRublesToMinor = (raw: string): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
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
  SCHEDULE_REQUIRED_NO_SCHEDULES: 'В организации нет ни одного неархивного графика',
  ROLE_NOT_FOUND: 'Роль не найдена в этой организации',
  WORK_LOCATION_NOT_FOUND: 'Точка не найдена',
  INVALID_TIMEZONE: 'Неизвестный часовой пояс',
};

export const scheduleErrorMessage = (error: unknown, fallback = 'Ошибка'): string => {
  const code = error instanceof HttpError ? error.body?.code : undefined;
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
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleString('ru-RU', { timeZone: tz });
  } catch {
    return date.toLocaleString('ru-RU');
  }
};
