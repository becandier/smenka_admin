// Чистая логика отображения фото пункта чек-листа с учётом срока хранения
// (docs/tasks/checklist_photo_retention/admin.md). Вынесена из ChecklistItemPhotos.tsx в
// модуль без импорта 'react-admin'/MUI, чтобы её можно было протестировать в vitest напрямую —
// прямой импорт 'react-admin' ломает ESM-резолвер vitest (см. комментарий в utils/networkError.ts).

export interface RetentionAwarePhoto {
  url?: string | null;
  purged_at?: string | null;
  expires_at?: string | null;
}

// Фото удалено по сроку хранения: `purged_at` проставляется бэком один раз и навсегда
// (объект в S3 удалён необратимо), presigned url для него не выдаётся никогда.
export const isPhotoPurged = (photo: RetentionAwarePhoto): boolean => photo.purged_at != null;

// Перезапрашивать свежий presigned url (GET /files/{file_id}) нужно только когда фото ещё
// живо, а url не пришёл в payload — деградация storage при отдаче детали (admin.md п.3).
// Для уже удалённого по сроку фото запрос заведомо ответит 410 FILE_PURGED — не делаем
// его вовсе (admin.md п.1: «ссылку… не запрашивать»).
export const shouldFetchPhotoUrl = (photo: RetentionAwarePhoto): boolean =>
  !isPhotoPurged(photo) && !photo.url;

// «Хранится до …» показываем только у живого фото с известным сроком удаления. У уже
// удалённого фото и у фото при выключенной очистке `expires_at` приходит null (backend.md).
export const shouldShowExpiry = (photo: RetentionAwarePhoto): boolean =>
  !isPhotoPurged(photo) && photo.expires_at != null;
