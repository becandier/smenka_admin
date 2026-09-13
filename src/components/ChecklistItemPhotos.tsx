import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataProvider } from 'react-admin';
import { Box, Dialog, DialogContent, IconButton, Link, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import AutoDeleteOutlinedIcon from '@mui/icons-material/AutoDeleteOutlined';
import { photoCaptureLabel } from '../utils/format';
import { isFilePurgedError } from '../utils/files';
import { isPhotoPurged, shouldFetchPhotoUrl, shouldShowExpiry } from '../utils/checklistPhotoRetention';
import { OrganizationTimeText } from './TimeText';

// Фото пункта-экземпляра чек-листа (см. checklist_photos/admin.md, checklist_photo_retention/admin.md).
// Все поля сверх id/file_id — optional: presigned url может прийти null (деградация storage),
// метаданные геолокации могут отсутствовать (геолокация была недоступна — допустимый кейс).
// purged_at/expires_at — срок хранения (checklist_photo_retention): не null у purged_at
// означает, что объект в S3 удалён безвозвратно и url для него больше не выдаётся.
export interface ChecklistPhoto {
  id: string;
  file_id: string;
  url?: string | null;
  url_expires_at?: string | null;
  captured_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  position?: number;
  purged_at?: string | null;
  expires_at?: string | null;
}

// Внешняя ссылка на карту по координатам (MVP: без встроенного виджета). Яндекс.Карты
// ждут точку как «долгота,широта».
const mapUrl = (lat: number, lng: number): string =>
  `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;

const THUMB_SIZE = 132;

// Координаты фото: кликабельная ссылка на карту либо «нет данных» (геолокации не было).
const PhotoCoords = ({
  latitude,
  longitude,
}: {
  latitude?: number | null;
  longitude?: number | null;
}) => {
  if (latitude == null || longitude == null) {
    return (
      <Typography variant="caption" color="text.secondary">
        Координаты: нет данных
      </Typography>
    );
  }
  return (
    <Link
      href={mapUrl(latitude, longitude)}
      target="_blank"
      rel="noopener noreferrer"
      variant="caption"
    >
      {latitude.toFixed(5)}, {longitude.toFixed(5)}
    </Link>
  );
};

// Плитка того же размера вместо миниатюры для фото, удалённого по сроку хранения —
// нейтральная иконка (не «ошибка»/красный цвет, это ожидаемое состояние, admin.md п.1).
// Не кликабельна: полноэкранный просмотр для удалённого фото не открываем.
const PurgedPhotoTile = () => (
  <Stack
    alignItems="center"
    justifyContent="center"
    spacing={0.5}
    sx={{
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: 1,
      bgcolor: 'action.hover',
      color: 'text.secondary',
      textAlign: 'center',
      px: 1,
    }}
  >
    <AutoDeleteOutlinedIcon fontSize="small" />
    <Typography variant="caption">Фото удалено — истёк срок хранения</Typography>
  </Stack>
);

// Одна миниатюра. presigned url короткоживущий: при ошибке загрузки картинки (типично 403
// от S3 на протухшую ссылку) — один перезапрос свежего url через GET /files/{file_id}.
// Если url не пришёл в payload (storage деградировал при отдаче detail) — запрашиваем сразу.
// Фото, уже помеченное как удалённое по сроку хранения (purged_at != null) — GET /files не
// запрашивается вовсе; если 410 FILE_PURGED пришёл только при перезапросе (фото удалили,
// пока экран был открыт) — тихо переходим в то же состояние, без сообщения об ошибке
// (admin.md п.4).
const PhotoThumb = ({
  photo,
  onOpen,
}: {
  photo: ChecklistPhoto;
  onOpen: (url: string) => void;
}) => {
  const dataProvider = useDataProvider();
  const [url, setUrl] = useState<string | null>(photo.url ?? null);
  const [failed, setFailed] = useState(false);
  const [purgedLocally, setPurgedLocally] = useState(false);
  // Рефрешим url не более одного раза: после повторной ошибки показываем плейсхолдер.
  const refreshed = useRef(false);

  const refresh = useCallback(() => {
    if (refreshed.current) {
      setFailed(true);
      return;
    }
    refreshed.current = true;
    dataProvider
      .getFile(photo.file_id)
      .then((file: { url?: string | null } | null) => {
        if (file?.url) setUrl(file.url);
        else setFailed(true);
      })
      .catch((error: unknown) => {
        if (isFilePurgedError(error)) {
          setPurgedLocally(true);
          return;
        }
        setFailed(true);
      });
  }, [dataProvider, photo.file_id]);

  // Булевы значения, а не весь `photo`: объект пункта пересоздаётся при каждом рендере
  // родителя (`[...photos].sort(...)` в ChecklistItemPhotos) — зависимость эффекта на его
  // ссылку заново запускала бы refresh() при каждом ре-рендере списка.
  const needsUrlFetch = shouldFetchPhotoUrl(photo);
  const purged = isPhotoPurged(photo) || purgedLocally;

  useEffect(() => {
    if (needsUrlFetch) refresh();
  }, [needsUrlFetch, refresh]);

  if (purged) {
    return <PurgedPhotoTile />;
  }

  if (failed) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        spacing={0.5}
        sx={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: 1,
          bgcolor: 'action.hover',
          color: 'text.disabled',
        }}
      >
        <BrokenImageOutlinedIcon fontSize="small" />
        <Typography variant="caption">Фото недоступно</Typography>
      </Stack>
    );
  }

  if (!url) {
    // Свежий url ещё грузится (payload без url) — плейсхолдер-загрузка.
    return (
      <Box
        sx={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 1, bgcolor: 'action.hover' }}
      />
    );
  }

  return (
    <Box
      component="img"
      src={url}
      alt="Фото пункта"
      loading="lazy"
      onClick={() => onOpen(url)}
      onError={refresh}
      sx={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        objectFit: 'cover',
        borderRadius: 1,
        cursor: 'pointer',
        display: 'block',
      }}
    />
  );
};

// Блок фото пункта чек-листа: миниатюры (с метаданными под каждой) + лайтбокс по клику.
// На фото уже вжжён видимый штамп даты/времени+координат — это часть картинки. photoSource
// влияет на подпись метки («Снято» для camera, «Добавлено» для camera_or_gallery).
export const ChecklistItemPhotos = ({
  photos,
  photoSource,
  timeZone,
}: {
  photos: ChecklistPhoto[];
  photoSource?: string | null;
  timeZone?: string | null;
}) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  const captureLabel = photoCaptureLabel(photoSource);
  const sorted = [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        {sorted.map((photo) => (
          <Stack key={photo.id} spacing={0.25} sx={{ width: THUMB_SIZE }}>
            <PhotoThumb photo={photo} onOpen={setLightboxUrl} />
            <Typography variant="caption" color="text.secondary">
              {captureLabel}: <OrganizationTimeText value={photo.captured_at} timeZone={timeZone} />
            </Typography>
            <PhotoCoords latitude={photo.latitude} longitude={photo.longitude} />
            {isPhotoPurged(photo) && (
              <Typography variant="caption" color="text.secondary">
                Удалено: <OrganizationTimeText value={photo.purged_at} timeZone={timeZone} kind="date" />
              </Typography>
            )}
            {shouldShowExpiry(photo) && (
              <Typography variant="caption" color="text.secondary">
                Хранится до <OrganizationTimeText value={photo.expires_at} timeZone={timeZone} kind="date" />
              </Typography>
            )}
          </Stack>
        ))}
      </Stack>

      <Dialog open={lightboxUrl !== null} onClose={() => setLightboxUrl(null)} maxWidth="lg">
        <IconButton
          onClick={() => setLightboxUrl(null)}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'common.white', zIndex: 1 }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ p: 0, bgcolor: 'common.black' }}>
          {lightboxUrl && (
            <Box
              component="img"
              src={lightboxUrl}
              alt="Фото пункта"
              sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
