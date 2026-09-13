import { describe, expect, it } from 'vitest';
import {
  chooseOutputFormat,
  computeTargetSize,
  exceedsKnowledgeBaseSizeLimit,
  renameToExtension,
  shouldSkipImageProcessing,
  shouldUseCompressedResult,
} from './knowledgeImageCompression';
import { FILE_CATEGORY_POLICY } from './files';

// Приёмка storage_housekeeping/admin.md п.2: тесты покрывают только «решения» (формат,
// размеры, «нет выигрыша», лимит размера) — без browser/canvas API, см. комментарий в
// knowledgeImageCompression.ts про раздел «Исполнение».

describe('shouldSkipImageProcessing', () => {
  it('GIF и SVG не обрабатываются', () => {
    expect(shouldSkipImageProcessing('image/gif')).toBe(true);
    expect(shouldSkipImageProcessing('image/svg+xml')).toBe(true);
  });

  it('растровые форматы, которые умеем сжимать, обрабатываются', () => {
    expect(shouldSkipImageProcessing('image/jpeg')).toBe(false);
    expect(shouldSkipImageProcessing('image/png')).toBe(false);
    expect(shouldSkipImageProcessing('image/webp')).toBe(false);
    expect(shouldSkipImageProcessing('image/heic')).toBe(false);
  });
});

describe('computeTargetSize', () => {
  it('большая сторона больше 2000 px — уменьшает с сохранением пропорций (альбомная)', () => {
    expect(computeTargetSize({ width: 4000, height: 2000 })).toEqual({
      width: 2000,
      height: 1000,
    });
  });

  it('большая сторона больше 2000 px — уменьшает с сохранением пропорций (портретная)', () => {
    expect(computeTargetSize({ width: 1500, height: 6000 })).toEqual({
      width: 500,
      height: 2000,
    });
  });

  it('квадратное изображение ровно по порогу — не меняется', () => {
    expect(computeTargetSize({ width: 2000, height: 2000 })).toEqual({
      width: 2000,
      height: 2000,
    });
  });

  it('маленькое изображение — размеры не меняются', () => {
    expect(computeTargetSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it('нестандартный порог (используется для сэмпла альфа-детекции)', () => {
    expect(computeTargetSize({ width: 256, height: 128 }, 64)).toEqual({ width: 64, height: 32 });
  });
});

describe('chooseOutputFormat', () => {
  it('без прозрачности — всегда JPEG, независимо от поддержки WebP', () => {
    expect(chooseOutputFormat(false, true)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(chooseOutputFormat(false, false)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
  });

  it('с прозрачностью и поддержкой WebP — WebP', () => {
    expect(chooseOutputFormat(true, true)).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('с прозрачностью без поддержки WebP — PNG', () => {
    expect(chooseOutputFormat(true, false)).toEqual({ mimeType: 'image/png', extension: 'png' });
  });
});

describe('shouldUseCompressedResult', () => {
  it('размеры не менялись, результат не меньше исходника — «нет выигрыша», используем исходник', () => {
    expect(
      shouldUseCompressedResult({ originalBytes: 1000, compressedBytes: 1000, sizeChanged: false }),
    ).toBe(false);
    expect(
      shouldUseCompressedResult({ originalBytes: 1000, compressedBytes: 1200, sizeChanged: false }),
    ).toBe(false);
  });

  it('размеры не менялись, результат меньше — используем сжатый', () => {
    expect(
      shouldUseCompressedResult({ originalBytes: 1000, compressedBytes: 800, sizeChanged: false }),
    ).toBe(true);
  });

  it('размеры уменьшились — используем сжатый, даже если байт не меньше', () => {
    expect(
      shouldUseCompressedResult({ originalBytes: 1000, compressedBytes: 1200, sizeChanged: true }),
    ).toBe(true);
  });
});

describe('renameToExtension', () => {
  it('меняет расширение, сохраняя базовое имя', () => {
    expect(renameToExtension('photo.png', 'jpg')).toBe('photo.jpg');
    expect(renameToExtension('avatar.PNG', 'webp')).toBe('avatar.webp');
  });

  it('имя с несколькими точками — заменяется только последнее расширение', () => {
    expect(renameToExtension('my.trip.photo.png', 'jpg')).toBe('my.trip.photo.jpg');
  });

  it('имя без расширения — расширение просто дописывается', () => {
    expect(renameToExtension('photo', 'jpg')).toBe('photo.jpg');
  });
});

describe('exceedsKnowledgeBaseSizeLimit', () => {
  const limit = FILE_CATEGORY_POLICY.knowledge_base.maxSizeBytes;

  it('превышение лимита категории knowledge_base — true', () => {
    expect(exceedsKnowledgeBaseSizeLimit(limit + 1)).toBe(true);
  });

  it('ровно на лимите и ниже — false', () => {
    expect(exceedsKnowledgeBaseSizeLimit(limit)).toBe(false);
    expect(exceedsKnowledgeBaseSizeLimit(limit - 1)).toBe(false);
  });
});
