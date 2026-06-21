// Переиспользуемый слой файлового хранилища (фича file_storage).
// Эндпоинты /files общие; конкретные экраны (база знаний, фото чек-листов) подключают
// этот слой в своих ТЗ. Источник правды по контрактам — backend.md / openapi.json.

export type FileCategory = 'checklist_photo' | 'knowledge_base' | 'avatar' | 'other';

// Ответ POST /files и GET /files/{id} (конверт {data,error} разворачивает dataProvider).
export interface UploadedFile {
  id: string;
  category: FileCategory;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  url: string; // короткоживущий presigned GET (хранить file_id, не url)
  url_expires_at: string;
  created_at: string;
}

const MB = 1024 * 1024;

// Клиентский справочник политик категорий — ТОЛЬКО для UX (accept у input + подсказка
// лимита и предвалидация до сети). Финальная валидация всегда на бэке (magic-bytes, размер).
// При изменении политик на бэке (backend.md) синхронизировать здесь.
export interface CategoryPolicy {
  maxSizeBytes: number;
  accept: string; // значение для атрибута accept у <input type="file">
  acceptLabel: string; // человекочитаемый список для подсказок/ошибок
}

export const FILE_CATEGORY_POLICY: Record<FileCategory, CategoryPolicy> = {
  checklist_photo: {
    maxSizeBytes: 10 * MB,
    accept: 'image/jpeg,image/png,image/webp,image/heic',
    acceptLabel: 'JPEG, PNG, WEBP, HEIC',
  },
  knowledge_base: {
    maxSizeBytes: 50 * MB,
    accept: 'image/*,application/pdf',
    acceptLabel: 'изображения, PDF',
  },
  avatar: {
    maxSizeBytes: 5 * MB,
    accept: 'image/jpeg,image/png,image/webp',
    acceptLabel: 'JPEG, PNG, WEBP',
  },
  other: { maxSizeBytes: 10 * MB, accept: '', acceptLabel: 'любой тип' },
};

// Размер байтов → «1,5 МБ» / «512 КБ» (для подсказок и превью).
export const formatFileSize = (bytes: number): string => {
  if (bytes >= MB) return `${(bytes / MB).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};

// MIME файла подходит под accept-строку. Правила вида 'image/*' матчат префикс.
// Пустой fileType (браузер не распознал, напр. HEIC) → доверяем бэку, не отклоняем.
export const isAcceptedType = (fileType: string, accept: string): boolean => {
  if (!accept || !fileType) return true;
  return accept
    .split(',')
    .map((rule) => rule.trim())
    .some((rule) => (rule.endsWith('/*') ? fileType.startsWith(rule.slice(0, -1)) : fileType === rule));
};

// Сообщение об ошибке файла по error.code (ERROR_FORMAT). Не по тексту бэка.
// category добавляет конкретику (лимит / разрешённые типы) там, где это уместно.
export const fileErrorMessage = (error: unknown, category?: FileCategory): string => {
  const code = (error as { body?: { code?: string } })?.body?.code;
  const policy = category ? FILE_CATEGORY_POLICY[category] : null;
  switch (code) {
    case 'FILE_TOO_LARGE':
      return policy
        ? `Файл слишком большой (лимит ${formatFileSize(policy.maxSizeBytes)})`
        : 'Файл слишком большой';
    case 'UNSUPPORTED_FILE_TYPE':
      return policy
        ? `Недопустимый тип файла (разрешено: ${policy.acceptLabel})`
        : 'Недопустимый тип файла';
    case 'FILE_IN_USE':
      return 'Файл используется, сначала отвяжите';
    case 'STORAGE_UNAVAILABLE':
      return 'Хранилище недоступно, повторите позже';
    case 'FILE_NOT_FOUND':
      return 'Файл не найден';
    case 'INVALID_FILE_CATEGORY':
      return 'Неизвестная категория файла';
    default:
      return (error as { message?: string })?.message ?? 'Не удалось обработать файл';
  }
};

// Предвалидация выбранного файла по политике категории (до загрузки).
// Возвращает текст ошибки или null, если файл проходит клиентские проверки.
export const validateFileForCategory = (file: File, category: FileCategory): string | null => {
  const policy = FILE_CATEGORY_POLICY[category];
  if (file.size > policy.maxSizeBytes) {
    return `Файл слишком большой (лимит ${formatFileSize(policy.maxSizeBytes)})`;
  }
  if (!isAcceptedType(file.type, policy.accept)) {
    return `Недопустимый тип файла (разрешено: ${policy.acceptLabel})`;
  }
  return null;
};

// --- RBAC по категориям (UI лишь прячет недоступное; доступ режется и на бэке 403) ---
// Матрица — backend.md / admin.md. orgRole — фактическая роль в выбранной org (useMyOrgRole).

export const canUploadFileCategory = (
  category: FileCategory,
  orgRole: string | null,
  isSuperAdmin: boolean,
): boolean => {
  switch (category) {
    case 'knowledge_base':
      return isSuperAdmin || orgRole === 'owner' || orgRole === 'admin';
    case 'checklist_photo':
      // Грузит сотрудник (мобилка); в админке загрузка доступна только employee.
      return orgRole === 'employee';
    case 'avatar':
      return true; // сам пользователь
    case 'other':
      return true; // любой authenticated
  }
};

// DELETE /files/{id}: uploader | org admin/owner | super_admin (backend.md).
export const canDeleteFile = (
  orgRole: string | null,
  isSuperAdmin: boolean,
  isUploader: boolean,
): boolean => isSuperAdmin || isUploader || orgRole === 'owner' || orgRole === 'admin';

// --- Скачивание бинарного ответа (экспорт отчётов в .xlsx и т.п.) ---
// Сохраняет Blob как файл через временную object-URL ссылку. Сам fetch живёт в dataProvider;
// триггер скачивания (DOM-side-effect) — здесь, чтобы провайдер не трогал DOM.
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Отзываем object-URL отложенно: синхронный revoke сразу после click() в части браузеров
  // (Firefox/WebKit) делает URL недействительным до старта чтения и тихо отменяет скачивание.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
