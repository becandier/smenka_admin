import { DataProvider, GetListParams, HttpError } from 'react-admin';
import { API_BASE_URL, getAccessToken, getCurrentOrgId } from '../config';
import {
  INVALID_RANGE_MESSAGE,
  isDayRangeInvalid,
  localDayEndToUtcIso,
  localDayStartToUtcIso,
} from '../utils/dates';
import { parseRublesToMinor } from '../utils/format';
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

// Единая точка запроса: Bearer + разворачивание конверта {data, error}.
const request = async (path: string, options: RequestInit = {}): Promise<any> => {
  const token = getAccessToken();
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');
  // FormData (загрузка файла) — Content-Type с boundary браузер выставляет сам; не трогаем.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
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
        if (v?.field) body.errors[v.field] = v.message;
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
    default:
      throw new Error(`Удаление не поддержано для ресурса: ${resource}`);
  }
};

// member → добавляем плоский custom_role_id для SelectInput'а в форме.
const mapMember = (m: any): any => ({ ...m, custom_role_id: m?.custom_role?.id ?? null });

// penalty-template → плоское amount_rub (рубли) для NumberInput'а формы; обратную
// конвертацию в amount_minor делает create/update (деньги хранятся в копейках).
const mapTemplate = (t: any): any => ({
  ...t,
  amount_rub: typeof t?.amount_minor === 'number' ? t.amount_minor / 100 : null,
});

const loadClient = async (resource: string): Promise<any[]> => {
  const data = await request(clientListPath(resource));
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

// Query-строка из непустых значений (для кастомных методов вне GetListParams).
const toSearch = (query: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  return search.toString();
};

export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    if (PLATFORM_SERVER.has(resource)) {
      const path = resource === 'users' ? '/admin/users' : '/admin/organizations';
      const data = await request(`${path}?${buildQuery(params, { defaultSort: 'created_at' })}`);
      return { data: data?.items ?? [], total: data?.total ?? 0 };
    }
    if (resource === 'org-shifts') {
      // only_late — булев тумблер «Только опоздавшие»: снятое состояние (false) не должно
      // становиться сетевым фильтром (контракт знает только `only_late=true` как включённый
      // фильтр) — вырезаем его из filter, а не шлём buildQuery'ем как есть (тот включает
      // булевы значения безусловно, включая false).
      const filter = { ...(params.filter ?? {}) } as Record<string, unknown>;
      if (filter.only_late === false) delete filter.only_late;
      return orgServerList(
        { ...params, filter },
        {
          path: 'shifts',
          defaultSort: 'started_at',
          // checklists — состояние чек-листов смены (none/all_completed/has_incomplete/
          // required_incomplete), см. checklist_reports/backend.md. only_late/work_schedule_id/
          // has_overtime — work_schedules/backend.md, «Фильтры в списке смен организации».
          filterKeys: [
            'user_id',
            'status',
            'date_from',
            'date_to',
            'checklists',
            'only_late',
            'work_schedule_id',
            'has_overtime',
          ],
        },
      );
    }
    if (resource === 'work-schedules') {
      // include_archived — параметр запроса (не поле записи): выносим из filter, иначе
      // clientPaginate попытался бы сверять его со значениями строк и обнулил бы список.
      if (!getCurrentOrgId()) return { data: [], total: 0 };
      const filter = { ...(params.filter ?? {}) } as Record<string, unknown>;
      const includeArchived = filter.include_archived === true;
      delete filter.include_archived;
      const data = await request(`${orgBase()}/work-schedules?include_archived=${includeArchived}`);
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
      return orgServerList(params, {
        path: 'penalties',
        defaultSort: 'occurred_at',
        filterKeys: ['member_id', 'shift_id', 'date_from', 'date_to'],
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
      return clientPaginate(await loadClient(resource), params);
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
      // деталь чужой орг-смены: GET /organizations/{org}/shifts/{shift_id}
      return { data: await request(`${orgBase()}/shifts/${id}`) };
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
    if (resource === 'knowledge/nodes') {
      // Создание узла (M1): тело {parent_id?, kind, title, icon?, position?}.
      return {
        data: await request(`${orgBase()}/knowledge/nodes`, {
          method: 'POST',
          body: JSON.stringify(d),
        }),
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
      for (const k of ['name', 'start_time', 'end_time', 'is_archived']) {
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
      // display_name (member_display_name): PATCH .../members/{userId} c {display_name}.
      // Сравниваем нормализованные значения (пустая строка формы ≡ null), иначе пустой
      // TextInput слал бы лишний PATCH и лишнюю аудит-запись «сброс на то же самое».
      // Очистка поля шлём как null — бэк сам сбрасывает на настоящее имя.
      if ('display_name' in data) {
        const nextDisplayName = normalizeDisplayName(data.display_name);
        const prevDisplayName = normalizeDisplayName(previousData?.display_name);
        if (nextDisplayName !== prevDisplayName) {
          try {
            result = await request(`${orgBase()}/members/${userId}`, {
              method: 'PATCH',
              body: JSON.stringify({ display_name: nextDisplayName }),
            });
          } catch (e: any) {
            // INVALID_DISPLAY_NAME — не VALIDATION_ERROR, поэтому request() не разложил
            // его в body.errors сам; мапим здесь в ошибку поля формы (admin.md, «Состояния
            // и ошибки»: показать понятное сообщение у поля, а не общий тост).
            if (e?.body?.code === 'INVALID_DISPLAY_NAME') {
              throw new HttpError(e.message, e.status ?? 400, {
                ...e.body,
                errors: { display_name: e.message },
              });
            }
            throw e;
          }
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
    if (resource === 'knowledge/nodes') {
      // Partial PATCH (M4): тело = переданные ключи (title?/icon?/all_members?/content?/
      // parent_id?/position?). Ответ — NodeDetailResponse с обогащённым content.
      const updated = await request(`${orgBase()}/knowledge/nodes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return { data: updated ?? { ...data, id } };
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
  // Архивные шаблоны включены в выдачу (is_archived: true) — админ должен видеть привязку.
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
  // Экспорт payroll в .xlsx: бинарный ответ (НЕ конверт {data,error}). Ошибки до отдачи файла
  // приходят JSON-конвертом — распознаём по Content-Type и бросаем HttpError, как request().
  exportPayroll: async (query: PayrollQuery): Promise<{ blob: Blob; filename: string | null }> => {
    const token = getAccessToken();
    const headers = new Headers({
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json',
    });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const search = buildPayrollQuery(query);
    search.set('format', 'xlsx');
    const res = await fetch(`${API_BASE_URL}${orgBase()}/payroll/export?${search.toString()}`, {
      headers,
    });
    const contentType = res.headers.get('Content-Type') ?? '';
    if (!res.ok || contentType.includes('application/json')) {
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
  },

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
};
