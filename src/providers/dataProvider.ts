import { DataProvider, GetListParams, HttpError } from 'react-admin';
import { getCurrentOrgId } from '../config';
import { fetchWithAuthRetry } from './tokenRefresh';
import {
  INVALID_RANGE_MESSAGE,
  isDayRangeInvalid,
  localDayEndToUtcIso,
  localDayStartToUtcIso,
} from '../utils/dates';
import { parseRublesToMinor, textOrEmpty } from '../utils/format';
import { normalizeDisplayName } from '../utils/memberName';
import type { AccessState, FileUploadResult, ReorderInput } from '../resources/knowledge/types';

// Категории ресурсов:
//  - PLATFORM_SERVER — серверная пагинация через /admin/* ({items,total,limit,offset}).
//  - org-shifts/penalties — серверная пагинация через /organizations/{org}/...
//  - ORG_CLIENT      — ограниченные org-списки: грузим целиком, режем/сортируем на клиенте.
const PLATFORM_SERVER = new Set(['users', 'organizations']);
const ORG_CLIENT = new Set([
  'members',
  'roles',
  'work-locations',
  'checklist-templates',
  'penalty-templates',
]);

// Pydantic отдаёт error.validation[].field полным loc-путём запроса — "body.login",
// "body.items.0.name" (см. validation_exception_handler в smenka_back/src/app/main.py), а
// react-admin ищет ошибку поля формы по его исходному имени — "login". Срезаем только
// ведущий "body." (остальной путь, включая вложенные индексы/поля, оставляем как есть) —
// без этого подсветка полей молчала во всех формах админки, не только в новых.
const stripBodyPrefix = (field: string): string =>
  field.startsWith('body.') ? field.slice('body.'.length) : field;

// Единая точка запроса: Bearer + разворачивание конверта {data, error}. Авторизация и тихий
// retry протухшего access-токена — в fetchWithAuthRetry() (tokenRefresh.ts), здесь только
// Content-Type/Accept и разбор {data,error}.
const request = async (path: string, options: RequestInit = {}): Promise<any> => {
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');
  // FormData (загрузка файла) — Content-Type с boundary браузер выставляет сам; не трогаем.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetchWithAuthRetry(path, { ...options, headers });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || (json && json.error)) {
    const err = json?.error;
    const body: any = err ? { ...err } : { message: res.statusText };
    // VALIDATION_ERROR → ошибки полей формы (react-admin читает error.body.errors).
    if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err.validation)) {
      body.errors = {};
      for (const v of err.validation) {
        if (v?.field) body.errors[stripBodyPrefix(v.field)] = v.message;
      }
    }
    throw new HttpError(err?.message ?? res.statusText ?? 'Ошибка запроса', res.status, body);
  }
  return json ? json.data : null;
};

// Базовый путь текущей организации (для org-ресурсов и кастомных методов).
const orgBase = (): string => {
  const id = getCurrentOrgId();
  if (!id) {
    throw new HttpError('Организация не выбрана', 400, {
      code: 'NO_ORG_SELECTED',
      message: 'Организация не выбрана',
    });
  }
  return `/organizations/${id}`;
};

const clientListPath = (resource: string): string => {
  switch (resource) {
    case 'members':
      return `${orgBase()}/members`;
    case 'roles':
      return `${orgBase()}/roles`;
    case 'work-locations':
      return `${orgBase()}/locations`;
    case 'checklist-templates':
      return `${orgBase()}/checklist-templates`;
    case 'penalty-templates':
      return `${orgBase()}/penalty-templates`;
    default:
      throw new Error(`Нет client-пути для ресурса: ${resource}`);
  }
};

const deleteOnePath = (resource: string, id: string): string => {
  switch (resource) {
    case 'roles':
      return `${orgBase()}/roles/${id}`;
    case 'work-locations':
      return `${orgBase()}/locations/${id}`;
    case 'checklist-templates':
      return `${orgBase()}/checklist-templates/${id}`;
    case 'work-schedules':
      return `${orgBase()}/work-schedules/${id}`;
    case 'penalty-templates':
      return `${orgBase()}/penalty-templates/${id}`;
    case 'penalties':
      return `${orgBase()}/penalties/${id}`;
    case 'adjustments':
      return `${orgBase()}/adjustments/${id}`;
    case 'test-templates':
      return `${orgBase()}/test-templates/${id}`;
    default:
      throw new Error(`Удаление не поддержано для ресурса: ${resource}`);
  }
};

// member → добавляем плоский custom_role_id для SelectInput'а в форме и login (алиас
// user_login, admin_created_accounts/backend.md) для editable LoginInput в MemberEdit.
const mapMember = (m: any): any => ({
  ...m,
  custom_role_id: m?.custom_role?.id ?? null,
  login: typeof m?.user_login === 'string' ? m.user_login : null,
});

// members (create/update): LOGIN_TAKEN/EMAIL_TAKEN/INVALID_DISPLAY_NAME/
// PASSWORD_RESET_NOT_ALLOWED приходят не как VALIDATION_ERROR, поэтому request() их сам
// в body.errors не раскладывает — единая точка ремаппинга код→поле формы для обеих веток
// (admin_created_accounts/admin.md: «LOGIN_TAKEN → ошибка на поле «Логин»» и т.п.).
const rethrowMemberErrorAsField = (
  e: any,
  mapping: Record<string, { field: string; status: number; message?: string }>,
): never => {
  const rule = mapping[e?.body?.code];
  if (!rule) throw e;
  const message = rule.message ?? e.message;
  throw new HttpError(message, e.status ?? rule.status, {
    ...e.body,
    errors: { [rule.field]: message },
  });
};

// penalty-template → плоское amount_rub (рубли) для NumberInput'а формы; обратную
// конвертацию в amount_minor делает create/update (деньги хранятся в копейках).
const mapTemplate = (t: any): any => ({
  ...t,
  amount_rub: typeof t?.amount_minor === 'number' ? t.amount_minor / 100 : null,
});

// checklist-templates/penalty-templates поддерживают мягкое удаление (unified_soft_delete):
// тянем include_deleted=true всегда (ORG_CLIENT и так грузит список целиком) — «показывать ли
// удалённые» дальше решает клиент (getList режет по filter.include_deleted, getOne/getMany
// видят полный список, иначе клик по удалённой строке в списке не открывал бы её на редактирование).
const SOFT_DELETE_CLIENT = new Set(['checklist-templates', 'penalty-templates']);

const loadClient = async (resource: string): Promise<any[]> => {
  const query = SOFT_DELETE_CLIENT.has(resource) ? '?include_deleted=true' : '';
  const data = await request(`${clientListPath(resource)}${query}`);
  const items: any[] = data?.items ?? [];
  if (resource === 'members') return items.map(mapMember);
  if (resource === 'penalty-templates') return items.map(mapTemplate);
  return items;
};

