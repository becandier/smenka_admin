import { DataProvider, GetListParams, HttpError } from 'react-admin';
import { API_BASE_URL, getAccessToken, getCurrentOrgId } from '../config';
import {
  INVALID_RANGE_MESSAGE,
  isDayRangeInvalid,
  localDayEndToUtcIso,
  localDayStartToUtcIso,
} from '../utils/dates';

// Категории ресурсов:
//  - PLATFORM_SERVER — серверная пагинация через /admin/* ({items,total,limit,offset}).
//  - org-shifts      — серверная пагинация через /organizations/{org}/shifts.
//  - ORG_CLIENT      — ограниченные org-списки: грузим целиком, режем/сортируем на клиенте.
const PLATFORM_SERVER = new Set(['users', 'organizations']);
const ORG_CLIENT = new Set(['members', 'roles', 'work-locations', 'checklist-templates']);

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
    default:
      throw new Error(`Удаление не поддержано для ресурса: ${resource}`);
  }
};

// member → добавляем плоский custom_role_id для SelectInput'а в форме.
const mapMember = (m: any): any => ({ ...m, custom_role_id: m?.custom_role?.id ?? null });

const loadClient = async (resource: string): Promise<any[]> => {
  const data = await request(clientListPath(resource));
  const items: any[] = data?.items ?? [];
  return resource === 'members' ? items.map(mapMember) : items;
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

// Окно орг-статистики: ровно один источник — period ЛИБО date_from/date_to (UTC ISO).
export interface OrgStatsQuery {
  period?: string;
  date_from?: string;
  date_to?: string;
}

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
      return orgServerList(params, {
        path: 'shifts',
        defaultSort: 'started_at',
        filterKeys: ['user_id', 'status', 'date_from', 'date_to'],
      });
    }
    if (resource === 'audit-logs') {
      return orgServerList(params, {
        path: 'audit-logs',
        defaultSort: 'created_at',
        filterKeys: ['action', 'actor_user_id', 'date_from', 'date_to'],
        withSort: false,
      });
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
      for (const k of [
        'geo_check_enabled',
        'auto_finish_hours',
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
      return { data: mapMember({ ...previousData, ...data, ...(result ?? {}) }) };
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
  getOrgStats: (query: OrgStatsQuery) => request(`${orgBase()}/stats?${toSearch({ ...query })}`),
  // Ротация инвайт-кода организации: POST /organizations/{org}/rotate-invite → { invite_code }.
  // org_id передаётся явно (страница работает с выбранной org, без orgBase-зависимости).
  rotateInviteCode: (orgId: string): Promise<{ invite_code: string } | null> =>
    request(`/organizations/${orgId}/rotate-invite`, { method: 'POST' }),
  getShiftChecklists: async (shiftId: string) => {
    const data = await request(`/shifts/${shiftId}/checklists`);
    return data?.items ?? [];
  },
  getShiftChecklistInstance: (shiftId: string, instanceId: string) =>
    request(`/shifts/${shiftId}/checklists/${instanceId}`),
  getTemplateAssignments: (templateId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/assignments`),
  addTemplateItem: (templateId: string, body: { text: string; is_required: boolean }) =>
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
  setTemplatePersonal: (templateId: string, userId: string, type: 'add' | 'remove') =>
    request(`${orgBase()}/checklist-templates/${templateId}/personal/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ type }),
    }),
  deleteTemplatePersonal: (templateId: string, userId: string) =>
    request(`${orgBase()}/checklist-templates/${templateId}/personal/${userId}`, {
      method: 'DELETE',
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
  getPayroll: (query: { date_from?: string; date_to?: string }) => {
    const qs = toSearch({ ...query });
    return request(`${orgBase()}/payroll${qs ? `?${qs}` : ''}`);
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
};
