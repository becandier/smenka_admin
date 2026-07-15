import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError, useDataProvider, useNotify } from 'react-admin';
import { FILE_CATEGORY_POLICY } from '../../utils/files';
import type {
  AccessRule,
  AccessState,
  Breadcrumb,
  CreateNodeInput,
  FileUploadResult,
  KnowledgeDataProvider,
  NodeDetail,
  NodeResponse,
  NodeTreeItem,
  ReorderInput,
  UpdateNodeInput,
} from './types';

// Хуки фичи «База знаний» — тонкая обёртка над useDataProvider<KnowledgeDataProvider>().
// Все сетевые вызовы идут через dataProvider; ошибки прилетают как HttpError, где
// error.body.code — код контракта (ERROR_FORMAT). Уведомления маппятся по code, не по тексту.

// --- Маппинг кодов ошибок в RU-текст ------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  KNOWLEDGE_NODE_NOT_FOUND: 'Материал не найден',
  KNOWLEDGE_NODE_CYCLE: 'Нельзя переместить раздел внутрь самого себя',
  KNOWLEDGE_FILE_INVALID: 'Файл недоступен или уже привязан к другой странице',
  ROLE_NOT_FOUND: 'Роль не найдена',
  MEMBER_NOT_FOUND: 'Сотрудник не найден',
  VALIDATION_ERROR: 'Проверьте корректность данных',
  FORBIDDEN: 'Нет доступа',
  FILE_TOO_LARGE: 'Файл слишком большой (лимит 50 MB)',
  // Перечень допустимых типов берём из справочника категории (единый источник с accept-input).
  UNSUPPORTED_FILE_TYPE: `Недопустимый тип файла. Допустимы: ${FILE_CATEGORY_POLICY.knowledge_base.acceptLabel}`,
  STORAGE_UNAVAILABLE: 'Хранилище недоступно, повторите позже',
  ORG_NOT_FOUND: 'Организация не найдена',
};

// Достаём error.code из HttpError.body (dataProvider кладёт туда код контракта).
export const knowledgeErrorCode = (error: unknown): string | undefined => {
  if (error instanceof HttpError) {
    const body = error.body as { code?: string } | undefined;
    return body?.code;
  }
  return undefined;
};

