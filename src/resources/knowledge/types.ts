import type { DataProvider } from 'react-admin';

// Типы фичи «База знаний» (knowledge_base) — строго по BLOCK SCHEMA v1 и контракту
// эндпоинтов (см. docs/tasks/knowledge_base/{admin,backend}.md). Конверт {data,error}
// разворачивает dataProvider; здесь — формы уже распакованных data.

// --- BLOCK SCHEMA v1 ------------------------------------------------------

// Inline rich-text span: текст + опциональные mark'и. link — URL (string) либо отсутствует.
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}

// rich — массив span'ов одной строки/абзаца.
export type RichText = Span[];

export interface HeadingBlock {
  id: string;
  type: 'heading';
  level: 1 | 2 | 3;
  rich: RichText;
}

export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  rich: RichText;
}

// items — массив пунктов, каждый пункт — массив span'ов.
export interface BulletedListBlock {
  id: string;
  type: 'bulleted_list';
  items: RichText[];
}

export interface NumberedListBlock {
  id: string;
  type: 'numbered_list';
  items: RichText[];
}

export interface QuoteBlock {
  id: string;
  type: 'quote';
  rich: RichText;
}

export interface CalloutBlock {
  id: string;
  type: 'callout';
  emoji?: string;
  rich: RichText;
}

export interface DividerBlock {
  id: string;
  type: 'divider';
}

// rows → строки → ячейки → массив span'ов.
export interface TableBlock {
  id: string;
  type: 'table';
  rows: RichText[][];
}

// image/file/video в content хранят ТОЛЬКО file_id/метаданные. Поля url/url_expires_at
// бэкенд добавляет на чтении (M3 обогащение) — на сохранении их НЕ кладём. Оба могут
// прийти null (storage недоступен → дотянуть через GET /files/{file_id}).
export interface ImageBlock {
  id: string;
  type: 'image';
  file_id: string;
  caption?: string;
  url?: string | null;
  url_expires_at?: string | null;
}

export interface FileBlock {
  id: string;
  type: 'file';
  file_id: string;
  filename: string;
  size_bytes: number;
  url?: string | null;
  url_expires_at?: string | null;
}

// video v1 — только YouTube. video_id извлекает/проверяет бэкенд из url.
export interface VideoBlock {
  id: string;
  type: 'video';
  provider: 'youtube';
  url: string;
  video_id: string;
}

// Дискриминируемое объединение всех блоков whitelist (schema_version=1).
export type KnowledgeBlock =
  | HeadingBlock
  | ParagraphBlock
  | BulletedListBlock
  | NumberedListBlock
  | QuoteBlock
  | CalloutBlock
  | DividerBlock
  | TableBlock
  | ImageBlock
  | FileBlock
  | VideoBlock;

export type BlockType = KnowledgeBlock['type'];

// Контент страницы: массив блоков (page, может быть пустым []) либо null (section).
export type KnowledgeContent = KnowledgeBlock[] | null;

// --- Узлы дерева ----------------------------------------------------------

export type NodeKind = 'section' | 'page';

// Элемент дерева (M2, tree=true) — без content. all_members присутствует для
// owner/admin/super_admin (в админке всегда, employee сюда не заходит).
export interface NodeTreeItem {
  id: string;
  kind: NodeKind;
  title: string;
  icon: string | null;
  position: number;
  all_members?: boolean;
  children: NodeTreeItem[];
}

// Путь от корня до узла включительно (порядок — от корня).
export interface Breadcrumb {
  id: string;
  title: string;
}

// Деталь узла (M3). content обогащён для page; null для section.
export interface NodeDetail {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  title: string;
  icon: string | null;
  position: number;
  all_members: boolean;
  created_at: string;
  updated_at: string;
  breadcrumbs: Breadcrumb[];
  content: KnowledgeContent;
}

// Ответ create (M1, NodeResponse) — без children/breadcrumbs.
export interface NodeResponse {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  title: string;
  icon: string | null;
  position: number;
  all_members: boolean;
  content: KnowledgeContent;
  created_at: string;
  updated_at: string;
}

// Тело create (M1). position не задаём — бэкенд кладёт в конец сиблингов.
export interface CreateNodeInput {
  parent_id?: string | null;
  kind: NodeKind;
  title: string;
  icon?: string | null;
  position?: number;
}

// Тело update (M4, partial). content — только для page; parent_id — перемещение.
export interface UpdateNodeInput {
  title?: string;
  icon?: string | null;
  all_members?: boolean;
  content?: KnowledgeContent;
  parent_id?: string | null;
  position?: number;
}

// --- Reorder (M6) ---------------------------------------------------------

export interface ReorderInput {
  parent_id?: string | null;
  ordered_ids: string[];
}

// --- ACL (A1/A2) ----------------------------------------------------------

export type AccessSubjectType = 'role' | 'member';
export type AccessEffect = 'allow' | 'deny';

// Правило доступа. id есть на чтении (A1); на сохранении (A2) отправляем без id.
// role_id заполнен при subject_type=role; member_user_id — при subject_type=member.
export interface AccessRule {
  id?: string;
  subject_type: AccessSubjectType;
  role_id?: string | null;
  member_user_id?: string | null;
  effect: AccessEffect;
}

// Состояние ACL узла (ответ A1 и тело A2): тумблер all_members + собственные правила.
export interface AccessState {
  all_members: boolean;
  rules: AccessRule[];
}

// --- Файлы (file_storage, категория knowledge_base) -----------------------

// Ответ POST /files и GET /files/{id} (FileResponse). url — свежий presigned GET.
export interface FileUploadResult {
  id: string;
  category: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  url: string | null;
  url_expires_at: string | null;
  created_at: string;
}

// --- dataProvider с кастомными методами фичи -----------------------------

// Расширение базового DataProvider кастомными методами knowledge_base. Компоненты
// тянут его через useDataProvider<KnowledgeDataProvider>().
export interface KnowledgeDataProvider extends DataProvider {
  reorderKnowledge(input: ReorderInput): Promise<{ data: null }>;
  getKnowledgeAccess(nodeId: string): Promise<AccessState>;
  putKnowledgeAccess(nodeId: string, input: AccessState): Promise<AccessState>;
  uploadKnowledgeFile(file: File): Promise<FileUploadResult>;
  getKnowledgeFile(fileId: string): Promise<FileUploadResult>;
}