// Клиентская пагинация/сортировка/фильтрация для ограниченных org-списков.
const clientPaginate = (rows: any[], params: GetListParams) => {
  const { q, ...rest } = (params.filter ?? {}) as Record<string, unknown>;
  let filtered = rows;
  if (typeof q === 'string' && q.trim() !== '') {
    const needle = q.toLowerCase();
    filtered = filtered.filter((row) =>
      Object.values(row).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle)),
    );
  }
  for (const [key, value] of Object.entries(rest)) {
    // Фильтры — только примитивы; объекты/пустые значения пропускаем.
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      continue;
    if (value === '') continue;
    filtered = filtered.filter((row) => String(row[key]) === String(value));
  }

  const { field, order } = params.sort ?? { field: 'id', order: 'ASC' };
  const sorted = [...filtered].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    const cmp = av < bv ? -1 : 1;
    return order === 'DESC' ? -cmp : cmp;
  });

  const { page, perPage } = params.pagination ?? { page: 1, perPage: 25 };
  const start = (page - 1) * perPage;
  return { data: sorted.slice(start, start + perPage), total: sorted.length };
};

// Query серверной пагинации/сортировки/фильтров. filterKeys — whitelist параметров
// (для org-shifts); без него прокидываются все непустые фильтры (платформенные списки).
const buildQuery = (
  params: GetListParams,
  opts: { defaultSort: string; filterKeys?: string[]; withSort?: boolean },
): string => {
  const { page, perPage } = params.pagination ?? { page: 1, perPage: 25 };
  const { field, order } = params.sort ?? { field: opts.defaultSort, order: 'DESC' };
  const query = new URLSearchParams({
    limit: String(perPage),
    offset: String((page - 1) * perPage),
  });
  // withSort=false — у эндпоинта фиксированная серверная сортировка (аудит: created_at DESC),
  // не шлём недокументированные sort/order.
  if (opts.withSort !== false) {
    query.set('sort', field);
    query.set('order', order);
  }
  const filter = (params.filter ?? {}) as Record<string, unknown>;
  const entries = opts.filterKeys
    ? opts.filterKeys.map((key) => [key, filter[key]] as const)
    : Object.entries(filter);
  for (const [key, value] of entries) {
    if (
      (typeof value === 'string' && value !== '') ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      query.set(key, String(value));
    }
  }
  return query.toString();
};

const notImplemented = (): Promise<never> =>
  Promise.reject(new Error('Метод не поддержан для этого ресурса'));

// DateInput фильтров отдаёт календарный день (YYYY-MM-DD) — переводим в UTC-границы
// дня (контракт date_filters). Невалидный диапазон режем до сети: бэкенд вернул бы
// 400 INVALID_DATE_RANGE, ТЗ требует превентивную клиентскую валидацию.
const toUtcDayRangeFilter = (filter: Record<string, unknown>): Record<string, unknown> => {
  if (isDayRangeInvalid(filter.date_from, filter.date_to)) {
    throw new HttpError(INVALID_RANGE_MESSAGE, 400, {
      code: 'INVALID_DATE_RANGE',
      message: INVALID_RANGE_MESSAGE,
    });
  }
  const result = { ...filter };
  if (typeof result.date_from === 'string' && result.date_from !== '') {
    result.date_from = localDayStartToUtcIso(result.date_from);
  }
  if (typeof result.date_to === 'string' && result.date_to !== '') {
    result.date_to = localDayEndToUtcIso(result.date_to);
  }
  return result;
};

// Серверный org-список с UTC-диапазоном дат (смены, аудит): проверка выбранной org →
// конверт {items,total}. withSort:false — у эндпоинта фиксированная серверная сортировка.
const orgServerList = async (
  params: GetListParams,
  opts: { path: string; defaultSort: string; filterKeys: string[]; withSort?: boolean },
): Promise<{ data: any[]; total: number }> => {
  if (!getCurrentOrgId()) return { data: [], total: 0 };
  const filter = toUtcDayRangeFilter((params.filter ?? {}) as Record<string, unknown>);
  const query = buildQuery(
    { ...params, filter },
    { defaultSort: opts.defaultSort, filterKeys: opts.filterKeys, withSort: opts.withSort },
  );
  const data = await request(`${orgBase()}/${opts.path}?${query}`);
  return { data: data?.items ?? [], total: data?.total ?? 0 };
};

// Настройка Client ID OAuth-провайдеров (oauth_login), платформенная (не per-org).
// 5 валидных комбинаций: (google,web)/(google,android)/(google,ios)/(apple,ios)/(apple,web).
export interface OauthProviderRow {
  provider: 'google' | 'apple';
  client_type: 'web' | 'ios' | 'android';
  client_id: string | null;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

// Окно орг-статистики: ровно один источник — period ЛИБО date_from/date_to (UTC ISO).
export interface OrgStatsQuery {
  period?: string;
  date_from?: string;
  date_to?: string;
}

// Фильтры детального отчёта payroll (расширение базового payroll) и экспорта.
// user_ids/location_ids шлются повторяемыми query-параметрами; location_ids может
// содержать спец-значение 'none' (смены без точки). granularity=none → плоский агрегат.
export interface PayrollQuery {
  date_from?: string; // UTC ISO
  date_to?: string;
  granularity?: 'none' | 'day' | 'week' | 'month';
  user_ids?: string[];
  location_ids?: string[];
  tz?: string; // IANA, нарезка корзин в этой таймзоне
  only_missing_rate?: boolean;
  // Учитывать штрафы (penalty/net-поля). Бэк по умолчанию true; false шлём явно (fines).
  include_penalties?: boolean;
}

// Query payroll/export: повторяемые user_ids/location_ids, булев only_missing_rate.
const buildPayrollQuery = (q: PayrollQuery): URLSearchParams => {
  const search = new URLSearchParams();
  if (q.date_from) search.set('date_from', q.date_from);
  if (q.date_to) search.set('date_to', q.date_to);
  if (q.granularity) search.set('granularity', q.granularity);
  if (q.tz) search.set('tz', q.tz);
  if (q.only_missing_rate) search.set('only_missing_rate', 'true');
  // Дефолт бэка — true; явно шлём только выключение, чтобы не плодить лишний query при include.
  if (q.include_penalties === false) search.set('include_penalties', 'false');
  for (const id of q.user_ids ?? []) search.append('user_ids', id);
  for (const id of q.location_ids ?? []) search.append('location_ids', id);
  return search;
};

// Имя файла из Content-Disposition (filename* в приоритете). При CORS заголовок может быть
// недоступен (нужен Access-Control-Expose-Headers) — вызывающий передаёт запасное имя.
const filenameFromDisposition = (header: string | null): string | null => {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* битый percent-encoding — падать обратно на plain filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ? plain[1].trim() : null;
};

// Экспорт payroll в .xlsx: бинарный ответ (НЕ конверт {data,error}), поэтому идёт мимо
// request() — но Bearer-токен и тихий retry-after-refresh на 401 нужны точно так же, отсюда
// тот же fetchWithAuthRetry() (тот же класс бага, что и у остальных authenticated-запросов).
const fetchPayrollExport = async (
  query: PayrollQuery,
): Promise<{ blob: Blob; filename: string | null }> => {
  const headers = new Headers({
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json',
  });
  const search = buildPayrollQuery(query);
  search.set('format', 'xlsx');
  const res = await fetchWithAuthRetry(`${orgBase()}/payroll/export?${search.toString()}`, {
    headers,
  });
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!res.ok || contentType.includes('application/json')) {
    // Ошибки до отдачи файла приходят JSON-конвертом — распознаём по Content-Type и бросаем
    // HttpError, как request().
    let json: any;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    const err = json?.error;
    throw new HttpError(
      err?.message ?? res.statusText ?? 'Ошибка экспорта',
      res.status,
      err ? { ...err } : { message: res.statusText },
    );
  }
  const blob = await res.blob();
  return { blob, filename: filenameFromDisposition(res.headers.get('Content-Disposition')) };
};

