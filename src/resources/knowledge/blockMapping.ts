// Двусторонние конвертеры BLOCK SCHEMA v1 (наш content) <-> документ BlockNote.
// Чистые функции, без сайд-эффектов: toBlockNote(content) для инициализации редактора,
// fromBlockNote(doc) для сериализации в content при сохранении (PATCH).
//
// Маппинг типов:
//   heading(level 1..3) <-> heading (props.level)
//   paragraph           <-> paragraph
//   bulleted_list       <-> bulletListItem[] (один наш блок = N блоков BlockNote)
//   numbered_list       <-> numberedListItem[]
//   quote               <-> quote
//   table               <-> table (tableContent)
//   divider             <-> кастомный блок 'divider' (content: none)
//   callout             <-> кастомный блок 'callout' (content: inline, props.emoji)
//   image/file/video    <-> кастомные блоки (content: none, file_id/метаданные в props)
//
// Inline span {text,bold,italic,underline,strike,code,link} <-> StyledText/Link BlockNote.
// url/url_expires_at медиа-блоков приходят с бэка на чтении — в сохраняемый content НЕ кладём.

import type {
  KnowledgeBlock,
  KnowledgeContent,
  RichText,
  Span,
} from './types';

// Идентификаторы кастомных блоков схемы BlockNote (должны совпадать с blockSpecs в BlockEditor).
export const CUSTOM_BLOCK_TYPES = {
  divider: 'divider',
  callout: 'callout',
  image: 'image',
  file: 'file',
  video: 'video',
} as const;

// --- Структурные типы документа BlockNote (минимально нужные нам) ----------
// Описываем форму PartialBlock/Block в объёме, который реально читаем/пишем. Это держит
// маппер независимым от точных дженериков кастомной схемы (она задаётся в BlockEditor).

interface BNStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  [key: string]: boolean | number | string | undefined;
}

interface BNStyledText {
  type: 'text';
  text: string;
  styles: BNStyles;
}

interface BNLink {
  type: 'link';
  href: string;
  content: BNStyledText[];
}

type BNInline = BNStyledText | BNLink;

interface BNTableCell {
  type: 'tableCell';
  content: BNInline[];
  props?: Record<string, unknown>;
}

interface BNTableContent {
  type: 'tableContent';
  columnWidths?: (number | undefined)[];
  rows: { cells: (BNTableCell | BNInline[])[] }[];
}

export interface BNBlock {
  id?: string;
  type: string;
  props?: Record<string, boolean | number | string | undefined>;
  content?: BNInline[] | BNTableContent | undefined;
  children?: BNBlock[];
}

export type BlockNoteDocument = BNBlock[];

// --- Генерация id ---------------------------------------------------------

// Стабильный uuid для блоков; crypto.randomUUID() (не Math.random) — требование контракта.
const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Фолбэк на средах без crypto.randomUUID (теоретический): набор из crypto.getRandomValues.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// --- Inline: наш Span[] -> BlockNote inline -------------------------------

const spanToInline = (span: Span): BNInline => {
  const styles: BNStyles = {};
  if (span.bold) styles.bold = true;
  if (span.italic) styles.italic = true;
  if (span.underline) styles.underline = true;
  if (span.strike) styles.strike = true;
  if (span.code) styles.code = true;

  const styledText: BNStyledText = { type: 'text', text: span.text ?? '', styles };

  // link оборачиваем в BlockNote-узел link (содержит styledText внутри).
  if (span.link) {
    return { type: 'link', href: span.link, content: [styledText] };
  }
  return styledText;
};

const richToInline = (rich: RichText | undefined): BNInline[] =>
  (rich ?? []).map(spanToInline);

// --- Inline: BlockNote inline -> наш Span[] -------------------------------

const stylesToSpanFlags = (styles: BNStyles | undefined): Partial<Span> => {
  const flags: Partial<Span> = {};
  if (styles?.bold) flags.bold = true;
  if (styles?.italic) flags.italic = true;
  if (styles?.underline) flags.underline = true;
  if (styles?.strike) flags.strike = true;
  if (styles?.code) flags.code = true;
  return flags;
};

