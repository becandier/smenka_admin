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
const LAYOUT_C = { v: 1, order: ['employee', 'worked'], hidden: [] };

// Ответы сервера по контракту backend.md.
const loaded = (preferences: Record<string, unknown>) => ({ preferences });
const saved = (key: string, value: unknown) => ({ key, value, updated_at: '2026-11-09T12:00:00Z' });
// Заглушка обёртки useDataProvider (ra-core) после разлогина по 401.
const LOGOUT_STUB = { data: {} };

const makeApi = (preferences: Record<string, unknown> = {}) => ({
  load: vi.fn<PreferencesApi['load']>(() => Promise.resolve(loaded(preferences))),
  save: vi.fn<PreferencesApi['save']>((key, value) => Promise.resolve(saved(key, value))),
  remove: vi.fn<PreferencesApi['remove']>(() => Promise.resolve({ deleted: 1 })),
});

const RETRY = [5000, 15000, 60000];

const makeStore = (
  api: ReturnType<typeof makeApi>,
  extra: { storage?: LocalStorageLike; onSaveError?: () => void } = {},
) =>
  new TableLayoutStore({
    api,
    storage: extra.storage ?? memoryStorage(),
    onSaveError: extra.onSaveError ?? vi.fn(),
    retryDelaysMs: RETRY,
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
    const store = makeStore(api, { storage });

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
    const load = deferred<unknown>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = makeStore(api, { storage });

    store.setUser('u2');
    expect(store.get('members')).toBeUndefined();

    load.resolve(loaded({}));
    await vi.runAllTimersAsync();
    expect(store.get('members')).toBeUndefined();
    expect(JSON.parse(storage.data[LOCAL_STORAGE_KEY]).userId).toBe('u2');
  });

  it('при смене пользователя раскладки прошлого сбрасываются, запоздалый ответ отбрасывается', async () => {
    const first = deferred<unknown>();
    const api = {
      ...makeApi(),
      load: vi
        .fn<PreferencesApi['load']>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => Promise.resolve(loaded({}))),
    };
    const store = makeStore(api);

    store.setUser('u1');
    store.setUser('u2');
    first.resolve(loaded({ 'admin.table.members': LAYOUT_B }));
    await vi.runAllTimersAsync();
    expect(store.get('members')).toBeUndefined();
  });

  it('ошибка загрузки — молча, работаем по локальной копии', async () => {
    const storage = memoryStorage({
      [LOCAL_STORAGE_KEY]: JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } }),
    });
    const api = { ...makeApi(), load: vi.fn(() => Promise.reject(new Error('500'))) };
    const onSaveError = vi.fn();
    const store = makeStore(api, { storage, onSaveError });

    store.setUser('u1');
    await vi.runAllTimersAsync();
    expect(store.get('members')).toEqual(LAYOUT_B);
    expect(onSaveError).not.toHaveBeenCalled();
  });

  it('изменение, сделанное до ответа загрузки, ответом не затирается', async () => {
    const load = deferred<unknown>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = makeStore(api);

    store.setUser('u1');
    store.set('members', LAYOUT_B);
    load.resolve(loaded({ 'admin.table.members': LAYOUT_A, 'admin.table.roles': LAYOUT_A }));
    await vi.runAllTimersAsync();
    expect(store.get('members')).toEqual(LAYOUT_B);
    expect(store.get('roles')).toEqual(LAYOUT_A);
  });

  // Пункт 2 ревью: PUT успел вернуться раньше медленного GET — снимок GET старше изменения.
  it('поздний ответ загрузки не затирает изменение, запись которого уже прошла', async () => {
    const storage = memoryStorage();
    const load = deferred<unknown>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = makeStore(api, { storage });

    store.setUser('u1');
    store.set('org-shifts', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledWith('admin.table.org-shifts', LAYOUT_B);

    load.resolve(loaded({ 'admin.table.org-shifts': LAYOUT_A, 'admin.table.roles': LAYOUT_C }));
    await vi.runAllTimersAsync();
    expect(store.get('org-shifts')).toEqual(LAYOUT_B);
    expect(store.get('roles')).toEqual(LAYOUT_C);
    expect(JSON.parse(storage.data[LOCAL_STORAGE_KEY]).layouts['org-shifts']).toEqual(LAYOUT_B);
  });

  it('то же для сброса: удалённая раскладка не возвращается поздним ответом', async () => {
    const load = deferred<unknown>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = makeStore(api);

    store.setUser('u1');
    store.set('org-shifts', null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.remove).toHaveBeenCalledWith('admin.table.org-shifts');

    load.resolve(loaded({ 'admin.table.org-shifts': LAYOUT_A }));
    await vi.runAllTimersAsync();
    expect(store.get('org-shifts')).toBeUndefined();
  });

  // Пункт 4 ревью: после разлогина по 401 обёртка ra-core отдаёт {data: {}} вместо ошибки.
  it('заглушка вместо ответа загрузки не стирает локальную копию', async () => {
    const initial = JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } });
    const storage = memoryStorage({ [LOCAL_STORAGE_KEY]: initial });
    const api = { ...makeApi(), load: vi.fn(() => Promise.resolve(LOGOUT_STUB)) };
    const store = makeStore(api, { storage });

    store.setUser('u1');
    await vi.runAllTimersAsync();
    expect(store.get('members')).toEqual(LAYOUT_B);
    expect(storage.data[LOCAL_STORAGE_KEY]).toBe(initial);
  });

  it.each([null, undefined, {}, { preferences: null }, { preferences: [1] }])(
    'ответ загрузки %j без объекта настроек игнорируется',
    async (response) => {
      const initial = JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } });
      const storage = memoryStorage({ [LOCAL_STORAGE_KEY]: initial });
      const api = { ...makeApi(), load: vi.fn(() => Promise.resolve(response)) };
      const store = makeStore(api, { storage });

      store.setUser('u1');
      await vi.runAllTimersAsync();
      expect(store.get('members')).toEqual(LAYOUT_B);
      expect(storage.data[LOCAL_STORAGE_KEY]).toBe(initial);
    },
  );
});

