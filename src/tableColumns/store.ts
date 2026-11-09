// Хранилище раскладок столбцов (table_column_settings/admin.md, «Синхронизация с сервером»).
//
// Без React: держит сохранённые значения раскладок текущего пользователя по tableId,
// синхронизирует их с сервером (/users/me/preferences) и с локальной копией в браузере.
//
// - Загрузка: один раз на пользователя (setUser) — GET по префиксу admin.table.; UI её не ждёт,
//   до ответа работает локальная копия. Ответ заменяет локальную копию; таблицы, изменённые
//   пользователем, пока ответ был в пути, сохраняют локальное значение.
// - Запись: изменение применяется сразу, на сервер уходит через delayMs после последнего
//   изменения этой таблицы (серия шагов перетаскивания → один PUT). null → DELETE ключа.
// - Ошибка записи: локальное значение остаётся, onSaveError вызывается один раз, пока
//   какая-нибудь запись не пройдёт; следующее изменение повторяет попытку. Ошибка загрузки —
//   молча.
// - Локальная копия помечена id пользователя и чужому пользователю не применяется.

export const PREFERENCE_PREFIX = 'admin.table.';
export const LOCAL_STORAGE_KEY = 'smenka.tableLayouts';
export const SAVE_DELAY_MS = 1000;

export interface PreferencesApi {
  load: (prefix: string) => Promise<Record<string, unknown>>;
  save: (key: string, value: unknown) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
}

export type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface TableLayoutStoreOptions {
  api: PreferencesApi;
  storage: LocalStorageLike | null;
  onSaveError: () => void;
  delayMs?: number;
}

type Layouts = Record<string, unknown>;

interface LocalCopy {
  userId: string;
  layouts: Layouts;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class TableLayoutStore {
  private userId: string | null = null;
  private layouts: Layouts = {};
  // Таблицы, изменённые локально и ещё не подтверждённые сервером.
  private readonly dirty = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<() => void>();
  // Растёт при смене пользователя: ответы, начатые для прошлого пользователя, отбрасываются.
  private generation = 0;
  private errorShown = false;
  private readonly delayMs: number;
  private readonly storage: LocalStorageLike | null;
  private api: PreferencesApi;
  private onSaveError: () => void;

  constructor(options: TableLayoutStoreOptions) {
    this.delayMs = options.delayMs ?? SAVE_DELAY_MS;
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
  setUser(userId: string | null): void {
    if (userId === this.userId) return;
    this.cancelTimers();
    this.dirty.clear();
    this.errorShown = false;
    this.generation += 1;
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
    this.dirty.add(tableId);
    this.schedule(tableId);
  }

  // Отложенные записи отменяются: изменение за секунду до ухода может не сохраниться (admin.md).
  dispose(): void {
    this.cancelTimers();
  }

  private async load(generation: number): Promise<void> {
    let preferences: Record<string, unknown>;
    try {
      preferences = await this.api.load(PREFERENCE_PREFIX);
    } catch {
      return;
    }
    if (generation !== this.generation || !isRecord(preferences)) return;
    const next: Layouts = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (key.startsWith(PREFERENCE_PREFIX)) next[key.slice(PREFERENCE_PREFIX.length)] = value;
    }
    for (const tableId of this.dirty) {
      if (tableId in this.layouts) next[tableId] = this.layouts[tableId];
      else delete next[tableId];
    }
    this.layouts = next;
    this.writeLocal();
    this.emit();
  }

  private schedule(tableId: string): void {
    const existing = this.timers.get(tableId);
    if (existing !== undefined) clearTimeout(existing);
    const generation = this.generation;
    this.timers.set(
      tableId,
      setTimeout(() => {
        this.timers.delete(tableId);
        void this.flush(tableId, generation);
      }, this.delayMs),
    );
  }

  private async flush(tableId: string, generation: number): Promise<void> {
    const key = PREFERENCE_PREFIX + tableId;
    const value = this.layouts[tableId];
    try {
      if (value === undefined) await this.api.remove(key);
      else await this.api.save(key, value);
    } catch {
      if (generation === this.generation && !this.errorShown) {
        this.errorShown = true;
        this.onSaveError();
      }
      return;
    }
    if (generation !== this.generation) return;
    this.errorShown = false;
    // Пока запрос был в пути, могло прийти новое изменение — оно запишется своим таймером.
    if (!this.timers.has(tableId) && this.layouts[tableId] === value) this.dirty.delete(tableId);
  }

  private cancelTimers(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
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
