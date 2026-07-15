import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  type PartialBlock,
} from '@blocknote/core';
import { createReactBlockSpec, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import type { KnowledgeBlock, KnowledgeContent } from './types';
import { FILE_CATEGORY_POLICY } from '../../utils/files';
import { useUploadFile } from './hooks';
import {
  CUSTOM_BLOCK_TYPES,
  fromBlockNote,
  parseYouTubeId,
  toBlockNote,
  type BlockNoteDocument,
} from './blockMapping';

// Блочный редактор страницы базы знаний поверх BlockNote с кастомной схемой (whitelist
// BLOCK SCHEMA v1). Инициализируется из value один раз; об изменениях сообщает через
// onChange (страница сохраняет PATCH). Для смены страницы родитель ремонтирует редактор
// по React key (контролируемая синхронизация документа здесь намеренно не делается).

// --- Утилита размера файла (для file-блока) ------------------------------

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

// --- Рендер изображения с дотягиванием протухшего/отсутствующего presigned url ---

interface MediaUrlProps {
  fileId: string;
  initialUrl: string;
  refreshUrl: (fileId: string) => Promise<{ url: string | null }>;
}

const useFreshUrl = ({ fileId, initialUrl, refreshUrl }: MediaUrlProps) => {
  const [url, setUrl] = useState<string>(initialUrl);
  const [failed, setFailed] = useState(false);
  const triedRef = useRef(false);

  const fetchFresh = useCallback(async () => {
    if (!fileId) {
      setFailed(true);
      return;
    }
    try {
      const res = await refreshUrl(fileId);
      if (res.url) {
        setUrl(res.url);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, [fileId, refreshUrl]);

  // Если url пуст изначально (storage был недоступен на чтении) — дотягиваем сразу.
  useEffect(() => {
    if (!initialUrl && !triedRef.current) {
      triedRef.current = true;
      void fetchFresh();
    }
  }, [initialUrl, fetchFresh]);

  // Презентационный onError (протух presigned, 403 от S3) — одна попытка дотянуть свежий.
  const onError = useCallback(() => {
    if (!triedRef.current) {
      triedRef.current = true;
      void fetchFresh();
    } else {
      setFailed(true);
    }
  }, [fetchFresh]);

  return { url, failed, onError };
};

// --- Построение кастомной схемы BlockNote --------------------------------
// Кастомные блоки используют useUploadFile через замыкание (схема создаётся внутри
// компонента, чтобы render'ы имели доступ к актуальным upload/refreshUrl).

const useKnowledgeSchema = () => {
  const { refreshUrl } = useUploadFile();

  return useMemo(() => {
    // divider — горизонтальный разделитель, без inline-контента.
    const dividerBlock = createReactBlockSpec(
      { type: CUSTOM_BLOCK_TYPES.divider, propSchema: {}, content: 'none' },
      {
        render: () => (
          <Box
            component="hr"
            sx={{ my: 1, border: 0, borderTop: '1px solid', borderColor: 'divider', width: '100%' }}
          />
        ),
      },
    );

    // callout — выноска с эмодзи и inline-текстом.
    const calloutBlock = createReactBlockSpec(
      {
        type: CUSTOM_BLOCK_TYPES.callout,
        propSchema: { emoji: { default: '💡' } },
        content: 'inline',
      },
      {
        render: (props) => (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
              width: '100%',
            }}
          >
            <Box sx={{ fontSize: '1.25rem', lineHeight: 1.4 }}>{props.block.props.emoji}</Box>
            <Box ref={props.contentRef} sx={{ flex: 1 }} />
          </Box>
        ),
      },
    );

    // image — file_id + caption; url/url_expires_at только для рендера (не персистятся).
    const imageBlock = createReactBlockSpec(
      {
        type: CUSTOM_BLOCK_TYPES.image,
        propSchema: {
          file_id: { default: '' },
          caption: { default: '' },
          url: { default: '' },
          url_expires_at: { default: '' },
        },
        content: 'none',
      },
      {
        render: (props) => {
          const { file_id: fileId, url: initialUrl, caption } = props.block.props;
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const { url, failed, onError } = useFreshUrl({
            fileId: String(fileId),
            initialUrl: String(initialUrl),
            refreshUrl,
          });
          if (failed || (!url && fileId)) {
            return (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                <BrokenImageIcon fontSize="small" />
                <Typography variant="body2">Файл недоступен</Typography>
              </Stack>
            );
          }
          return (
            <Box sx={{ width: '100%' }}>
              {url ? (
                <Box
                  component="img"
                  src={url}
                  alt={String(caption) || 'Изображение'}
                  onError={onError}
                  sx={{ maxWidth: '100%', borderRadius: 1, display: 'block' }}
                />
              ) : (
                <CircularProgress size={20} />
              )}
              {caption ? (
                <Typography variant="caption" color="text.secondary">
                  {String(caption)}
                </Typography>
              ) : null}
            </Box>
          );
        },
      },
    );

    // file — вложение (PDF/др.): имя, размер, ссылка на скачивание (свежий presigned).
    const fileBlock = createReactBlockSpec(
      {
        type: CUSTOM_BLOCK_TYPES.file,
        propSchema: {
          file_id: { default: '' },
          filename: { default: '' },
          size_bytes: { default: 0 },
          url: { default: '' },
          url_expires_at: { default: '' },
        },
        content: 'none',
      },
      {
        render: (props) => {
          const { file_id: fileId, filename, size_bytes: size, url: initialUrl } = props.block.props;
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const { url, failed, onError } = useFreshUrl({
            fileId: String(fileId),
            initialUrl: String(initialUrl),
            refreshUrl,
          });
          return (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', width: '100%' }}
            >
              <InsertDriveFileIcon fontSize="small" color="action" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {url && !failed ? (
                  <Box
                    component="a"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onError={onError}
                    sx={{ color: 'primary.main', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {String(filename) || 'Файл'}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {String(filename) || 'Файл'} {failed ? '(недоступен)' : ''}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" display="block">
                  {formatBytes(Number(size))}
                </Typography>
              </Box>
            </Stack>
          );
        },
      },
    );

    // video — YouTube iframe по video_id (бэкенд перепроверяет video_id из url).
    const videoBlock = createReactBlockSpec(
      {
        type: CUSTOM_BLOCK_TYPES.video,
        propSchema: {
          provider: { default: 'youtube' },
          url: { default: '' },
          video_id: { default: '' },
        },
        content: 'none',
      },
      {
        render: (props) => {
          const videoId = String(props.block.props.video_id);
          if (!videoId) {
            return (
              <Typography variant="body2" color="text.secondary">
                Видео не указано
              </Typography>
            );
          }
          return (
            <Box
              sx={{ position: 'relative', width: '100%', pt: '56.25%', borderRadius: 1, overflow: 'hidden' }}
            >
              <Box
                component="iframe"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube видео"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            </Box>
          );
        },
      },
    );

    return BlockNoteSchema.create({
      blockSpecs: {
        // Нативные whitelist-блоки.
        paragraph: defaultBlockSpecs.paragraph,
        // Заголовок ограничиваем уровнями 1..3 (BLOCK SCHEMA v1) — чтобы UI не предлагал
        // h4..h6, которые при сериализации всё равно схлопнулись бы в h3 (см. headingLevel).
        heading: createHeadingBlockSpec({ levels: [1, 2, 3] }),
        bulletListItem: defaultBlockSpecs.bulletListItem,
        numberedListItem: defaultBlockSpecs.numberedListItem,
        quote: defaultBlockSpecs.quote,
        table: defaultBlockSpecs.table,
        // Кастомные блоки whitelist v1. createReactBlockSpec возвращает фабрику
        // (options?) => BlockSpec — вызываем её, чтобы получить сам BlockSpec.
        [CUSTOM_BLOCK_TYPES.divider]: dividerBlock(),
        [CUSTOM_BLOCK_TYPES.callout]: calloutBlock(),
        [CUSTOM_BLOCK_TYPES.image]: imageBlock(),
        [CUSTOM_BLOCK_TYPES.file]: fileBlock(),
        [CUSTOM_BLOCK_TYPES.video]: videoBlock(),
      },
    });
  }, [refreshUrl]);
};

// --- Диалог вставки YouTube ----------------------------------------------

interface VideoDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string, videoId: string) => void;
}

const VideoDialog = ({ open, onClose, onSubmit }: VideoDialogProps) => {
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const videoId = useMemo(() => parseYouTubeId(url), [url]);
  const invalid = touched && url.trim().length > 0 && !videoId;

  const handleClose = () => {
    setUrl('');
    setTouched(false);
    onClose();
  };

  const handleSubmit = () => {
    setTouched(true);
    if (!videoId) return;
    onSubmit(url.trim(), videoId);
    setUrl('');
    setTouched(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Вставить видео с YouTube</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Ссылка на YouTube"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={invalid}
          helperText={invalid ? 'Не удалось распознать ссылку YouTube' : ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Отмена</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!videoId}>
          Вставить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- Основной компонент редактора ----------------------------------------

export interface BlockEditorProps {
  value: KnowledgeContent;
  onChange: (blocks: KnowledgeBlock[]) => void;
  readOnly?: boolean;
}

export const BlockEditor = ({ value, onChange, readOnly = false }: BlockEditorProps) => {
  const schema = useKnowledgeSchema();
  const { upload, uploading } = useUploadFile();

  // Инициализируем документ один раз из value; дальнейшая синхронизация — через onChange.
  // Смену страницы родитель делает ремонтом по key. Тип PartialBlock здесь — общий
  // (наш маппер строит валидную форму); editor типизирует его под кастомную схему.
  const initialContent = useMemo<PartialBlock[]>(
    () => toBlockNote(value) as unknown as PartialBlock[],
    // value берётся только при первом маунте — ремонт по key даёт новый initialContent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useCreateBlockNote({ schema, initialContent });

  // PartialBlock под кастомную схему редактора (для insert/replace).
  type SchemaPartialBlock = Parameters<typeof editor.insertBlocks>[0][number];

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  const handleChange = useCallback(() => {
    const doc = editor.document as unknown as BlockNoteDocument;
    onChange(fromBlockNote(doc));
  }, [editor, onChange]);

  // Вставка нового блока в конец документа.
  const appendBlock = useCallback(
    (block: SchemaPartialBlock) => {
      const doc = editor.document;
      const last = doc[doc.length - 1];
      if (last) {
        editor.insertBlocks([block], last.id, 'after');
      } else {
        editor.replaceBlocks(editor.document, [block]);
      }
      handleChange();
    },
    [editor, handleChange],
  );

  const handleImagePick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const res = await upload(file);
        appendBlock({
          type: CUSTOM_BLOCK_TYPES.image,
          props: {
            file_id: res.id,
            caption: res.original_filename ?? '',
            url: res.url ?? '',
            url_expires_at: res.url_expires_at ?? '',
          },
        });
      } catch {
        // Ошибка уже показана уведомлением в useUploadFile (по error.code).
      }
    },
    [upload, appendBlock],
  );

  const handleFilePick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const res = await upload(file);
        appendBlock({
          type: CUSTOM_BLOCK_TYPES.file,
          props: {
            file_id: res.id,
            filename: res.original_filename ?? file.name,
            size_bytes: res.size_bytes ?? file.size,
            url: res.url ?? '',
            url_expires_at: res.url_expires_at ?? '',
          },
        });
      } catch {
        // Ошибка показана уведомлением (FILE_TOO_LARGE/UNSUPPORTED_FILE_TYPE и т.д.).
      }
    },
    [upload, appendBlock],
  );

  const handleVideoSubmit = useCallback(
    (url: string, videoId: string) => {
      appendBlock({
        type: CUSTOM_BLOCK_TYPES.video,
        props: { provider: 'youtube', url, video_id: videoId },
      });
      setVideoOpen(false);
    },
    [appendBlock],
  );

  return (
    <Box>
      {!readOnly ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            startIcon={uploading ? <CircularProgress size={16} /> : <ImageIcon />}
            disabled={uploading}
            onClick={() => imageInputRef.current?.click()}
          >
            Изображение
          </Button>
          <Button
            size="small"
            startIcon={uploading ? <CircularProgress size={16} /> : <AttachFileIcon />}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Файл
          </Button>
          <Button size="small" startIcon={<OndemandVideoIcon />} onClick={() => setVideoOpen(true)}>
            Видео
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void handleImagePick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            // Загрузка идёт в категорию knowledge_base — accept берём из справочника
            // (изображения, PDF, DOCX, XLSX, PPTX), а не дублируем литералом.
            accept={FILE_CATEGORY_POLICY.knowledge_base.accept}
            hidden
            onChange={(e) => {
              void handleFilePick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </Stack>
      ) : null}

      {/* theme="light" жёстко: админка светлая, иначе BlockNote берёт системную тему
          и текст редактора становится белым на белом, сливаясь с кастомными блоками. */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          '& .bn-editor': { backgroundColor: 'transparent' },
        }}
      >
        <BlockNoteView
          editor={editor}
          editable={!readOnly}
          theme="light"
          onChange={handleChange}
        />
      </Box>

      <VideoDialog open={videoOpen} onClose={() => setVideoOpen(false)} onSubmit={handleVideoSubmit} />
    </Box>
  );
};

export default BlockEditor;