// Query-строка из непустых значений (для кастомных методов вне GetListParams).
const toSearch = (query: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  return search.toString();
};

// --- Тестирование сотрудников (employee_tests) ---

// Тело запроса шаблона теста (create/update формы-конструктора): нормализует значения
// ArrayInput в контрактный формат POST/PATCH .../test-templates (backend.md, «POST
// .../test-templates»; тот же формат — импорт, см. import-format.md). id/position/
// template_id и прочие служебные поля из record (Edit подставляет их в defaultValues
// формы) намеренно отбрасываются — сервер делает полную замену questions и сам
// назначает position по порядку элементов массива.
const buildTestTemplateBody = (d: Record<string, unknown>): Record<string, unknown> => {
  const questions = Array.isArray(d.questions) ? (d.questions as Record<string, unknown>[]) : [];
  const description = textOrEmpty(d.description).trim();
  return {
    title: textOrEmpty(d.title).trim(),
    description: description !== '' ? description : null,
    pass_threshold_percent: Number(d.pass_threshold_percent),
    max_attempts: Number(d.max_attempts),
    reveal_answers: Boolean(d.reveal_answers),
    shuffle_questions: Boolean(d.shuffle_questions),
    questions: questions.map((q) => ({
      text: textOrEmpty(q.text).trim(),
      type: q.type,
      points: Number(q.points),
      options: (Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : []).map(
        (o) => ({
          text: textOrEmpty(o.text).trim(),
          is_correct: Boolean(o.is_correct),
        }),
      ),
    })),
  };
};

