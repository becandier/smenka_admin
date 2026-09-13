import { describe, expect, it } from 'vitest';
import { FILE_PURGED_CODE, fileErrorMessage, isFilePurgedError } from './files';

// Контракт checklist_photo_retention/backend.md: GET /files/{file_id} для файла, чей объект
// уже удалён из хранилища по сроку хранения, отвечает 410 FILE_PURGED. ChecklistItemPhotos
// перезапрашивает ссылку через dataProvider.getFile — ошибка приходит как HttpError с
// error.body.code (см. request() в providers/dataProvider.ts, который расправляет {data,error}
// в `throw new HttpError(message, res.status, body)`, где body — это разложенный error).

describe('isFilePurgedError', () => {
  it('true для HttpError-подобной ошибки с body.code === FILE_PURGED', () => {
    expect(isFilePurgedError({ body: { code: 'FILE_PURGED' } })).toBe(true);
    expect(isFilePurgedError({ body: { code: FILE_PURGED_CODE } })).toBe(true);
  });

  it('false для прочих кодов и отсутствия code/body', () => {
    expect(isFilePurgedError({ body: { code: 'FILE_NOT_FOUND' } })).toBe(false);
    expect(isFilePurgedError({ body: {} })).toBe(false);
    expect(isFilePurgedError({})).toBe(false);
    expect(isFilePurgedError(null)).toBe(false);
    expect(isFilePurgedError(undefined)).toBe(false);
  });
});

describe('fileErrorMessage — FILE_PURGED', () => {
  it('отдаёт понятный текст, а не generic-фолбэк', () => {
    expect(fileErrorMessage({ body: { code: 'FILE_PURGED' } })).toBe(
      'Файл удалён по истечении срока хранения',
    );
  });
});
