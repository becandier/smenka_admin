// Хранилище раскладок столбцов (table_column_settings/admin.md, «Синхронизация с сервером»).
//
// Без React: держит сохранённые значения раскладок текущего пользователя по tableId,
// синхронизирует их с сервером (/users/me/preferences) и с локальной копией в браузере.
//
// - Загрузка: один раз на пользователя (setUser) — GET по префиксу admin.table.; UI её не ждёт,
//   до ответа работает локальная копия. Ответ применяется, только если в нём есть объект
//   настроек ({preferences: {...}}); иначе — как ошибка загрузки (молча, локальная копия не
//   меняется). Таблицы, изменённые пользователем после старта загрузки, ответ не трогает —
//   успела их запись завершиться или нет.
// - Запись: изменение применяется сразу, на сервер уходит через delayMs после последнего
//   изменения этой таблицы (серия шагов перетаскивания → один PUT). null → DELETE ключа.
//   На один ключ одновременно не больше одного запроса: следующий стартует после текущего и
//   несёт последнее значение (промежуточные схлопываются). Запись успешна, только если пришёл
//   ответ сервера (у PUT есть key, у DELETE — deleted), а не заглушка ra-core после разлогина.
// - Ошибка записи: локальное значение остаётся, таблица помечается несохранённой и уходит
//   повторно сама — после следующей успешной записи любой таблицы, при следующем изменении
//   любой таблицы и автоповтором с растущей паузой (retryDelaysMs). Уведомление onSaveError —
//   одно на серию: снова покажется, только когда все таблицы сохранились и запись снова упала.
//   Ошибка устаревшего запроса не уведомляет, если за ним уже стоит более новая запись ключа.
// - Локальная копия помечена id пользователя и чужому пользователю не применяется.

export const PREFERENCE_PREFIX = 'admin.table.';
export const LOCAL_STORAGE_KEY = 'smenka.tableLayouts';
export const SAVE_DELAY_MS = 1000;
export const RETRY_DELAYS_MS: readonly number[] = [5000, 15000, 60000];

// Методы dataProvider; ответы — как пришли (их форма проверяется здесь).
export interface PreferencesApi {
  load: (prefix: string) => Promise<unknown>;
  save: (key: string, value: unknown) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
}

export type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface TableLayoutStoreOptions {
  api: PreferencesApi;
  storage: LocalStorageLike | null;
  onSaveError: () => void;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
}

type Layouts = Record<string, unknown>;
type Timer = ReturnType<typeof setTimeout>;

interface LocalCopy {
  userId: string;
  layouts: Layouts;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSaveResponse = (value: unknown): boolean =>
  isRecord(value) && typeof value.key === 'string';

const isDeleteResponse = (value: unknown): boolean =>
  isRecord(value) && typeof value.deleted === 'number';

export class TableLayoutStore {
  private userId: string | null = null;
  private layouts: Layouts = {};
  // Таблицы, значение которых сервер ещё не подтвердил.
  private readonly unsaved = new Set<string>();
  // Таблицы, изменённые пользователем после старта загрузки: её ответ их не трогает.
  private readonly edited = new Set<string>();
  // Номер последнего изменения таблицы: по нему видно, что запрос нёс устаревшее значение.
  private readonly versions = new Map<string, number>();
  private readonly debounce = new Map<string, Timer>();
  private readonly inFlight = new Set<string>();
  // Ключи, которые нужно записать ещё раз сразу после завершения текущего запроса.
  private readonly queued = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private retryTimer: Timer | null = null;
  private retryAttempt = 0;
  // Растёт при смене пользователя: ответы, начатые для прошлого пользователя, отбрасываются.
  private generation = 0;
  private errorShown = false;
  private readonly delayMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly storage: LocalStorageLike | null;
  private api: PreferencesApi;
  private onSaveError: () => void;

  constructor(options: TableLayoutStoreOptions) {
    this.delayMs = options.delayMs ?? SAVE_DELAY_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.storage = options.storage;
    this.api = options.api;
    this.onSaveError = options.onSaveError;
  }