const inlineToSpans = (content: BNInline[] | BNTableContent | undefined): Span[] => {
  if (!content || !Array.isArray(content)) return [];
  const spans: Span[] = [];
  for (const node of content) {
    if (node.type === 'link') {
      // link содержит набор styledText — каждому проставляем общий href.
      for (const inner of node.content ?? []) {
        spans.push({ text: inner.text ?? '', ...stylesToSpanFlags(inner.styles), link: node.href });
      }
    } else if (node.type === 'text') {
      spans.push({ text: node.text ?? '', ...stylesToSpanFlags(node.styles) });
    }
    // Кастомный inline-контент в whitelist v1 отсутствует — игнорируем.
  }
  return spans;
};

// --- toBlockNote: наш блок -> блок(и) BlockNote ---------------------------

const blockToBlockNote = (block: KnowledgeBlock): BNBlock[] => {
  switch (block.type) {
    case 'heading':
      return [
        {
          id: block.id,
          type: 'heading',
          props: { level: block.level },
          content: richToInline(block.rich),
        },
      ];
    case 'paragraph':
      return [{ id: block.id, type: 'paragraph', content: richToInline(block.rich) }];
    case 'quote':
      return [{ id: block.id, type: 'quote', content: richToInline(block.rich) }];
    case 'bulleted_list':
      // Один наш список = N пунктов bulletListItem. id исходного блока — на первом пункте.
      return block.items.map((item, idx) => ({
        id: idx === 0 ? block.id : newId(),
        type: 'bulletListItem',
        content: richToInline(item),
      }));
    case 'numbered_list':
      return block.items.map((item, idx) => ({
        id: idx === 0 ? block.id : newId(),
        type: 'numberedListItem',
        content: richToInline(item),
      }));
    case 'divider':
      return [{ id: block.id, type: CUSTOM_BLOCK_TYPES.divider, props: {} }];
    case 'callout':
      return [
        {
          id: block.id,
          type: CUSTOM_BLOCK_TYPES.callout,
          props: { emoji: block.emoji ?? '' },
          content: richToInline(block.rich),
        },
      ];
    case 'table':
      return [
        {
          id: block.id,
          type: 'table',
          content: {
            type: 'tableContent',
            rows: block.rows.map((row) => ({
              cells: row.map((cell) => richToInline(cell)),
            })),
          },
        },
      ];
    case 'image':
      return [
        {
          id: block.id,
          type: CUSTOM_BLOCK_TYPES.image,
          props: {
            file_id: block.file_id,
            caption: block.caption ?? '',
            // url/url_expires_at — только для рендера; на сохранении не сериализуются.
            url: block.url ?? '',
            url_expires_at: block.url_expires_at ?? '',
          },
        },
      ];
    case 'file':
      return [
        {
          id: block.id,
          type: CUSTOM_BLOCK_TYPES.file,
          props: {
            file_id: block.file_id,
            filename: block.filename,
            size_bytes: block.size_bytes,
            url: block.url ?? '',
            url_expires_at: block.url_expires_at ?? '',
          },
        },
      ];
    case 'video':
      return [
        {
          id: block.id,
          type: CUSTOM_BLOCK_TYPES.video,
          props: { provider: block.provider, url: block.url, video_id: block.video_id },
        },
      ];
    default:
      // Исчерпывающая проверка: при добавлении типа в schema здесь будет ошибка типов.
      return [];
  }
};

// content (page) -> документ BlockNote. null/[] -> один пустой параграф (BlockNote
// не работает с полностью пустым документом).
export const toBlockNote = (content: KnowledgeContent): BlockNoteDocument => {
  const blocks = (content ?? []).flatMap(blockToBlockNote);
  if (blocks.length === 0) {
    return [{ id: newId(), type: 'paragraph', content: [] }];
  }
  return blocks;
};

// --- fromBlockNote: документ BlockNote -> наш content ---------------------

const propStr = (props: BNBlock['props'], key: string): string | undefined => {
  const v = props?.[key];
  return typeof v === 'string' ? v : undefined;
};

const propNum = (props: BNBlock['props'], key: string): number | undefined => {
  const v = props?.[key];
  return typeof v === 'number' ? v : undefined;
};

const tableRowsToContent = (content: BNBlock['content']): RichText[][] => {
  if (!content || Array.isArray(content) || content.type !== 'tableContent') return [];
  return content.rows.map((row) =>
    row.cells.map((cell) => {
      // Ячейка может быть объектом tableCell (с .content) либо прямым массивом inline.
      if (Array.isArray(cell)) return inlineToSpans(cell);
      return inlineToSpans(cell.content);
    }),
  );
};

