// Сжатие изображений базы знаний перед загрузкой (docs/tasks/storage_housekeeping/admin.md, п.2).
// Раздел «Решения» — чистые функции без browser/canvas API, покрыты тестами напрямую в vitest
// (тестовый контур без jsdom, см. аналогичный комментарий в checklistPhotoRetention.ts).
// Раздел «Исполнение» использует Image(createImageBitmap)/canvas/Blob браузера, вызывается
// только из BlockEditor.handleImagePick и сам не тестируется — использует исключительно уже
// проверенные функции решений, поэтому вся ветвящаяся логика остаётся покрытой.

import { FILE_CATEGORY_POLICY } from './files';

// --- Решения ----------------------------------------------------------------

export const MAX_IMAGE_SIDE_PX = 2000;
export const IMAGE_OUTPUT_QUALITY = 0.85;

// GIF (может быть анимированным) и SVG не обрабатываем — грузим как есть (admin.md).
const UNPROCESSED_MIME_TYPES = new Set(['image/gif', 'image/svg+xml']);

export const shouldSkipImageProcessing = (mimeType: string): boolean =>
  UNPROCESSED_MIME_TYPES.has(mimeType);

export interface ImageSize {
  width: number;
  height: number;
}

// Большая сторона больше maxSide (по умолчанию 2000 px) → уменьшаем с сохранением пропорций;
// меньше или равно — размеры не меняем.
export const computeTargetSize = (
  size: ImageSize,
  maxSide: number = MAX_IMAGE_SIDE_PX,
): ImageSize => {
  const largerSide = Math.max(size.width, size.height);
  if (largerSide <= maxSide || largerSide <= 0) return size;
  const scale = maxSide / largerSide;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

export type ImageOutputFormat = 'image/jpeg' | 'image/webp' | 'image/png';

export interface OutputFormatDecision {
  mimeType: ImageOutputFormat;
  extension: 'jpg' | 'webp' | 'png';
}

// Без прозрачности → JPEG (~0.85 качества). С прозрачностью (PNG/WebP с альфа-каналом) —
// WebP, если браузер умеет его кодировать, иначе PNG (без потерь — не ломает альфа-канал там,
// где WebP недоступен).
export const chooseOutputFormat = (
  hasAlpha: boolean,
  webpEncodeSupported: boolean,
): OutputFormatDecision => {
  if (!hasAlpha) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (webpEncodeSupported) return { mimeType: 'image/webp', extension: 'webp' };
  return { mimeType: 'image/png', extension: 'png' };
};

export interface CompressionOutcome {
  originalBytes: number;
  compressedBytes: number;
  sizeChanged: boolean;
}

// «Нет выигрыша»: результат не меньше исходника, а размеры не менялись → используем исходник.
// Если размеры уменьшились (пересжатая картинка физически меньше по пикселям), результат
// используем даже без выигрыша в байтах — сравнение по байтам в этом случае не показательно.
export const shouldUseCompressedResult = ({
  compressedBytes,
  originalBytes,
  sizeChanged,
}: CompressionOutcome): boolean => sizeChanged || compressedBytes < originalBytes;

// Базовое имя сохраняем, расширение приводим к итоговому формату (photo.png → photo.jpg).
// Имя без точки (расширения нет) — расширение просто дописывается.
export const renameToExtension = (originalName: string, extension: string): string => {
  const lastDot = originalName.lastIndexOf('.');
  const base = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
  return `${base}.${extension}`;
};

// Итоговый файл больше лимита категории knowledge_base — понятная ошибка без запроса к серверу.
// Та же граница, что и validateFileForCategory (utils/files.ts), но по числу байт — здесь не
// нужен реальный File, только его итоговый размер после (не)сжатия.
export const exceedsKnowledgeBaseSizeLimit = (bytes: number): boolean =>
  bytes > FILE_CATEGORY_POLICY.knowledge_base.maxSizeBytes;

// --- Исполнение (браузер) -----------------------------------------------------

// Быстрая синхронная проверка поддержки кодирования WebP: canvas.toDataURL по спецификации
// откатывается на 'data:image/png;...', если запрошенный формат кодировать не умеет.
const canEncodeWebp = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
};

// Даунскейл для проверки альфа-канала — сканировать полноразмерную картинку ради бинарного
// вопроса «есть ли хоть один непрозрачный пиксель» дорого, а для этого вопроса не нужно.
const ALPHA_SAMPLE_MAX_SIDE = 64;

const detectAlpha = (bitmap: ImageBitmap): boolean => {
  const sample = computeTargetSize(
    { width: bitmap.width, height: bitmap.height },
    ALPHA_SAMPLE_MAX_SIDE,
  );
  const canvas = document.createElement('canvas');
  canvas.width = sample.width;
  canvas.height = sample.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob вернул null'))),
      type,
      quality,
    );
  });

// Сжимает выбранное изображение базы знаний перед загрузкой. Любой сбой обработки (файл не
// декодировался, недоступен canvas/toBlob) — молча возвращает исходный файл: это не должно
// блокировать загрузку, только пропускает оптимизацию (admin.md: «пользователю ошибку не
// показывать»). Итоговый файл на превышение лимита категории вызывающая сторона проверяет
// отдельно (exceedsKnowledgeBaseSizeLimit/validateFileForCategory) — это уже видимая ошибка.
export const compressKnowledgeImage = async (file: File): Promise<File> => {
  if (shouldSkipImageProcessing(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const originalSize: ImageSize = { width: bitmap.width, height: bitmap.height };
      // JPEG не хранит альфа-канал в принципе — сканировать его на прозрачность бессмысленно.
      const hasAlpha = file.type === 'image/jpeg' ? false : detectAlpha(bitmap);
      const target = computeTargetSize(originalSize);
      const format = chooseOutputFormat(hasAlpha, canEncodeWebp());

      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      // Целимся в JPEG только когда hasAlpha уже false, но подстилаем белый фон на случай
      // формально альфа-канального источника без реально прозрачных пикселей — иначе часть
      // движков рендерит такие места чёрным вместо белого при конвертации в JPEG.
      if (format.mimeType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, target.width, target.height);
      }
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);

      const blob = await canvasToBlob(canvas, format.mimeType, IMAGE_OUTPUT_QUALITY);
      const sizeChanged =
        target.width !== originalSize.width || target.height !== originalSize.height;
      const useCompressed = shouldUseCompressedResult({
        originalBytes: file.size,
        compressedBytes: blob.size,
        sizeChanged,
      });
      if (!useCompressed) return file;

      return new File([blob], renameToExtension(file.name, format.extension), {
        type: format.mimeType,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
};