// Человекочитаемый текст по error.code; fallback — message ошибки либо переданный текст.
export const knowledgeErrorMessage = (error: unknown, fallback = 'Произошла ошибка'): string => {
  const code = knowledgeErrorCode(error);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

// Типизированный доступ к dataProvider с кастомными методами фичи.
export const useKnowledgeProvider = (): KnowledgeDataProvider =>
  useDataProvider<KnowledgeDataProvider>();

// --- Чтение дерева (M2) --------------------------------------------------

export interface UseKnowledgeTreeResult {
  tree: NodeTreeItem[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

// Загружает всё дерево (getList('knowledge/nodes')). Перезагрузка — через refetch()
// после мутаций. Дерево уже отсортировано бэком; сортировку по position компоненты
// при желании дублируют на клиенте.
export const useKnowledgeTree = (): UseKnowledgeTreeResult => {
  const dataProvider = useKnowledgeProvider();
  const [tree, setTree] = useState<NodeTreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    dataProvider
      .getList<NodeTreeItem>('knowledge/nodes', {
        pagination: { page: 1, perPage: 0 },
        sort: { field: 'position', order: 'ASC' },
        filter: {},
      })
      .then((res) => {
        if (active) setTree(res.data ?? []);
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataProvider, tick]);

  return { tree, loading, error, refetch };
};

// --- Чтение детали узла (M3) ---------------------------------------------

export interface UseKnowledgeNodeResult {
  node: NodeDetail | null;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

// Деталь узла по id (null id → ничего не грузим). content обогащён для page, null для section.
export const useKnowledgeNode = (id: string | null): UseKnowledgeNodeResult => {
  const dataProvider = useKnowledgeProvider();
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setNode(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    dataProvider
      .getOne<NodeDetail>('knowledge/nodes', { id })
      .then((res) => {
        if (active) setNode(res.data ?? null);
      })
      .catch((e) => {
        if (active) {
          setNode(null);
          setError(e);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataProvider, id, tick]);

  return { node, loading, error, refetch };
};

// --- Состояние мутации ----------------------------------------------------

export interface MutationState {
  saving: boolean;
  error: unknown;
}

// --- Создание узла (M1) ---------------------------------------------------

export interface UseCreateNodeResult extends MutationState {
  create: (input: CreateNodeInput) => Promise<NodeResponse>;
}

export const useCreateNode = (): UseCreateNodeResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const create = useCallback(
    async (input: CreateNodeInput) => {
      setSaving(true);
      setError(null);
      try {
        const res = await dataProvider.create<NodeResponse>('knowledge/nodes', { data: input });
        return res.data;
      } catch (e) {
        setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось создать узел'), { type: 'error' });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [dataProvider, notify],
  );

  return { create, saving, error };
};

// --- Обновление узла (M4): title/icon/all_members/content/parent_id/position -

export interface UseUpdateNodeResult extends MutationState {
  update: (id: string, data: UpdateNodeInput) => Promise<NodeDetail>;
}

export const useUpdateNode = (): UseUpdateNodeResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const update = useCallback(
    async (id: string, data: UpdateNodeInput) => {
      setSaving(true);
      setError(null);
      try {
        const res = await dataProvider.update<NodeDetail>('knowledge/nodes', {
          id,
          data,
          previousData: { id },
        });
        return res.data;
      } catch (e) {
        setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось сохранить изменения'), { type: 'error' });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [dataProvider, notify],
  );

  return { update, saving, error };
};

// --- Удаление узла и поддерева (M5) --------------------------------------

export interface UseDeleteNodeResult extends MutationState {
  remove: (id: string) => Promise<void>;
}

export const useDeleteNode = (): UseDeleteNodeResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const remove = useCallback(
    async (id: string) => {
      setSaving(true);
      setError(null);
      try {
        await dataProvider.delete('knowledge/nodes', { id, previousData: { id } });
      } catch (e) {
        setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось удалить узел'), { type: 'error' });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [dataProvider, notify],
  );

  return { remove, saving, error };
};

// --- Переупорядочивание сиблингов (M6) -----------------------------------

export interface UseReorderNodesResult extends MutationState {
  reorder: (input: ReorderInput) => Promise<void>;
}

export const useReorderNodes = (): UseReorderNodesResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reorder = useCallback(
    async (input: ReorderInput) => {
      setSaving(true);
      setError(null);
      try {
        await dataProvider.reorderKnowledge(input);
      } catch (e) {
        setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось изменить порядок'), { type: 'error' });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [dataProvider, notify],
  );

  return { reorder, saving, error };
};

// --- ACL узла: чтение (A1) ------------------------------------------------

export interface UseNodeAccessResult {
  access: AccessState | null;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

export const useNodeAccess = (id: string | null): UseNodeAccessResult => {
  const dataProvider = useKnowledgeProvider();
  const [access, setAccess] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setAccess(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    dataProvider
      .getKnowledgeAccess(id)
      .then((res) => {
        if (active) setAccess(res ?? null);
      })
      .catch((e) => {
        if (active) {
          setAccess(null);
          setError(e);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataProvider, id, tick]);

  return { access, loading, error, refetch };
};

// --- Унаследованные ACL предков (read-only) ------------------------------

// Правило предка для отображения: само правило + источник (id/заголовок узла-предка).
export interface InheritedRule {
  rule: AccessRule;
  sourceId: string;
  sourceTitle: string;
}

// Сводка унаследованного доступа: правила всех предков (от ближнего к дальнему — порядок
// ancestors как пришёл) + информация о том, включён ли all_members на каком-либо предке.
export interface InheritedAccess {
  rules: InheritedRule[];
  allMembersFrom: { sourceId: string; sourceTitle: string } | null;
}

export interface UseInheritedAccessResult {
  inherited: InheritedAccess;
  loading: boolean;
}

// Подтягивает ACL каждого предка (A1 по каждому узлу) и собирает унаследованные правила.
// ancestors — путь предков узла (без самого узла), порядок от корня; для отображения
// «унаследовано от раздела X» переворачиваем в порядок от ближнего предка к дальнему.
export const useInheritedAccess = (
  ancestors: Breadcrumb[],
): UseInheritedAccessResult => {
  const dataProvider = useKnowledgeProvider();
  const [inherited, setInherited] = useState<InheritedAccess>({
    rules: [],
    allMembersFrom: null,
  });
  const [loading, setLoading] = useState(false);

  // Стабильный ключ зависимости — список id предков (массив каждый рендер новый).
  const ancestorKey = ancestors.map((a) => a.id).join(',');

  useEffect(() => {
    if (ancestors.length === 0) {
      setInherited({ rules: [], allMembersFrom: null });
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    // От ближнего предка к дальнему: ближний перебивает дальнего (см. admin.md §3).
    const ordered = [...ancestors].reverse();
    // Терминальный .finally() ниже завершает цепочку; per-ancestor .catch() гасит отказы,
    // поэтому Promise.all не реджектится — fire-and-forget помечаем void для линтера.
    void Promise.all(
      ordered.map((a) =>
        dataProvider
          .getKnowledgeAccess(a.id)
          .then((access) => ({ ancestor: a, access }))
          // Падение одного предка не должно рушить всю панель — пропускаем его правила.
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (!active) return;
        const rules: InheritedRule[] = [];
        let allMembersFrom: InheritedAccess['allMembersFrom'] = null;
        for (const res of results) {
          if (!res) continue;
          const { ancestor, access } = res;
          if (access.all_members && !allMembersFrom) {
            allMembersFrom = { sourceId: ancestor.id, sourceTitle: ancestor.title };
          }
          for (const rule of access.rules) {
            rules.push({ rule, sourceId: ancestor.id, sourceTitle: ancestor.title });
          }
        }
        setInherited({ rules, allMembersFrom });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // ancestorKey покрывает изменение состава предков; dataProvider стабилен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataProvider, ancestorKey]);

  return { inherited, loading };
};

// --- ACL узла: сохранение (A2, bulk-замена) ------------------------------

export interface UseSaveNodeAccessResult extends MutationState {
  save: (state: AccessState) => Promise<AccessState>;
}

export const useSaveNodeAccess = (id: string | null): UseSaveNodeAccessResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = useCallback(
    async (state: AccessState) => {
      if (!id) throw new Error('Узел не выбран');
      setSaving(true);
      setError(null);
      try {
        const res = await dataProvider.putKnowledgeAccess(id, state);
        notify('Доступ обновлён', { type: 'info' });
        return res;
      } catch (e) {
        setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось сохранить доступ'), { type: 'error' });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [dataProvider, notify, id],
  );

  return { save, saving, error };
};

// --- Загрузка файла (file_storage, category=knowledge_base) --------------

export interface UseUploadFileResult {
  upload: (file: File) => Promise<FileUploadResult>;
  // Дотягивание свежего presigned url по file_id (протухшая/null ссылка на чтении).
  refreshUrl: (fileId: string) => Promise<FileUploadResult>;
  uploading: boolean;
  error: unknown;
}

export const useUploadFile = (): UseUploadFileResult => {
  const dataProvider = useKnowledgeProvider();
  const notify = useNotify();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Гард от setState после анмаунта (загрузка/дотягивание могут пережить размонтирование блока).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const upload = useCallback(
    async (file: File) => {
      if (mounted.current) {
        setUploading(true);
        setError(null);
      }
      try {
        return await dataProvider.uploadKnowledgeFile(file);
      } catch (e) {
        if (mounted.current) setError(e);
        notify(knowledgeErrorMessage(e, 'Не удалось загрузить файл'), { type: 'error' });
        throw e;
      } finally {
        if (mounted.current) setUploading(false);
      }
    },
    [dataProvider, notify],
  );

  const refreshUrl = useCallback(
    (fileId: string) => dataProvider.getKnowledgeFile(fileId),
    [dataProvider],
  );

  return { upload, refreshUrl, uploading, error };
};