export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    if (PLATFORM_SERVER.has(resource)) {
      const path = resource === 'users' ? '/admin/users' : '/admin/organizations';
      const data = await request(`${path}?${buildQuery(params, { defaultSort: 'created_at' })}`);
      return { data: data?.items ?? [], total: data?.total ?? 0 };
    }
    if (resource === 'org-shifts') {
      // only_late/only_manual/include_deleted — булевы тумблеры: снятое состояние (false) не
      // должно становиться сетевым фильтром (контракт знает только `=true` как включённый
      // фильтр, default и так false) — вырезаем их из filter, а не шлём buildQuery'ем как есть
      // (тот включает булевы значения безусловно, включая false).
      const filter = { ...(params.filter ?? {}) } as Record<string, unknown>;
      if (filter.only_late === false) delete filter.only_late;
      if (filter.only_manual === false) delete filter.only_manual;
      if (filter.include_deleted === false) delete filter.include_deleted;
      return orgServerList(
        { ...params, filter },
        {
          path: 'shifts',
          defaultSort: 'started_at',
          // checklists — состояние чек-листов смены (none/all_completed/has_incomplete/
          // required_incomplete), см. checklist_reports/backend.md. only_late/work_schedule_id/
          // has_overtime — work_schedules/backend.md, «Фильтры в списке смен организации».
          // only_manual/include_deleted — manual_time_entry (A5).
          filterKeys: [
            'user_id',
            'status',
            'date_from',
            'date_to',
            'checklists',
            'only_late',
            'work_schedule_id',
            'has_overtime',
            'only_manual',
            'include_deleted',
          ],
        },
      );
    }
    if (resource === 'work-schedules') {
      // include_paused — параметр запроса (не поле записи): выносим из filter, иначе
      // clientPaginate попытался бы сверять его со значениями строк и обнулил бы список.
      // Графики не участвуют в unified_soft_delete (is_archived → is_paused — временное
      // выключение, не удаление; физический DELETE остаётся отдельно, backend.md «Единственное
      // исключение»).
      if (!getCurrentOrgId()) return { data: [], total: 0 };
      const filter = { ...(params.filter ?? {}) } as Record<string, unknown>;
      const includePaused = filter.include_paused === true;
      delete filter.include_paused;
      const data = await request(`${orgBase()}/work-schedules?include_paused=${includePaused}`);
      const items: any[] = data?.items ?? [];
      return clientPaginate(items, { ...params, filter });
    }
    if (resource === 'overtime-requests') {
      // Реестр заявок на переработку (org_admin). Серверная пагинация limit/offset, фиксированная
      // сортировка на бэке — sort/order не шлём. user_id (форма фильтра, единичный выбор через
      // MemberSelectFilter) уходит в контрактный user_ids (CSV из одного элемента).
      if (!getCurrentOrgId()) return { data: [], total: 0 };
      const filter = toUtcDayRangeFilter((params.filter ?? {}) as Record<string, unknown>);
      const { page, perPage } = params.pagination ?? { page: 1, perPage: 50 };
      const query = new URLSearchParams({
        limit: String(perPage),
        offset: String((page - 1) * perPage),
      });
      if (typeof filter.status === 'string' && filter.status !== '')
        query.set('status', filter.status);
      if (typeof filter.user_id === 'string' && filter.user_id !== '')
        query.set('user_ids', filter.user_id);
      if (typeof filter.date_from === 'string' && filter.date_from !== '')
        query.set('date_from', filter.date_from);
      if (typeof filter.date_to === 'string' && filter.date_to !== '')
        query.set('date_to', filter.date_to);
      const data = await request(`${orgBase()}/overtime-requests?${query.toString()}`);
      return { data: data?.items ?? [], total: data?.total ?? 0 };
    }
    if (resource === 'checklist-instances') {
      // Реестр экземпляров чек-листов организации (checklist_reports/backend.md).
      // id строки — составной ("{shift_id}:{instance_id}"): у бэка нет одиночного GET
      // по реестру, а деталь открывается через GET /shifts/{shift_id}/checklists/{instance_id},
      // которому нужен shift_id. Составной id несём через весь Show-роут (getOne ниже его
      // разбирает обратно).
      const result = await orgServerList(params, {
        path: 'checklist-instances',
        defaultSort: 'shift_started_at',
        filterKeys: [
          'user_id',
          'template_id',
          'type',
          'status',
          'state',
          'is_required',
          'work_location_id',
          'date_from',
          'date_to',
        ],
      });
      return {
        ...result,
        data: result.data.map((item: any) => ({ ...item, id: `${item.shift_id}:${item.id}` })),
      };
    }
    if (resource === 'audit-logs') {
      return orgServerList(params, {
        path: 'audit-logs',
        defaultSort: 'created_at',
        filterKeys: ['action', 'actor_user_id', 'date_from', 'date_to'],
        withSort: false,
      });
    }
    if (resource === 'penalties') {
      // фикс-сортировка бэка occurred_at DESC → sort/order не шлём (withSort:false).
      // include_deleted (unified_soft_delete): показать снятые/удалённые штрафы для восстановления.
      return orgServerList(params, {
        path: 'penalties',
        defaultSort: 'occurred_at',
        filterKeys: ['member_id', 'shift_id', 'date_from', 'date_to', 'include_deleted'],
        withSort: false,
      });
    }
    if (resource === 'adjustments') {
      // Ручные начисления/удержания (manual_time_entry, B2): фикс-сортировка бэка
      // occurred_at DESC → withSort:false, та же семантика, что и penalties. `type`
      // (доплата/удержание/все) — клиентский фильтр по знаку суммы (admin.md §4.1:
      // «фильтруется на клиенте»), в filterKeys НЕ входит — на сервер не уходит,
      // применяется в AdjustmentDatagrid поверх уже полученной страницы. include_deleted
      // (unified_soft_delete) — показать отменённые/удалённые начисления для восстановления.
      return orgServerList(params, {
        path: 'adjustments',
        defaultSort: 'occurred_at',
        filterKeys: ['member_id', 'shift_id', 'date_from', 'date_to', 'include_deleted'],
        withSort: false,
      });
    }
    if (resource === 'test-templates') {
      // Реестр шаблонов тестов (unified_soft_delete: archived→include_deleted, тесты — часть
      // единой схемы мягкого удаления, backend.md): limit/offset/include_deleted, без sort/order
      // в контракте (backend.md, «GET .../test-templates») → withSort:false.
      return orgServerList(params, {
        path: 'test-templates',
        defaultSort: 'created_at',
        filterKeys: ['include_deleted'],
        withSort: false,
      });
    }
    if (resource === 'test-assignments') {
      // Реестр результатов (employee_tests, «Результаты тестов»): фильтры
      // template_id/member_id/status, без sort/order в контракте → withSort:false.
      return orgServerList(params, {
        path: 'test-assignments',
        defaultSort: 'created_at',
        filterKeys: ['template_id', 'member_id', 'status'],
        withSort: false,
      });
    }
    if (resource === 'knowledge/nodes') {
      // Дерево целиком (tree=true), без пагинации; каждый верхнеуровневый узел с children.
      if (!getCurrentOrgId()) return { data: [], total: 0 };
      const data = await request(`${orgBase()}/knowledge/nodes?tree=true`);
      const items: any[] = data?.items ?? [];
      return { data: items, total: items.length };
    }
    if (ORG_CLIENT.has(resource)) {
      if (!getCurrentOrgId()) return { data: [], total: 0 };
      let rows = await loadClient(resource);
      const filter = { ...(params.filter ?? {}) } as Record<string, unknown>;
      if (SOFT_DELETE_CLIENT.has(resource)) {
        // include_deleted — параметр запроса (не поле записи), как include_archived у графиков:
        // вырезаем из filter, иначе clientPaginate сверял бы его со значениями строк.
        const includeDeleted = filter.include_deleted === true;
        delete filter.include_deleted;
        if (!includeDeleted) rows = rows.filter((r) => !r.is_deleted);
      }
      return clientPaginate(rows, { ...params, filter });
    }
    throw new Error(`getList: неизвестный ресурс ${resource}`);
  },

  getOne: async (resource, params) => {
    const id = String(params.id);
    if (resource === 'users') return { data: await request(`/admin/users/${id}`) };
    if (resource === 'organizations') return { data: await request(`/organizations/${id}`) };
    if (resource === 'settings') {
      const s = await request(`${orgBase()}/settings`);
      return { data: { ...(s ?? {}), id: s?.organization_id ?? id } };
    }
    if (resource === 'org-shifts') {
      // деталь чужой орг-смены: GET /organizations/{org}/shifts/{shift_id}?include_deleted=true.
      // include_deleted=true шлём безусловно — для обычной (неудалённой) смены поведение не
      // меняется, а для удалённой (открыта по клику из списка под фильтром «Показывать
      // удалённые», admin.md §1.3/§3: «клик открывает деталь, где доступно восстановление»)
      // без параметра бэк отдал бы 404 SHIFT_NOT_FOUND даже при реально существующей смене
      // (manual_time_entry, A5 — эндпоинт списка include_deleted уже поддерживал, у детали
      // параметр добавлен тем же контрактом).
      return { data: await request(`${orgBase()}/shifts/${id}?include_deleted=true`) };
    }
    if (resource === 'checklist-templates') {
      // детальная схема с пунктами
      return { data: await request(`${orgBase()}/checklist-templates/${id}`) };
    }
    if (resource === 'work-schedules') {
      // объект + role_ids + work_location_ids (backend.md, «Графики — CRUD»).
      return { data: await request(`${orgBase()}/work-schedules/${id}`) };
    }
    if (resource === 'penalties') {
      return { data: await request(`${orgBase()}/penalties/${id}`) };
    }
    if (resource === 'test-templates') {
      // Детальная схема с вопросами/вариантами (с is_correct — это админ, backend.md).
      return { data: await request(`${orgBase()}/test-templates/${id}`) };
    }
    if (resource === 'checklist-instances') {
      // id составной ("{shift_id}:{instance_id}", см. getList выше). Пункты с комментариями
      // и фото — из уже существующего GET /shifts/{shift_id}/checklists/{instance_id} (детальный
      // эндпоинт не отдаёт сотрудника/точку/тайминги смены — их дотягиваем через уже
      // существующий GET /organizations/{org}/shifts/{shift_id}, как в org-shifts getOne).
      const [shiftId, instanceId] = id.split(':');
      if (!shiftId || !instanceId) {
        throw new HttpError('Экземпляр чек-листа не найден', 404, { code: 'NOT_FOUND' });
      }
      const [detail, shift] = await Promise.all([
        request(`/shifts/${shiftId}/checklists/${instanceId}`),
        request(`${orgBase()}/shifts/${shiftId}`),
      ]);
      return {
        data: {
          ...detail,
          id,
          shift_id: shiftId,
          user_name: shift?.user_name ?? null,
          // member_display_name: тянем вместе с user_name из того же shift — деталь чек-листа
          // сама его не отдаёт (см. комментарий выше).
          display_name: shift?.display_name ?? null,
          user_email: shift?.user_email ?? null,
          work_location: shift?.work_location ?? null,
          shift_started_at: shift?.started_at ?? null,
          shift_finished_at: shift?.finished_at ?? null,
          shift_status: shift?.status ?? null,
        },
      };
    }
    if (resource === 'knowledge/nodes') {
      // Деталь узла (M3): content обогащён для page, breadcrumbs, null для section.
      return { data: await request(`${orgBase()}/knowledge/nodes/${id}`) };
    }
    if (ORG_CLIENT.has(resource)) {
      const found = (await loadClient(resource)).find((r) => String(r.id) === id);
      if (!found) throw new HttpError('Запись не найдена', 404, { code: 'NOT_FOUND' });
      return { data: found };
    }
    throw new Error(`getOne: неизвестный ресурс ${resource}`);
  },

  getMany: async (resource, params) => {
    const ids = params.ids.map(String);
    if (ORG_CLIENT.has(resource)) {
      const rows = await loadClient(resource);
      return { data: rows.filter((r) => ids.includes(String(r.id))) };
    }
    if (resource === 'users') {
      const data = await Promise.all(ids.map((id) => request(`/admin/users/${id}`)));
      return { data };
    }
    const data = await Promise.all(ids.map((id) => request(`/organizations/${id}`)));
    return { data };
  },

  getManyReference: notImplemented,

  create: async (resource, params) => {
    const d = params.data;
    if (resource === 'organizations') {
      return {
        data: await request('/organizations', {
          method: 'POST',
          body: JSON.stringify({ name: d.name }),
        }),
      };
    }
    if (resource === 'roles') {
      return {
        data: await request(`${orgBase()}/roles`, {
          method: 'POST',
          body: JSON.stringify({ name: d.name }),
        }),
      };
    }
    if (resource === 'work-locations') {
      const body = {
        name: d.name,
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        radius_meters: Number(d.radius_meters ?? 100),
        // address — опционально; пустую строку нормализуем в null (бэк хранит как есть).
        address: d.address ? String(d.address) : null,
      };
      return {
        data: await request(`${orgBase()}/locations`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'checklist-templates') {
      const body = { name: d.name, type: d.type, is_required: Boolean(d.is_required) };
      return {
        data: await request(`${orgBase()}/checklist-templates`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'work-schedules') {
      const body = { name: d.name, start_time: d.start_time, end_time: d.end_time };
      return {
        data: await request(`${orgBase()}/work-schedules`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'penalty-templates') {
      const minor = parseRublesToMinor(String(d.amount_rub ?? ''));
      if (minor === null) {
        throw new HttpError('Некорректная сумма', 400, {
          code: 'VALIDATION_ERROR',
          message: 'Некорректная сумма',
          errors: { amount_rub: 'Сумма в рублях больше нуля, не более 2 знаков' },
        });
      }
      const created = await request(`${orgBase()}/penalty-templates`, {
        method: 'POST',
        body: JSON.stringify({ reason: d.reason, amount_minor: minor }),
      });
      return { data: mapTemplate(created) };
    }
    if (resource === 'penalties') {
      // amount_minor/occurred_at собирает форма-диалог (см. resources/penalties).
      const body = {
        member_id: d.member_id,
        template_id: d.template_id ?? null,
        reason: d.reason,
        amount_minor: d.amount_minor,
        currency: d.currency ?? 'RUB',
        shift_id: d.shift_id ?? null,
        occurred_at: d.occurred_at ?? null,
        comment: d.comment ?? null,
      };
      return {
        data: await request(`${orgBase()}/penalties`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'org-shifts') {
      // Создать смену вручную (manual_time_entry A1): POST .../shifts. Тело собирает форма
      // (resources/manualShifts) — started_at/finished_at уже сконвертированы в UTC ISO из
      // таймзоны организации, pauses — полный список {started_at,finished_at}.
      const body = {
        user_id: d.user_id,
        started_at: d.started_at,
        finished_at: d.finished_at,
        work_location_id: d.work_location_id ?? null,
        work_schedule_id: d.work_schedule_id ?? null,
        pauses: d.pauses ?? [],
        note: d.note ? String(d.note) : null,
      };
      return {
        data: await request(`${orgBase()}/shifts`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'adjustments') {
      // Создать ручное начисление (manual_time_entry B1): POST .../adjustments.
      const body = {
        member_id: d.member_id,
        amount_minor: d.amount_minor,
        currency: d.currency ?? 'RUB',
        reason: d.reason,
        occurred_at: d.occurred_at ?? null,
        shift_id: d.shift_id ?? null,
        comment: d.comment ? String(d.comment) : null,
      };
      return {
        data: await request(`${orgBase()}/adjustments`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      };
    }
    if (resource === 'knowledge/nodes') {
      // Создание узла (M1): тело {parent_id?, kind, title, icon?, position?}.
      return {
        data: await request(`${orgBase()}/knowledge/nodes`, {
          method: 'POST',
          body: JSON.stringify(d),
        }),
      };
    }
    if (resource === 'test-templates') {
      // Конструктор (Create-форма). Импорт «сырого» JSON — отдельный кастомный метод
      // importTestTemplate (шлёт тело как есть, без прогона через buildTestTemplateBody).
      return {
        data: await request(`${orgBase()}/test-templates`, {
          method: 'POST',
          body: JSON.stringify(buildTestTemplateBody(d)),
        }),
      };
    }
    if (resource === 'members') {
      // Завести сотрудника (admin_created_accounts/backend.md, «POST .../members»): ответ —
      // {member, login, password}, а не голый MemberResponse. Пароль возвращается один раз —
      // кладём его во временные _login/_password поля возвращаемой записи (НЕ в user_login/
      // password_managed, которые остаются производными от member), чтобы MemberCreate достал
      // их из onSuccess мутации и показал в окне выдачи доступа; в кэш ресурса `members` они
      // не персистятся отдельным запросом (следующий getList/getOne их не вернёт).
      const body = {
        name: d.name,
        // trim + пустая строка → null: та же семантика, что normalizeDisplayName уже
        // реализует для display_name (utils/memberName) — переиспользуем вместо повтора.
        login: normalizeDisplayName(d.login),
        email: normalizeDisplayName(d.email),
        phone: normalizeDisplayName(d.phone),
        password: typeof d.password === 'string' && d.password !== '' ? d.password : null,
        role: d.role ?? 'employee',
        role_id: d.role_id ? d.role_id : null,
        display_name: normalizeDisplayName(d.display_name),
      };
      let created: any;
      try {
        created = await request(`${orgBase()}/members`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch (e: any) {
        rethrowMemberErrorAsField(e, {
          LOGIN_TAKEN: { field: 'login', status: 409 },
          EMAIL_TAKEN: { field: 'email', status: 409 },
        });
      }
      return {
        data: {
          ...mapMember(created?.member ?? {}),
          _login: created?.login ?? null,
          _password: created?.password ?? null,
        },
      };
    }
    return notImplemented();
  },

  update: async (resource, params) => {
    const { id, data, previousData } = params;
    if (resource === 'users') {
      const updated = await request(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: data.role }),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'settings') {
      const body: Record<string, unknown> = {};
      // auto_finish_hours убран из контракта (work_schedules заменяет его авто-завершением по
      // графику); новые поля — auto_finish_by_schedule/require_schedule/late_tolerance_minutes/
      // overtime_request_days (work_schedules/backend.md, «organization_settings — изменения»).
      for (const k of [
        'geo_check_enabled',
        'require_work_location',
        'auto_finish_by_schedule',
        'require_schedule',
        'late_tolerance_minutes',
        'overtime_request_days',
        'max_pause_minutes',
        'max_pauses_per_shift',
      ]) {
        if (k in data) body[k] = data[k] === '' ? null : data[k];
      }
      const s = await request(`${orgBase()}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: { ...(s ?? {}), id: s?.organization_id ?? id } };
    }
    if (resource === 'roles') {
      const updated = await request(`${orgBase()}/roles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name }),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'work-locations') {
      const body: Record<string, unknown> = {
        name: data.name,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radius_meters: Number(data.radius_meters),
      };
      // address меняется только если задан непустым: бэк не очищает поле через null/пустую
      // строку (PATCH игнорирует null), поэтому пустой адрес не шлём вовсе.
      if (data.address) body.address = String(data.address);
      const updated = await request(`${orgBase()}/locations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'checklist-templates') {
      const body: Record<string, unknown> = {};
      for (const k of ['name', 'type', 'is_required']) {
        if (k in data) body[k] = data[k];
      }
      const updated = await request(`${orgBase()}/checklist-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: { ...updated, id } };
    }
    if (resource === 'work-schedules') {
      const body: Record<string, unknown> = {};
      for (const k of ['name', 'start_time', 'end_time', 'is_paused']) {
        if (k in data) body[k] = data[k];
      }
      const updated = await request(`${orgBase()}/work-schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: { ...updated, id } };
    }
    if (resource === 'members') {
      const userId = data.user_id ?? previousData?.user_id;
      if (!userId) {
        throw new HttpError('Не указан пользователь', 400, { code: 'VALIDATION_ERROR' });
      }
      let result: any = previousData;
      if (data.role !== undefined && data.role !== previousData?.role) {
        result = await request(`${orgBase()}/members/${userId}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role: data.role }),
        });
      }
      const prevCustom = previousData?.custom_role?.id ?? previousData?.custom_role_id ?? null;
      // SelectInput отдаёт '' при «нет роли» — нормализуем в null (контракт: role_id uuid|null).
      const nextCustom = data.custom_role_id ? data.custom_role_id : null;
      if (nextCustom !== prevCustom) {
        result = await request(`${orgBase()}/members/${userId}/custom-role`, {
          method: 'PATCH',
          body: JSON.stringify({ role_id: nextCustom }),
        });
      }
      // Партиальный PATCH .../members/{userId}: display_name (member_display_name) и login
      // (admin_created_accounts/backend.md, «PATCH .../members/{user_id} — расширение»,
      // только для password_managed === true — иначе бэк вернёт PASSWORD_RESET_NOT_ALLOWED)
      // собираем в одно тело, чтобы не слать два PATCH'а, если оба поля изменились разом.
      // Сравнение — с нормализованными значениями (пустая строка формы ≡ null/не изменено),
      // иначе немодифицированный TextInput слал бы лишний запрос и лишнюю аудит-запись.
      const patchBody: Record<string, unknown> = {};
      if ('display_name' in data) {
        const nextDisplayName = normalizeDisplayName(data.display_name);
        const prevDisplayName = normalizeDisplayName(previousData?.display_name);
        if (nextDisplayName !== prevDisplayName) patchBody.display_name = nextDisplayName;
      }
      if ('login' in data) {
        const nextLogin = normalizeDisplayName(data.login);
        const prevLogin = normalizeDisplayName(previousData?.login);
        if (nextLogin !== prevLogin) patchBody.login = nextLogin;
      }
      if (Object.keys(patchBody).length > 0) {
        try {
          result = await request(`${orgBase()}/members/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody),
          });
        } catch (e: any) {
          rethrowMemberErrorAsField(e, {
            INVALID_DISPLAY_NAME: { field: 'display_name', status: 400 },
            LOGIN_TAKEN: { field: 'login', status: 409 },
            PASSWORD_RESET_NOT_ALLOWED: {
              field: 'login',
              status: 403,
              message: 'Логин можно менять только для учёток, созданных этой организацией',
            },
          });
        }
      }
      return { data: mapMember({ ...previousData, ...data, ...(result ?? {}) }) };
    }
    if (resource === 'penalty-templates') {
      const body: Record<string, unknown> = {};
      if ('reason' in data) body.reason = data.reason;
      if ('amount_rub' in data) {
        const minor = parseRublesToMinor(String(data.amount_rub ?? ''));
        if (minor === null) {
          throw new HttpError('Некорректная сумма', 400, {
            code: 'VALIDATION_ERROR',
            message: 'Некорректная сумма',
            errors: { amount_rub: 'Сумма в рублях больше нуля, не более 2 знаков' },
          });
        }
        body.amount_minor = minor;
      }
      const updated = await request(`${orgBase()}/penalty-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: mapTemplate(updated ?? { ...data, id }) };
    }
    if (resource === 'penalties') {
      // Диалог-форма (resources/penalties) кладёт в data только изменяемые ключи.
      const body: Record<string, unknown> = {};
      for (const k of [
        'reason',
        'amount_minor',
        'currency',
        'shift_id',
        'occurred_at',
        'comment',
      ]) {
        if (k in data) body[k] = data[k];
      }
      const updated = await request(`${orgBase()}/penalties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'org-shifts') {
      // Изменить смену вручную (manual_time_entry A2): PATCH .../shifts/{id}, только
      // переданные ключи (частичное обновление; для active/paused finished_at завершает
      // смену задним числом — см. resources/manualShifts, ManualShiftEditDialog/FinishDialog).
      const body: Record<string, unknown> = {};
      for (const k of ['started_at', 'finished_at', 'work_location_id', 'pauses', 'note']) {
        if (k in data) body[k] = data[k];
      }
      const updated = await request(`${orgBase()}/shifts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'adjustments') {
      // Исправить начисление (manual_time_entry B3): member_id неизменен (не входит в
      // список ключей — форма и не должна его слать при правке).
      const body: Record<string, unknown> = {};
      for (const k of ['amount_minor', 'reason', 'comment', 'occurred_at', 'shift_id']) {
        if (k in data) body[k] = data[k];
      }
      const updated = await request(`${orgBase()}/adjustments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'knowledge/nodes') {
      // Partial PATCH (M4): тело = переданные ключи (title?/icon?/all_members?/content?/
      // parent_id?/position?). Ответ — NodeDetailResponse с обогащённым content.
      const updated = await request(`${orgBase()}/knowledge/nodes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return { data: updated ?? { ...data, id } };
    }
    if (resource === 'test-templates') {
      // Мета + полная замена questions (backend.md: «PATCH .../test-templates/{id}»).
      // Удалённый шаблон → TEST_TEMPLATE_DELETED (400), обрабатывается вызывающим экраном.
      const updated = await request(`${orgBase()}/test-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildTestTemplateBody(data)),
      });
      return { data: { ...updated, id } };
    }
    return notImplemented();
  },

  updateMany: notImplemented,

  delete: async (resource, params) => {
    const id = String(params.id);
    const fallback = (params.previousData ?? { id: params.id }) as any;
    if (resource === 'members') {
      const userId = params.previousData?.user_id;
      if (!userId) {
        throw new HttpError('Не указан пользователь', 400, { code: 'VALIDATION_ERROR' });
      }
      await request(`${orgBase()}/members/${userId}`, { method: 'DELETE' });
      return { data: fallback };
    }
    if (resource === 'knowledge/nodes') {
      // Удаление узла и поддерева (M5): каскад на бэке. Ответ {data:null}.
      await request(`${orgBase()}/knowledge/nodes/${id}`, { method: 'DELETE' });
      return { data: { id: params.id } as any };
    }
    if (resource === 'org-shifts') {
      // Удалить смену (soft-delete, manual_time_entry A3): DELETE .../shifts/{id}?note=...
      // note — необязательная причина удаления (admin.md §3.1), приходит через meta (у
      // DELETE в контракте нет тела, только query).
      const note = (params.meta as { note?: string } | undefined)?.note;
      const query = note ? `?${new URLSearchParams({ note }).toString()}` : '';
      await request(`${orgBase()}/shifts/${id}${query}`, { method: 'DELETE' });
      return { data: fallback };
    }
    await request(deleteOnePath(resource, id), { method: 'DELETE' });
    return { data: fallback };
  },

  deleteMany: async (resource, params) => {
    // members не поддерживают bulk-delete (нужен user_id, а не id записи) — отключено в UI.
    await Promise.all(
      params.ids.map((id) => request(deleteOnePath(resource, String(id)), { method: 'DELETE' })),
    );
    return { data: params.ids };
  },

  // --- Кастомные методы (вызываются через useDataProvider) ---
  getPlatformStats: () => request('/admin/stats'),
  // Сброс пароля учётки, заведённой этой организацией (admin_created_accounts/backend.md,
  // «POST .../members/{user_id}/reset-password»): password undefined/null → сервер
  // сгенерирует; иначе — те же правила валидации, что при создании. Ответ содержит новый
  // пароль в открытом виде один раз — вызывающий компонент (ResetPasswordDialog) сразу
  // передаёт его в окно выдачи доступа и нигде не персистит.
  resetMemberPassword: (
    userId: string,
    password?: string,
  ): Promise<{ user_id: string; login: string | null; password: string } | null> =>
    request(`${orgBase()}/members/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: password ?? null }),
    }),
  // Настройки платформы → Провайдеры входа (oauth_login, super_admin-only). Контракт
  // (backend.md) не фиксирует конверт списка — принимаем и {items:[...]}, и голый массив.
  getOauthProviders: async (): Promise<OauthProviderRow[]> => {
    const data = await request('/admin/oauth-providers');
    if (Array.isArray(data)) return data;
    return data?.items ?? [];
  },
  updateOauthProvider: (
    provider: string,
    clientType: string,
    body: { client_id: string; enabled: boolean },
  ): Promise<OauthProviderRow> =>
    request(`/admin/oauth-providers/${provider}/${clientType}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getOrgStats: (query: OrgStatsQuery) => request(`${orgBase()}/stats?${toSearch({ ...query })}`),
  // Ротация инвайт-кода организации: POST /organizations/{org}/rotate-invite → { invite_code }.
  // org_id передаётся явно (страница работает с выбранной org, без orgBase-зависимости).
  rotateInviteCode: (orgId: string): Promise<{ invite_code: string } | null> =>
    request(`/organizations/${orgId}/rotate-invite`, { method: 'POST' }),
  // Переименование организации (org_rename): PATCH /organizations/{org} c {name}, право
  // owner/admin/super_admin (бэк — ensure_admin_or_owner). org_id передаётся явно, как в
  // rotateInviteCode. Возвращает обновлённую организацию (в т.ч. фактическую роль вызывающего).
  // Валидация имени (trim/непустое/≤255) — на клиенте до вызова; серверная 422 дублирует.
  renameOrganization: (orgId: string, name: string): Promise<{ id: string; name: string } | null> =>
    request(`/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  // Часовой пояс организации (work_schedules): PATCH /organizations/{org} c {timezone}, отдельный
  // от renameOrganization вызов (settings.tsx правит его в том же экране, что и настройки, но
  // это поле самой organizations, не organization_settings). Ошибка INVALID_TIMEZONE (400).
  updateOrganizationTimezone: (
    orgId: string,
    timezone: string,
  ): Promise<{ id: string; timezone: string } | null> =>
    request(`/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ timezone }),
    }),
  getShiftChecklists: async (shiftId: string) => {
    const data = await request(`/shifts/${shiftId}/checklists`);
    return data?.items ?? [];
  },
  getShiftChecklistInstance: (shiftId: string, instanceId: string) =>
    request(`/shifts/${shiftId}/checklists/${instanceId}`),
  getTemplateAssignments: (templateId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/assignments`),
  // Восстановление удалённого шаблона чек-листа (unified_soft_delete). Раньше обратного
  // перехода не было вовсе (backend.md, «checklist_templates … никак — обратного перехода нет»).
  restoreChecklistTemplate: (templateId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/restore`, { method: 'POST' }),
  addTemplateItem: (
    templateId: string,
    // photo_requirement/photo_source — опц. (checklist_photos); при none source не шлём.
    body: {
      text: string;
      is_required: boolean;
      photo_requirement?: string;
      photo_source?: string;
    },
  ) =>
    request(`${orgBase()}/checklist-templates/${templateId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTemplateItem: (templateId: string, itemId: string, body: Record<string, unknown>) =>
    request(`${orgBase()}/checklist-templates/${templateId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteTemplateItem: (templateId: string, itemId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/items/${itemId}`, { method: 'DELETE' }),
  reorderTemplateItems: (templateId: string, itemIds: string[]) =>
    request(`${orgBase()}/checklist-templates/${templateId}/items/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ item_ids: itemIds }),
    }),
  setTemplateRoles: (templateId: string, roleIds: string[]) =>
    request(`${orgBase()}/checklist-templates/${templateId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ role_ids: roleIds }),
    }),
  // checklist_work_location: привязка шаблона к точкам (PUT-семантика, полная замена).
  // Пустой массив снимает все привязки — шаблон снова действует на всех точках.
  setTemplateLocations: (templateId: string, locationIds: string[]) =>
    request(`${orgBase()}/checklist-templates/${templateId}/locations`, {
      method: 'PUT',
      body: JSON.stringify({ location_ids: locationIds }),
    }),
  // checklist_work_location: обратный срез — какие шаблоны привязаны к точке (карточка точки).
  // Удалённые шаблоны включены в выдачу (is_deleted: true) — админ должен видеть привязку.
  getLocationTemplates: async (locationId: string) => {
    const data = await request(`${orgBase()}/locations/${locationId}/checklist-templates`);
    return data?.items ?? [];
  },
  // checklist_work_location: запись обратного среза (PUT-семантика, полная замена набора).
  setLocationTemplates: (locationId: string, templateIds: string[]) =>
    request(`${orgBase()}/locations/${locationId}/checklist-templates`, {
      method: 'PUT',
      body: JSON.stringify({ template_ids: templateIds }),
    }),
  setTemplatePersonal: (templateId: string, userId: string, type: 'add' | 'remove') =>
    request(`${orgBase()}/checklist-templates/${templateId}/personal/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ type }),
    }),
  deleteTemplatePersonal: (templateId: string, userId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/personal/${userId}`, {
      method: 'DELETE',
    }),

  // --- Графики работы (work_schedules): назначения — калька с checklist_work_location ---
  // GET .../work-schedules/{id}/assignments → {role_ids, work_location_ids, personal_add,
  // personal_remove}. personal_* — массивы user_id (не member_id), как у чек-листов.
  getScheduleAssignments: (scheduleId: string) =>
    request(`${orgBase()}/work-schedules/${scheduleId}/assignments`),
  setScheduleRoles: (scheduleId: string, roleIds: string[]) =>
    request(`${orgBase()}/work-schedules/${scheduleId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ role_ids: roleIds }),
    }),
  // Пустой массив снимает все привязки — график снова действует на всех точках.
  setScheduleLocations: (scheduleId: string, locationIds: string[]) =>
    request(`${orgBase()}/work-schedules/${scheduleId}/locations`, {
      method: 'PUT',
      body: JSON.stringify({ work_location_ids: locationIds }),
    }),
  // Личные переопределения сотрудника: контракт бэка заменяет ВЕСЬ список переопределений
  // сотрудника по ВСЕМ графикам сразу (PUT .../members/{user_id}/schedule-overrides), в отличие
  // от чек-листов (там PUT/DELETE точечно на пару template↔user). Вызывающий компонент
  // (PersonalOverrides в workSchedules.tsx) обязан сам собрать полный список overrides по
  // сотруднику перед вызовом — см. комментарий там же.
  setMemberScheduleOverrides: (
    userId: string,
    overrides: { schedule_id: string; override_type: 'add' | 'remove' }[],
  ) =>
    request(`${orgBase()}/members/${userId}/schedule-overrides`, {
      method: 'PUT',
      body: JSON.stringify({ overrides }),
    }),

  // --- Смены: смена графика администратором (work_schedules R7) ---
  // PATCH .../shifts/{shift_id}/schedule {work_schedule_id: uuid|null} → обновлённый ShiftResponse.
  changeShiftSchedule: (shiftId: string, scheduleId: string | null) =>
    request(`${orgBase()}/shifts/${shiftId}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({ work_schedule_id: scheduleId }),
    }),
  // Восстановить удалённую смену (manual_time_entry A4): POST .../shifts/{id}/restore →
  // обновлённый ShiftResponse. Не CRUD-глагол dataProvider — отдельный кастомный метод,
  // как changeShiftSchedule.
  restoreShift: (shiftId: string) =>
    request(`${orgBase()}/shifts/${shiftId}/restore`, { method: 'POST' }),

  // --- Штрафы, шаблоны штрафов, начисления (unified_soft_delete): восстановление ---
  // Удаление у всех троих остаётся общим dataProvider.delete (deleteOnePath); раньше обратного
  // перехода не было ни у одного (backend.md, «сейчас снятый штраф или отменённое начисление
  // вернуть невозможно»).
  restorePenaltyTemplate: (templateId: string) =>
    request(`${orgBase()}/penalty-templates/${templateId}/restore`, { method: 'POST' }),
  restorePenalty: (penaltyId: string) =>
    request(`${orgBase()}/penalties/${penaltyId}/restore`, { method: 'POST' }),
  restoreAdjustment: (adjustmentId: string) =>
    request(`${orgBase()}/adjustments/${adjustmentId}/restore`, { method: 'POST' }),

  // --- Заявки на переработку (shift_overtime_requests): рассмотрение org_admin'ом ---
  // PATCH .../overtime-requests/{id} {status: 'approved'|'rejected', review_comment?}.
  reviewOvertimeRequest: (
    requestId: string,
    body: { status: 'approved' | 'rejected'; review_comment: string | null },
  ) =>
    request(`${orgBase()}/overtime-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // --- Ставки участника (payroll): вложенный CRUD по member_id (id записи участника) ---
  getMemberRates: async (memberId: string) => {
    const data = await request(`${orgBase()}/members/${memberId}/rates`);
    return data?.items ?? [];
  },
  createMemberRate: (memberId: string, body: Record<string, unknown>) =>
    request(`${orgBase()}/members/${memberId}/rates`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMemberRate: (memberId: string, rateId: string, body: Record<string, unknown>) =>
    request(`${orgBase()}/members/${memberId}/rates/${rateId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMemberRate: (memberId: string, rateId: string) =>
    request(`${orgBase()}/members/${memberId}/rates/${rateId}`, { method: 'DELETE' }),
  // Отчёт «сколько кому заплатить»; границы — UTC ISO, date_to включительно (как в date_filters).
  // granularity != none → у каждого items[] приходит breakdown[] (детализация по корзинам).
  getPayroll: (query: PayrollQuery) => {
    const qs = buildPayrollQuery(query).toString();
    return request(`${orgBase()}/payroll${qs ? `?${qs}` : ''}`);
  },
  // Экспорт payroll в .xlsx (бинарный ответ, retry-after-refresh на 401 — см. fetchPayrollExport).
  exportPayroll: (query: PayrollQuery) => fetchPayrollExport(query),

  // --- Файловое хранилище (file_storage): общий слой для фич-потребителей ---
  // POST /files (multipart) → { id, url, ... }. organization_id обязателен для org-категорий,
  // для персональных (avatar/other) — не шлём. Возвращает свежий presigned URL (хранить id).
  uploadFile: (file: File, category: string, organizationId?: string | null) => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    if (organizationId) form.append('organization_id', organizationId);
    return request('/files', { method: 'POST', body: form });
  },
  // GET /files/{id} — метаданные + свежий presigned URL (обновить протухший).
  getFile: (fileId: string) => request(`/files/${fileId}`),
  // DELETE /files/{id} — uploader/org admin/owner/super_admin; привязанный → FILE_IN_USE (409).
  deleteFile: (fileId: string) => request(`/files/${fileId}`, { method: 'DELETE' }),

  // --- База знаний (knowledge_base): кастомные методы вне стандартного CRUD ---
  // Переупорядочивание сиблингов (M6): PUT .../reorder, body {parent_id?, ordered_ids}.
  reorderKnowledge: async (input: ReorderInput): Promise<{ data: null }> => {
    await request(`${orgBase()}/knowledge/nodes/reorder`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return { data: null };
  },
  // ACL узла (A1): GET .../{id}/access → {all_members, rules[]}.
  getKnowledgeAccess: (nodeId: string): Promise<AccessState> =>
    request(`${orgBase()}/knowledge/nodes/${nodeId}/access`),
  // Замена ACL узла bulk'ом (A2): PUT .../{id}/access → как GET access.
  putKnowledgeAccess: (nodeId: string, input: AccessState): Promise<AccessState> =>
    request(`${orgBase()}/knowledge/nodes/${nodeId}/access`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  // Загрузка файла/изображения базы знаний: POST /files, category=knowledge_base,
  // organization_id = текущая org → FileResponse (id + presigned url). url не персистим в content.
  uploadKnowledgeFile: (file: File): Promise<FileUploadResult> => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', 'knowledge_base');
    const orgId = getCurrentOrgId();
    if (orgId) form.append('organization_id', orgId);
    return request('/files', { method: 'POST', body: form });
  },
  // Свежий presigned url по file_id (дотягивание протухшей/null ссылки на чтении).
  getKnowledgeFile: (fileId: string): Promise<FileUploadResult> => request(`/files/${fileId}`),

  // --- Тестирование сотрудников (employee_tests) ---
  // Сухая проверка тела шаблона (диалог «Импорт из JSON», кнопка «Проверить»): POST
  // .../test-templates/validate → {valid, question_count, total_points}. Тело шлём как есть
  // (то же, что POST .../test-templates, см. import-format.md) — без прогона через
  // buildTestTemplateBody, чтобы не терять/не переинтерпретировать поля произвольного JSON.
  validateTestTemplate: (
    body: unknown,
  ): Promise<{ valid: boolean; question_count: number; total_points: number }> =>
    request(`${orgBase()}/test-templates/validate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Создание шаблона из «сырого» JSON (диалог «Импорт из JSON», кнопка «Создать») —
  // POST .../test-templates с телом как есть (не через конструктор-форму).
  importTestTemplate: (body: unknown) =>
    request(`${orgBase()}/test-templates`, { method: 'POST', body: JSON.stringify(body) }),
  // Восстановление удалённого шаблона (unified_soft_delete, список тестов, действие строки).
  // Удаление — общий dataProvider.delete('test-templates', ...) (deleteOnePath).
  restoreTestTemplate: (templateId: string) =>
    request(`${orgBase()}/test-templates/${templateId}/restore`, { method: 'POST' }),
  // Назначение теста сотрудникам (диалог «Назначить»): POST .../assignments
  // {member_ids, due_at} → {items, created, updated}.
  assignTestTemplate: (
    templateId: string,
    body: { member_ids: string[]; due_at: string | null },
  ): Promise<{ items: unknown[]; created: number; updated: number }> =>
    request(`${orgBase()}/test-templates/${templateId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Деталь попытки для админа (реестр «Результаты тестов» → детали попытки):
  // GET .../test-attempts/{id} → TestAttemptReview.
  getTestAttempt: (attemptId: string) => request(`${orgBase()}/test-attempts/${attemptId}`),
};
