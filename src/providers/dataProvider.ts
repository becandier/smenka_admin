import { DataProvider, HttpError } from 'react-admin';
import { API_BASE_URL, getAccessToken } from '../config';

// Маппинг ресурсов react-admin → пути бэка.
// Списки super_admin (/admin/*) отдают { data: { items, total, limit, offset } }.
const RESOURCES: Record<string, { list: string; one: (id: string) => string }> = {
  users: { list: '/admin/users', one: (id) => `/admin/users/${id}` },
  // деталь организации берём из существующего org-эндпоинта (super_admin имеет сквозной доступ)
  organizations: { list: '/admin/organizations', one: (id) => `/organizations/${id}` },
};

const endpoint = (resource: string) => {
  const cfg = RESOURCES[resource];
  if (!cfg) throw new Error(`Неизвестный ресурс: ${resource}`);
  return cfg;
};

// Единая точка запроса: Bearer + разворачивание конверта {data, error}.
const request = async (path: string, options: RequestInit = {}): Promise<any> => {
  const token = getAccessToken();
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || (json && json.error)) {
    const err = json?.error;
    throw new HttpError(err?.message ?? res.statusText ?? 'Ошибка запроса', res.status, err);
  }
  return json ? json.data : null;
};

const buildListQuery = (params: any): string => {
  const { page, perPage } = params.pagination ?? { page: 1, perPage: 25 };
  const { field, order } = params.sort ?? { field: 'created_at', order: 'DESC' };
  const query = new URLSearchParams({
    limit: String(perPage),
    offset: String((page - 1) * perPage),
    sort: field,
    order,
  });
  Object.entries(params.filter ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
};

const notImplemented = async (): Promise<never> => {
  throw new Error('Метод не реализован в каркасе админки');
};

export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const data = await request(`${endpoint(resource).list}?${buildListQuery(params)}`);
    return { data: data?.items ?? [], total: data?.total ?? 0 };
  },

  getOne: async (resource, params) => {
    const data = await request(endpoint(resource).one(String(params.id)));
    return { data };
  },

  getMany: async (resource, params) => {
    const data = await Promise.all(
      params.ids.map((id) => request(endpoint(resource).one(String(id)))),
    );
    return { data };
  },

  update: async (resource, params) => {
    if (resource === 'users') {
      const data = await request(`/admin/users/${params.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: params.data.role }),
      });
      return { data: data ?? params.data };
    }
    return notImplemented();
  },

  create: async (resource, params) => {
    if (resource === 'organizations') {
      const data = await request('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: params.data.name }),
      });
      return { data };
    }
    return notImplemented();
  },

  getManyReference: notImplemented,
  updateMany: notImplemented,
  delete: notImplemented,
  deleteMany: notImplemented,
};