describe('TableLayoutStore: запись', () => {
  it('серия изменений одной таблицы склеивается в один PUT с последним значением', async () => {
    const api = makeApi();
    const store = makeStore(api);
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
    const store = makeStore(api);
    store.setUser('u1');
    store.set('org-shifts', LAYOUT_A);
    store.set('members', LAYOUT_B);
    await vi.runAllTimersAsync();
    expect(api.save).toHaveBeenCalledTimes(2);
  });

  it('стандартный вид (null) — DELETE ключа, записи больше нет', async () => {
    const api = makeApi({ 'admin.table.org-shifts': LAYOUT_A });
    const store = makeStore(api);
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', null);
    expect(store.get('org-shifts')).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith('admin.table.org-shifts');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('без пользователя изменения не принимаются', () => {
    const store = makeStore(makeApi());
    store.set('org-shifts', LAYOUT_A);
    expect(store.get('org-shifts')).toBeUndefined();
  });

  it('уведомляет подписчиков об изменениях', () => {
    const store = makeStore(makeApi());
    const listener = vi.fn();
    store.subscribe(listener);
    store.setUser('u1');
    store.set('org-shifts', LAYOUT_A);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

// Пункт 1 ревью: несохранённая таблица уходит повторно без действий пользователя с ней.
describe('TableLayoutStore: повтор неудачной записи', () => {
  const failingFor = (api: ReturnType<typeof makeApi>, tableId: string, times: number) => {
    let left = times;
    api.save.mockImplementation((key, value) => {
      if (key === `admin.table.${tableId}` && left > 0) {
        left -= 1;
        return Promise.reject(new Error('500'));
      }
      return Promise.resolve(saved(key, value));
    });
  };

  const savesOf = (api: ReturnType<typeof makeApi>, tableId: string) =>
    api.save.mock.calls.filter(([key]) => key === `admin.table.${tableId}`);

  it('уходит повторно после успешной записи другой таблицы', async () => {
    const api = makeApi();
    failingFor(api, 'org-shifts', 1);
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.get('org-shifts')).toEqual(LAYOUT_A);
    expect(onSaveError).toHaveBeenCalledTimes(1);

    // Пользователь меняет «Сотрудников» раньше автоповтора: после её записи — и «Журнал смен».
    store.set('members', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(savesOf(api, 'members')).toHaveLength(1);
    expect(savesOf(api, 'org-shifts')).toHaveLength(2);
    expect(savesOf(api, 'org-shifts')[1]).toEqual(['admin.table.org-shifts', LAYOUT_A]);
    expect(onSaveError).toHaveBeenCalledTimes(1);
  });

  it('уходит повторно при изменении любой таблицы, даже если та тоже не записалась', async () => {
    const api = makeApi();
    api.save.mockRejectedValue(new Error('500'));
    const store = makeStore(api);
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(savesOf(api, 'org-shifts')).toHaveLength(1);

    store.set('members', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(savesOf(api, 'members')).toHaveLength(1);
    expect(savesOf(api, 'org-shifts')).toHaveLength(2);
  });

  it('автоповтор: до трёх попыток с растущей паузой, уведомление одно на серию', async () => {
    const api = makeApi();
    api.save.mockRejectedValue(new Error('500'));
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4999);
    expect(api.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(api.save).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.save).toHaveBeenCalledTimes(4);
    // Попытки исчерпаны — дальше тихо, до следующего изменения или успешной записи.
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(api.save).toHaveBeenCalledTimes(4);
    expect(onSaveError).toHaveBeenCalledTimes(1);
    expect(store.get('org-shifts')).toEqual(LAYOUT_A);
  });

  it('автоповтор удался — таблица сохранена, следующая серия ошибок снова уведомит', async () => {
    const api = makeApi();
    failingFor(api, 'org-shifts', 1);
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(savesOf(api, 'org-shifts')).toHaveLength(2);
    // Больше повторов нет: таблица сохранена.
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(savesOf(api, 'org-shifts')).toHaveLength(2);
    expect(onSaveError).toHaveBeenCalledTimes(1);

    api.save.mockRejectedValueOnce(new Error('500'));
    store.set('members', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSaveError).toHaveBeenCalledTimes(2);
  });

  it('повтор после неудачного сброса тоже уходит DELETE', async () => {
    const api = makeApi({ 'admin.table.org-shifts': LAYOUT_A });
    api.remove.mockRejectedValueOnce(new Error('500'));
    const store = makeStore(api);
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', null);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  // Пункт 4 ревью: заглушка ra-core вместо ответа записи — не успех.
  it.each([
    ['PUT', LAYOUT_A],
    ['DELETE', null],
  ])('заглушка вместо ответа %s — запись не засчитана', async (_method, value) => {
    const api = makeApi({ 'admin.table.org-shifts': LAYOUT_C });
    api.save.mockResolvedValueOnce(LOGOUT_STUB);
    api.remove.mockResolvedValueOnce(LOGOUT_STUB);
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', value);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSaveError).toHaveBeenCalledTimes(1);
    // Таблица осталась несохранённой и уходит автоповтором.
    await vi.advanceTimersByTimeAsync(5000);
    const calls = value === null ? api.remove.mock.calls : api.save.mock.calls;
    expect(calls).toHaveLength(2);
  });
});

// Пункт 3 ревью: на один ключ одновременно не больше одного запроса.
describe('TableLayoutStore: порядок запросов одного ключа', () => {
  it('сброс во время медленного PUT уходит после него, промежуточные значения схлопываются', async () => {
    const api = makeApi();
    const firstPut = deferred<unknown>();
    api.save.mockImplementationOnce(() => firstPut.promise);
    const store = makeStore(api);
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledTimes(1);

    // PUT в пути больше секунды: пользователь ещё раз меняет раскладку, затем «Сбросить».
    store.set('org-shifts', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);
    store.set('org-shifts', null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.remove).not.toHaveBeenCalled();

    firstPut.resolve(saved('admin.table.org-shifts', LAYOUT_A));
    await vi.runAllTimersAsync();
    // Одна запись с последним значением: B схлопнулось, ушёл только DELETE.
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(store.get('org-shifts')).toBeUndefined();
  });

  it('ошибка устаревшего запроса не уведомляет, если более новая запись ключа прошла', async () => {
    const api = makeApi();
    const firstPut = deferred<unknown>();
    api.save.mockImplementationOnce(() => firstPut.promise);
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    store.set('org-shifts', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(1000);

    firstPut.reject(new Error('timeout'));
    await vi.runAllTimersAsync();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith('admin.table.org-shifts', LAYOUT_B);
    expect(onSaveError).not.toHaveBeenCalled();
    // Сохранено — автоповторов нет.
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(api.save).toHaveBeenCalledTimes(2);
  });

  it('ошибка устаревшего запроса не уведомляет, пока новое изменение ждёт задержки', async () => {
    const api = makeApi();
    const firstPut = deferred<unknown>();
    api.save.mockImplementationOnce(() => firstPut.promise);
    const onSaveError = vi.fn();
    const store = makeStore(api, { onSaveError });
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    store.set('org-shifts', LAYOUT_B);
    firstPut.reject(new Error('timeout'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSaveError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenLastCalledWith('admin.table.org-shifts', LAYOUT_B);
    expect(onSaveError).not.toHaveBeenCalled();
  });
});

// После dispose() (размонтирование Layout при разлогине) хранилище ничего не делает.
describe('TableLayoutStore: dispose', () => {
  it.each([
    ['ошибка', () => Promise.reject(new Error('401'))],
    ['заглушка {data: {}}', () => Promise.resolve(LOGOUT_STUB)],
  ])(
    'запись в пути завершилась после dispose (%s) — без уведомления и повторов',
    async (_name, outcome) => {
      const api = makeApi();
      const put = deferred<unknown>();
      api.save.mockImplementationOnce(() => put.promise);
      const onSaveError = vi.fn();
      const store = makeStore(api, { onSaveError });
      store.setUser('u1');
      await vi.runAllTimersAsync();

      store.set('org-shifts', LAYOUT_A);
      store.set('members', LAYOUT_B);
      await vi.advanceTimersByTimeAsync(1000);
      const callsBefore = api.save.mock.calls.length + api.remove.mock.calls.length;

      store.dispose();
      outcome().then(put.resolve, put.reject);
      await vi.advanceTimersByTimeAsync(2 * 60000);

      expect(onSaveError).not.toHaveBeenCalled();
      expect(api.save.mock.calls.length + api.remove.mock.calls.length).toBe(callsBefore);
      expect(api.load).toHaveBeenCalledTimes(1);
    },
  );

  it('отложенная запись не уходит после dispose', async () => {
    const api = makeApi();
    const store = makeStore(api);
    store.setUser('u1');
    await vi.runAllTimersAsync();

    store.set('org-shifts', LAYOUT_A);
    store.dispose();
    store.set('org-shifts', LAYOUT_B);
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('ответ загрузки после dispose не трогает localStorage и слушателей', async () => {
    const storage = memoryStorage();
    const load = deferred<unknown>();
    const api = { ...makeApi(), load: vi.fn(() => load.promise) };
    const store = makeStore(api, { storage });
    store.setUser('u1');

    store.dispose();
    // Тем временем вошёл другой пользователь — его локальная копия не должна пострадать.
    const otherCopy = JSON.stringify({ userId: 'u2', layouts: { members: LAYOUT_C } });
    storage.data[LOCAL_STORAGE_KEY] = otherCopy;
    const listener = vi.fn();
    store.subscribe(listener);

    load.resolve(loaded({ 'admin.table.org-shifts': LAYOUT_A }));
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(storage.data[LOCAL_STORAGE_KEY]).toBe(otherCopy);
    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose, затем setUser с тем же id — хранилище поднимается заново (StrictMode)', async () => {
    const storage = memoryStorage({
      [LOCAL_STORAGE_KEY]: JSON.stringify({ userId: 'u1', layouts: { members: LAYOUT_B } }),
    });
    const api = makeApi({ 'admin.table.members': LAYOUT_B });
    const store = makeStore(api, { storage });

    store.setUser('u1');
    store.dispose();
    store.setUser('u1');
    expect(store.get('members')).toEqual(LAYOUT_B);
    await vi.runAllTimersAsync();
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(store.get('members')).toEqual(LAYOUT_B);

    store.set('org-shifts', LAYOUT_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledWith('admin.table.org-shifts', LAYOUT_A);
    expect(JSON.parse(storage.data[LOCAL_STORAGE_KEY]).layouts['org-shifts']).toEqual(LAYOUT_A);
  });
});