  // Обновить API и обработчик ошибки (React-обёртка передаёт свежие dataProvider/notify).
  connect(api: PreferencesApi, onSaveError: () => void): void {
    this.api = api;
    this.onSaveError = onSaveError;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // Сохранённое значение раскладки таблицы; undefined — записи нет (стандартный вид).
  get = (tableId: string): unknown => this.layouts[tableId];

  getUserId = (): string | null => this.userId;

  // Установление сессии пользователя: локальная копия этого пользователя сразу, затем загрузка
  // с сервера. Повторный вызов с тем же id ничего не делает.
  // После dispose() хранилище без пользователя, поэтому setUser поднимает его заново даже
  // с тем же id (React.StrictMode в dev: «смонтировать → очистить → смонтировать»).
  setUser(userId: string | null): void {
    if (userId === this.userId) return;
    this.endSession();
    this.userId = userId;
    this.layouts = userId === null ? {} : this.readLocal(userId);
    this.emit();
    if (userId !== null) void this.load(this.generation);
  }

  // Изменение раскладки таблицы: сразу в памяти и в локальной копии, на сервер — с задержкой.
  // value === null — стандартный вид (запись удаляется).
  set(tableId: string, value: unknown): void {
    if (this.userId === null) return;
    const next = { ...this.layouts };
    if (value === null) delete next[tableId];
    else next[tableId] = value;
    this.layouts = next;
    this.writeLocal();
    this.emit();
    this.unsaved.add(tableId);
    this.edited.add(tableId);
    this.versions.set(tableId, (this.versions.get(tableId) ?? 0) + 1);
    this.schedule(tableId);
  }

  // Отложенные записи и автоповтор отменяются: изменение за секунду до ухода может не
  // сохраниться (admin.md).
  //
  // После dispose() хранилище ничего не делает: ни запросов, ни уведомлений, ни автоповторов,
  // ни записи в localStorage, ни оповещения слушателей — даже когда завершаются запросы,
  // начатые до него (их продолжения отсекает смена поколения). Иначе после разлогина старое
  // хранилище могло бы записать раскладку прежнего пользователя под токеном нового.
  dispose(): void {
    this.endSession();
    this.userId = null;
  }

  // Завершить сессию текущего пользователя: таймеры, очереди и пометки сбрасываются, ответы
  // запросов, начатых до этого, отбрасываются (generation).
  private endSession(): void {
    this.cancelTimers();
    this.unsaved.clear();
    this.edited.clear();
    this.versions.clear();
    this.inFlight.clear();
    this.queued.clear();
    this.retryAttempt = 0;
    this.errorShown = false;
    this.generation += 1;
  }

  private async load(generation: number): Promise<void> {
    let result: unknown;
    try {
      result = await this.api.load(PREFERENCE_PREFIX);
    } catch {
      return;
    }
    if (generation !== this.generation) return;
    // Не ответ сервера (например, заглушка {data: {}} после разлогина) — как ошибка загрузки.
    if (!isRecord(result) || !isRecord(result.preferences)) return;
    const next: Layouts = {};
    for (const [key, value] of Object.entries(result.preferences)) {
      if (key.startsWith(PREFERENCE_PREFIX)) next[key.slice(PREFERENCE_PREFIX.length)] = value;
    }
    for (const tableId of this.edited) {
      if (tableId in this.layouts) next[tableId] = this.layouts[tableId];
      else delete next[tableId];
    }
    this.layouts = next;
    this.writeLocal();
    this.emit();
  }

  private schedule(tableId: string): void {
    const existing = this.debounce.get(tableId);
    if (existing !== undefined) clearTimeout(existing);
    this.debounce.set(
      tableId,
      setTimeout(() => {
        this.debounce.delete(tableId);
        this.request(tableId);
        // Изменение любой таблицы — повод заодно отправить несохранённые остальные.
        this.retryUnsaved();
      }, this.delayMs),
    );
  }

  // Записать таблицу сейчас или, если запрос этого ключа в пути, сразу после него.
  private request(tableId: string): void {
    if (this.inFlight.has(tableId)) {
      this.queued.add(tableId);
      return;
    }
    void this.send(tableId);
  }

  private retryUnsaved(): void {
    for (const tableId of this.unsaved) {
      if (!this.debounce.has(tableId) && !this.inFlight.has(tableId)) this.request(tableId);
    }
  }

  private async send(tableId: string): Promise<void> {
    const generation = this.generation;
    const version = this.versions.get(tableId) ?? 0;
    const key = PREFERENCE_PREFIX + tableId;
    const value = this.layouts[tableId];
    this.inFlight.add(tableId);
    let ok: boolean;
    try {
      ok =
        value === undefined
          ? isDeleteResponse(await this.api.remove(key))
          : isSaveResponse(await this.api.save(key, value));
    } catch {
      ok = false;
    }
    if (generation !== this.generation) return;
    this.inFlight.delete(tableId);

    if (ok && (this.versions.get(tableId) ?? 0) === version) this.unsaved.delete(tableId);
    // Есть более новая запись этого ключа — её исход и решает, сохранена ли таблица.
    const superseded = this.queued.has(tableId) || this.debounce.has(tableId);
    if (this.queued.delete(tableId)) void this.send(tableId);

    if (ok) this.onWriteSuccess();
    else if (!superseded) this.onWriteFailure();
  }

  private onWriteSuccess(): void {
    this.retryAttempt = 0;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.unsaved.size === 0) this.errorShown = false;
    else this.retryUnsaved();
  }

  private onWriteFailure(): void {
    if (!this.errorShown) {
      this.errorShown = true;
      this.onSaveError();
    }
    if (this.retryTimer !== null || this.retryAttempt >= this.retryDelaysMs.length) return;
    const delay = this.retryDelaysMs[this.retryAttempt];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryUnsaved();
    }, delay);
  }

  private cancelTimers(): void {
    for (const timer of this.debounce.values()) clearTimeout(timer);
    this.debounce.clear();
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private readLocal(userId: string): Layouts {
    const storage = this.storage;
    if (storage === null) return {};
    try {
      const raw = storage.getItem(LOCAL_STORAGE_KEY);
      if (raw === null) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.userId !== userId || !isRecord(parsed.layouts)) return {};
      return { ...parsed.layouts };
    } catch {
      return {};
    }
  }

  private writeLocal(): void {
    const storage = this.storage;
    if (storage === null || this.userId === null) return;
    const copy: LocalCopy = { userId: this.userId, layouts: this.layouts };
    try {
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(copy));
    } catch {
      // Без локального хранилища (приватный режим, квота) работаем по памяти и серверу.
    }
  }
}