const headingLevel = (props: BNBlock['props']): 1 | 2 | 3 => {
  const level = propNum(props, 'level');
  if (level === 2) return 2;
  if (level === 3) return 3;
  // BlockNote допускает level 4..6, но в нашей схеме v1 — только 1..3: схлопываем в 3.
  if (typeof level === 'number' && level >= 3) return 3;
  return 1;
};

// Преобразование одного BlockNote-блока в наш блок. Списочные пункты схлопываются в
// общий блок снаружи (см. fromBlockNote), поэтому здесь возвращаем по одному блоку.
const blockNoteToBlock = (bn: BNBlock): KnowledgeBlock | null => {
  const id = bn.id ?? newId();
  switch (bn.type) {
    case 'heading':
      return { id, type: 'heading', level: headingLevel(bn.props), rich: inlineToSpans(bn.content) };
    case 'paragraph':
      return { id, type: 'paragraph', rich: inlineToSpans(bn.content) };
    case 'quote':
      return { id, type: 'quote', rich: inlineToSpans(bn.content) };
    case 'table':
      return { id, type: 'table', rows: tableRowsToContent(bn.content) };
    case CUSTOM_BLOCK_TYPES.divider:
      return { id, type: 'divider' };
    case CUSTOM_BLOCK_TYPES.callout: {
      const emoji = propStr(bn.props, 'emoji');
      const rich = inlineToSpans(bn.content);
      return emoji ? { id, type: 'callout', emoji, rich } : { id, type: 'callout', rich };
    }
    case CUSTOM_BLOCK_TYPES.image: {
      const fileId = propStr(bn.props, 'file_id');
      if (!fileId) return null; // изображение без file_id (загрузка не завершилась) — пропускаем
      const caption = propStr(bn.props, 'caption');
      // url/url_expires_at в content НЕ кладём — приходят только с бэка на чтении.
      return caption
        ? { id, type: 'image', file_id: fileId, caption }
        : { id, type: 'image', file_id: fileId };
    }
    case CUSTOM_BLOCK_TYPES.file: {
      const fileId = propStr(bn.props, 'file_id');
      if (!fileId) return null;
      return {
        id,
        type: 'file',
        file_id: fileId,
        filename: propStr(bn.props, 'filename') ?? '',
        size_bytes: propNum(bn.props, 'size_bytes') ?? 0,
      };
    }
    case CUSTOM_BLOCK_TYPES.video: {
      const url = propStr(bn.props, 'url');
      if (!url) return null; // видео без url — пропускаем
      return {
        id,
        type: 'video',
        provider: 'youtube',
        url,
        video_id: propStr(bn.props, 'video_id') ?? '',
      };
    }
    default:
      // Неизвестный/не-whitelisted тип (напр. codeBlock) — не сериализуем (бэк отверг бы 422).
      return null;
  }
};

// Документ BlockNote -> content (page). Соседние bulletListItem/numberedListItem
// схлопываются в один наш bulleted_list/numbered_list блок.
export const fromBlockNote = (doc: BlockNoteDocument | undefined): KnowledgeBlock[] => {
  const result: KnowledgeBlock[] = [];
  const list = doc ?? [];

  for (let i = 0; i < list.length; i += 1) {
    const bn = list[i];

    if (bn.type === 'bulletListItem' || bn.type === 'numberedListItem') {
      const listType = bn.type === 'bulletListItem' ? 'bulleted_list' : 'numbered_list';
      const groupId = bn.id ?? newId();
      const items: RichText[] = [];
      // Собираем подряд идущие пункты того же типа в один блок-список.
      while (i < list.length && list[i].type === bn.type) {
        items.push(inlineToSpans(list[i].content));
        i += 1;
      }
      i -= 1; // компенсируем внешний инкремент
      result.push({ id: groupId, type: listType, items });
      continue;
    }

    const mapped = blockNoteToBlock(bn);
    if (mapped) result.push(mapped);
  }

  return result;
};

// --- Парсер YouTube url -> video_id (предзаполнение; бэкенд перепроверит) -

const YT_PATTERNS = [
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
];

export const parseYouTubeId = (url: string): string | null => {
  const trimmed = url.trim();
  for (const re of YT_PATTERNS) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
};
