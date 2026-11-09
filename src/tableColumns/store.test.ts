import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_STORAGE_KEY,
  TableLayoutStore,
  type LocalStorageLike,
  type PreferencesApi,
} from './store';

const memoryStorage = (
  initial: Record<string, string> = {},
): LocalStorageLike & {
  data: Record<string, string>;
} => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const LAYOUT_A = { v: 1, order: ['employee', 'status'], hidden: ['status'] };
const LAYOUT_B = { v: 1, order: ['employee', 'email'], hidden: [] };

const makeApi = (preferences: Record<string, unknown> = {}) => ({
  load: vi.fn<PreferencesApi['load']>(() => Promise.resolve(preferences)),
  save: vi.fn<PreferencesApi['save']>(() => Promise.resolve({})),
  remove: vi.fn<PreferencesApi['remove']>(() => Promise.resolve({ deleted: 1 })),
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TableLayoutStore: загрузка', () => {
  it('один GET по префиксу admin.table. на пользователя, ответ заменяет локальную копию', async () => {
    const storage = memoryStorage({
      [LOCAL_STORAGE_KEY]: JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } }),
    });
    const api = makeApi({ 'admin.table.org-shifts': LAYOUT_A });
    const store = new TableLayoutStore({ api, storage, onSaveError: vi.fn() });

    store.setUser('u1');
    // До ответа — локальная копия.
    expect(store.get('members')).toEqual(LAYOUT_B);
    await vi.runAllTimersAsync();

    expect(api.load).toHaveBeenCalledTimes(1);
    expect(api.load).toHaveBeenCalledWith('admin.table.');
    expect(store.get('org-shifts')).toEqual(LAYOUT_A);
    expect(store.get('members')).toBeUndefined();
    expect(JSON.parse(storage.data[LOCAL_STORAGE_KEY])).toEqual({
      userId: 'u1',
      layouts: { 'org-shifts': LAYOUT_A },
    });

    store.setUser('u1');
    await vi.runAllTimersAsync();
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it('локальная копия другого пользователя не применяется', async () => {
    const storage = memoryStorage({
      [LOCAL_STORAGE_KEY]: JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } }),
    });
    const load = deferred<Record<string, unknown>>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = new TableLayoutStore({ api, storage, onSaveError: vi.fn() });

    store.setUser('u2');
    expect(store.get('members')).toBeUndefined();

    load.resolve({});
    await vi.runAllTimersAsync();
    expect(store.get('members')).toBeUndefined();
    expect(JSON.parse(storage.data[LOCAL_STORAGE_KEY]).userId).toBe('u2');
  });

  it('при смене пользователя раскладки прошлого сбрасываются, запоздалый ответ отбрасывается', async () => {
    const first = deferred<Record<string, unknown>>();
    const api = {
      ...makeApi(),
      load: vi
        .fn<PreferencesApi['load']>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => Promise.resolve({})),
    };
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });

    store.setUser('u1');
    store.setUser('u2');
    first.resolve({ 'admin.table.members': LAYOUT_B });
    await vi.runAllTimersAsync();
    expect(store.get('members')).toBeUndefined();
  });

  it('ошибка загрузки — молча, работаем по локальной копии', async () => {
    const storage = memoryStorage({
      [LOCAL_STORAGE_KEY]: JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } }),
    });
    const api = { ...makeApi(), load: vi.fn(() => Promise.reject(new Error('500'))) };
    const onSaveError = vi.fn();
    const store = new TableLayoutStore({ api, storage, onSaveError });

    store.setUser('u1');
    await vi.runAllTimersAsync();
    expect(store.get('members')).toEqual(LAYOUT_B);
    expect(onSaveError).not.toHaveBeenCalled();
  });

  it('изменение, сделанное до ответа загрузки, ответом не затирается', async () => {
    const load = deferred<Record<string, unknown>>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });

    store.setUser('u1');
    store.set('members', LAYOUT_B);
    load.resolve({ 'admin.table.members': LAYOUT_A, 'admin.table.roles': LAYOUT_A });
    await vi.runAllTimersAsync();
    expect(store.get('members')).toEqual(LAYOUT_B);
    expect(store.get('roles')).toEqual(LAYOUT_A);
  });
});

describe('TableLayoutStore: запись', () => {
  it('серия изменений одной таблицы склеивается в один PUT с последним значением', async () => {
    const api = makeApi();
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', { v: 1, order: ['employee', 'a'], hidden: [] });
    vi.advanceTimersByTime(400);
    store.set('org-shifts', { v: 1, order: ['employee', 'b'], hidden: [] });
    vi.advanceTimersByTime(400);
    store.set('org-shifts', LAYOUT_A);
    // Изменение действует сразу, до записи.
    expect(store.get('org-shifts')).toEqual(LAYOUT_A);
    expect(api.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('admin.table.org-shifts', LAYOUT_A);
  });

  it('разные таблицы пишутся отдельными запросами', async () => {
    const api = makeApi();
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });
    store.setUser('u1');
    store.set('org-shifts', LAYOUT_A);
    store.set('members', LAYOUT_B);
    await vi.runAllTimersAsync();
    expect(api.save).toHaveBeenCalledTimes(2);
  });

  it('стандартный вид (null) — DELETE ключа, записи больше нет', async () => {
    const api = makeApi({ 'admin.table.org-shifts': LAYOUT_A });
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', null);
    expect(store.get('org-shifts')).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith('admin.table.org-shifts');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('ошибка записи: значение остаётся, уведомление одно до успешной записи', async () => {
    const api = makeApi();
    api.save.mockRejectedValue(new Error('500'));
    const onSaveError = vi.fn();
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError });
    store.setUser('u1');

    store.set('org-shifts', LAYOUT_A);
    await vi.runAllTimersAsync();
    expect(store.get('org-shifts')).toEqual(LAYOUT_A);
    expect(onSaveError).toHaveBeenCalledTimes(1);

    // Следующее изменение повторяет попытку; повторная ошибка нового уведомления не даёт.
    store.set('members', LAYOUT_B);
    await vi.runAllTimersAsync();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(onSaveError).toHaveBeenCalledTimes(1);

    // Запись удалась — следующая ошибка снова уведомит.
    api.save.mockResolvedValueOnce({});
    store.set('members', LAYOUT_A);
    await vi.runAllTimersAsync();
    store.set('members', LAYOUT_B);
    await vi.runAllTimersAsync();
    expect(onSaveError).toHaveBeenCalledTimes(2);
  });

  it('без пользователя изменения не принимаются', () => {
    const api = makeApi();
    const store = new TableLayoutStore({ api, storage: memoryStorage(), onSaveError: vi.fn() });
    store.set('org-shifts', LAYOUT_A);
    expect(store.get('org-shifts')).toBeUndefined();
  });

  it('уведомляет подписчиков об изменениях', () => {
    const store = new TableLayoutStore({
      api: makeApi(),
      storage: memoryStorage(),
      onSaveError: vi.fn(),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setUser('u1');
    store.set('org-shifts', LAYOUT_A);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
