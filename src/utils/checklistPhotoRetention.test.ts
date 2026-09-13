import { describe, expect, it } from 'vitest';
import { isPhotoPurged, shouldFetchPhotoUrl, shouldShowExpiry } from './checklistPhotoRetention';

// Приёмка admin.md: удалённое по сроку фото даёт плитку-заглушку без запроса GET /files;
// живое с известным сроком показывает «Хранится до»; url=null + purged_at=null (деградация
// storage) — перезапрос как раньше.

describe('isPhotoPurged', () => {
  it('true только когда purged_at не null', () => {
    expect(isPhotoPurged({ purged_at: '2026-09-24T02:00:41Z' })).toBe(true);
    expect(isPhotoPurged({ purged_at: null })).toBe(false);
    expect(isPhotoPurged({})).toBe(false);
  });
});

describe('shouldFetchPhotoUrl', () => {
  it('живое фото без url (деградация storage) — запрашиваем свежую ссылку', () => {
    expect(shouldFetchPhotoUrl({ url: null, purged_at: null })).toBe(true);
    expect(shouldFetchPhotoUrl({ url: undefined, purged_at: null })).toBe(true);
  });

  it('живое фото с url — запрос не нужен', () => {
    expect(shouldFetchPhotoUrl({ url: 'https://s3.example/photo.jpg', purged_at: null })).toBe(
      false,
    );
  });

  it('удалённое по сроку фото — GET /files не запрашивается, даже если url тоже null', () => {
    expect(shouldFetchPhotoUrl({ url: null, purged_at: '2026-09-24T02:00:41Z' })).toBe(false);
  });
});

describe('shouldShowExpiry', () => {
  it('живое фото с известным сроком — показываем «Хранится до»', () => {
    expect(shouldShowExpiry({ purged_at: null, expires_at: '2026-09-24T02:00:41Z' })).toBe(true);
  });

  it('живое фото без срока (очистка выключена) — подпись не нужна', () => {
    expect(shouldShowExpiry({ purged_at: null, expires_at: null })).toBe(false);
  });

  it('удалённое фото — подпись «Хранится до» не показываем (у него уже есть заглушка)', () => {
    expect(
      shouldShowExpiry({ purged_at: '2026-09-24T02:00:41Z', expires_at: null }),
    ).toBe(false);
  });
});
