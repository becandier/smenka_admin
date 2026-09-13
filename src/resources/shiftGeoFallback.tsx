import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataProvider, useRecordContext, type RaRecord } from 'react-admin';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocationOffOutlinedIcon from '@mui/icons-material/LocationOffOutlined';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import AutoDeleteOutlinedIcon from '@mui/icons-material/AutoDeleteOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { geoFallbackReasonLabel, workLocationLabel } from '../utils/format';
import { fileErrorMessage, isFilePurgedError } from '../utils/files';
import { InfoRow } from '../components/InfoRow';

// Старт смены по фото при недоступной геолокации (shift_geo_photo_fallback/admin.md).
// ShiftResponse отдаёт три поля: geo_fallback (derived, всегда есть), geo_fallback_reason
// (машинный код гео-ошибки клиента) и geo_fallback_photo_file_id (может стать null, если
// файл удалили — признак fallback при этом не теряется).

const THUMB_SIZE = 180;

// geo_fallback приходит всегда (derived на бэке); undefined — только у ответа старого билда.
const isGeoFallback = (record: RaRecord | undefined): record is RaRecord =>
  record?.geo_fallback === true;

// Компактный бейдж списка смен: только у смен со стартом без гео, обычные смены — пусто
// (без визуального шума). Причина — в tooltip, чтобы не раздувать и без того широкую таблицу.
export const GeoFallbackChip = (record: RaRecord) => {
  if (!isGeoFallback(record)) return null;
  return (
    <Tooltip title={geoFallbackReasonLabel(record.geo_fallback_reason)}>
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        icon={<LocationOffOutlinedIcon />}
        label="Без гео"
      />
    </Tooltip>
  );
};

type PhotoState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }
  | { status: 'purged' };

// Фото старта смены. Presigned URL живёт ограниченное время, поэтому не храним его в записи
// смены, а запрашиваем GET /files/{file_id} при открытии карточки. Протухшую ссылку
// (ошибка <img> — типично 403 от S3) один раз чиним автоматически, как в ChecklistItemPhotos;
// после повторной неудачи показываем заглушку с ручным повтором.
// Отдельно: 410 FILE_PURGED (storage_housekeeping/admin.md) — фото удалено по сроку хранения
// (90 дней, SHIFT_GEO_PHOTO_RETENTION_DAYS). Это ожидаемое состояние, а не сбой — нейтральная
// заглушка без кнопки повтора и без полноэкранного просмотра, как PurgedPhotoTile в
// ChecklistItemPhotos.
const GeoFallbackPhoto = ({ fileId }: { fileId: string }) => {
  const dataProvider = useDataProvider();
  const [state, setState] = useState<PhotoState>({ status: 'loading' });
  const [lightbox, setLightbox] = useState(false);
  const autoRefreshed = useRef(false);
  // Номер запроса: ответ более раннего запроса не должен перетереть результат более позднего.
  const requestId = useRef(0);

  // Запрос свежего presigned URL — из монтирования и из обработчиков ошибки/повтора
  // (тот же приём, что refresh у PhotoThumb в ChecklistItemPhotos).
  const load = useCallback(() => {
    const id = ++requestId.current;
    setState({ status: 'loading' });
    // Единственное место, где гасится лайтбокс: пока картинки нет, диалог всё равно
    // размонтирован — и после успеха не должен распахнуться сам собой.
    setLightbox(false);
    dataProvider
      .getFile(fileId)
      .then((file: { url?: string | null } | null) => {
        if (id !== requestId.current) return;
        if (file?.url) setState({ status: 'ready', url: file.url });
        else setState({ status: 'error', message: 'Не удалось загрузить фото' });
      })
      .catch((error: unknown) => {
        if (id !== requestId.current) return;
        if (isFilePurgedError(error)) {
          setState({ status: 'purged' });
          return;
        }
        setState({ status: 'error', message: fileErrorMessage(error) });
      });
  }, [dataProvider, fileId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ошибка <img>: первая — молча перезапрашиваем свежий URL, вторая — заглушка.
  const handleImageError = (): void => {
    if (autoRefreshed.current) {
      setState({ status: 'error', message: 'Не удалось загрузить фото' });
      return;
    }
    autoRefreshed.current = true;
    load();
  };

  // Ручной повтор снова разрешает один автоматический перезапрос.
  const retry = (): void => {
    autoRefreshed.current = false;
    load();
  };

  if (state.status === 'loading') {
    return (
      <Box
        sx={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (state.status === 'purged') {
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
          color: 'text.secondary',
          p: 1,
          textAlign: 'center',
        }}
      >
        <AutoDeleteOutlinedIcon fontSize="small" />
        <Typography variant="caption">Фото удалено — истёк срок хранения (90 дней)</Typography>
      </Stack>
    );
  }

  if (state.status === 'error') {
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
          color: 'text.secondary',
          p: 1,
          textAlign: 'center',
        }}
      >
        <BrokenImageOutlinedIcon fontSize="small" />
        <Typography variant="caption">{state.message}</Typography>
        <Button size="small" startIcon={<ReplayIcon />} onClick={retry}>
          Повторить
        </Button>
      </Stack>
    );
  }

  return (
    <>
      <Box
        component="img"
        src={state.url}
        alt="Фото старта смены"
        loading="lazy"
        onClick={() => setLightbox(true)}
        onError={handleImageError}
        sx={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          objectFit: 'cover',
          borderRadius: 1,
          cursor: 'pointer',
          display: 'block',
        }}
      />
      <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="lg">
        <IconButton
          onClick={() => setLightbox(false)}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'common.white', zIndex: 1 }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ p: 0, bgcolor: 'common.black' }}>
          <Box
            component="img"
            src={state.url}
            alt="Фото старта смены"
            onError={handleImageError}
            sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

// Карточка детали смены «Старт без геопроверки»: рендерится только для fallback-смен.
// Точку в этой ветке выбирал сам сотрудник (координат не было) — подписываем это явно,
// чтобы админ не читал её как подтверждённую геопроверкой.
export const ShiftGeoFallbackSection = () => {
  const record = useRecordContext();
  if (!isGeoFallback(record)) return null;

  const fileId = record.geo_fallback_photo_file_id
    ? String(record.geo_fallback_photo_file_id)
    : null;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Старт без геопроверки</Typography>
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            icon={<LocationOffOutlinedIcon />}
            label="Без гео"
          />
        </Stack>
        <Stack spacing={0.5} sx={{ mb: 1.5 }}>
          <InfoRow label="Причина">{geoFallbackReasonLabel(record.geo_fallback_reason)}</InfoRow>
          <InfoRow label="Точка">{workLocationLabel(record.work_location ?? null)}</InfoRow>
          <Typography variant="caption" color="text.secondary">
            Точку указал сотрудник — координаты на старте не проверялись.
          </Typography>
        </Stack>
        <Typography variant="subtitle2" gutterBottom>
          Фото с камеры
        </Typography>
        {fileId ? (
          <GeoFallbackPhoto fileId={fileId} />
        ) : (
          <Typography color="text.secondary">Фото удалено</Typography>
        )}
      </CardContent>
    </Card>
  );
};
