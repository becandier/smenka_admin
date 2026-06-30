import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useYandexMaps } from './useYandexMaps';
import { brand } from '../brand';

// Карта-пикер рабочей точки (Яндекс.Карты 2.1) внутри <SimpleForm>.
// Двусторонне связан с RHF-полями latitude / longitude / radius_meters / address:
//  - метка (клик/перетаскивание) задаёт координаты;
//  - круг визуализирует радиус, перетаскивание его границы меняет radius_meters;
//  - поиск по адресу геокодит строку → координаты + адрес;
//  - перетаскивание метки/клик обратным геокодером подтягивает адрес.
// Координаты в JS API 2.1 — ВЕЗДЕ [latitude, longitude]. SDK нетипизирован (window.ymaps: any).

const SET_OPTS = { shouldDirty: true, shouldValidate: true, shouldTouch: true } as const;
const MIN_RADIUS = 10;
const MAX_RADIUS = 10000;
const DEFAULT_RADIUS = 100;
const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Москва — дефолт для Create

type LatLng = [number, number];

const clampRadius = (r: number): number =>
  Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(r)));

// Округление координат до 6 знаков (≈0.1 м) — совпадает с отображением в List.
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

interface Suggestion {
  address: string;
  coords: LatLng;
}

export const LocationMapField = () => {
  const { status } = useYandexMaps();
  const { control, setValue, getValues } = useFormContext();

  // Реактивные значения формы — для синхронизации «форма → карта» и подсказок UI.
  const [latitude, longitude] = useWatch({ control, name: ['latitude', 'longitude'] });
  const radiusWatch = useWatch({ control, name: 'radius_meters' });
  const hasPoint = typeof latitude === 'number' && typeof longitude === 'number';

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const placemarkRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  // Флаг «изменения идут программно» — чтобы синхронизация формы не зацикливалась
  // через события geometry change (которые срабатывают и на setRadius/setCoordinates).
  const applyingRef = useRef(false);
  // Счётчик запросов обратного геокодера: учитываем только ответ последнего запроса,
  // чтобы при быстрых кликах/перетаскиваниях устаревший ответ не перезаписал адрес.
  const geocodeSeqRef = useRef(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);

  // Программные правки геометрии — под флагом, чтобы их события не писались обратно в форму.
  const silently = useCallback((fn: () => void) => {
    applyingRef.current = true;
    try {
      fn();
    } finally {
      applyingRef.current = false;
    }
  }, []);

  const radiusOrDefault = useCallback((): number => {
    const r = Number(getValues('radius_meters'));
    return clampRadius(Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS);
  }, [getValues]);

  // Обратный геокодер: координаты → адрес в поле address (поле остаётся редактируемым).
  const reverseGeocode = useCallback(
    (coords: LatLng) => {
      const api = window.ymaps;
      if (!api) return;
      const seq = (geocodeSeqRef.current += 1);
      api.geocode(coords, { kind: 'house', results: 1 }).then(
        (res: any) => {
          if (seq !== geocodeSeqRef.current) return; // пришёл устаревший ответ — игнорируем
          const first = res.geoObjects.get(0);
          if (first) setValue('address', first.getAddressLine(), SET_OPTS);
        },
        () => {
          /* адрес не нашёлся — оставляем как есть, не блокируем форму */
        },
      );
    },
    [setValue],
  );

  // Записать координаты точки в форму (из drag/click/поиска).
  const writePoint = useCallback(
    (coords: LatLng) => {
      setValue('latitude', round6(coords[0]), SET_OPTS);
      setValue('longitude', round6(coords[1]), SET_OPTS);
    },
    [setValue],
  );

  // Создать (или подвинуть) метку и круг; центр круга всегда привязан к метке.
  const placeObjects = useCallback(
    (coords: LatLng, radius: number) => {
      const api = window.ymaps;
      const map = mapRef.current;
      if (!api || !map) return;

      if (!placemarkRef.current) {
        placemarkRef.current = new api.Placemark(
          coords,
          {},
          { draggable: true, preset: 'islands#blueDotIcon' },
        );
        placemarkRef.current.events.add('dragend', (e: any) => {
          if (applyingRef.current) return;
          const next = e.get('target').geometry.getCoordinates() as LatLng;
          silently(() => circleRef.current?.geometry.setCoordinates(next));
          writePoint(next);
          reverseGeocode(next);
        });
        map.geoObjects.add(placemarkRef.current);
      } else {
        // Двигаем только при реальном отличии — лишние setCoordinates во время drag дёргают карту.
        const cur = placemarkRef.current.geometry.getCoordinates();
        if (cur[0] !== coords[0] || cur[1] !== coords[1]) {
          placemarkRef.current.geometry.setCoordinates(coords);
        }
      }

      if (!circleRef.current) {
        circleRef.current = new api.Circle([coords, radius], {}, {
          fillColor: `${brand.blue}33`, // Smenka Blue, 20% alpha
          strokeColor: brand.blue,
          strokeWidth: 2,
          strokeOpacity: 0.9,
        });
        map.geoObjects.add(circleRef.current);
        // Редактор круга — перетаскиваемая граница меняет радиус.
        circleRef.current.editor.startEditing();
        circleRef.current.geometry.events.add('change', () => {
          if (applyingRef.current) return;
          const circle = circleRef.current;
          const marker = placemarkRef.current;
          if (!circle) return;
          const r = clampRadius(circle.geometry.getRadius());
          silently(() => {
            if (circle.geometry.getRadius() !== r) circle.geometry.setRadius(r);
            // Центр держим на метке — не даём кругу «уехать» при редактировании.
            if (marker) circle.geometry.setCoordinates(marker.geometry.getCoordinates());
          });
          setValue('radius_meters', r, SET_OPTS);
        });
      } else {
        const cur = circleRef.current.geometry.getCoordinates();
        if (cur[0] !== coords[0] || cur[1] !== coords[1]) {
          circleRef.current.geometry.setCoordinates(coords);
        }
        if (circleRef.current.geometry.getRadius() !== radius) {
          circleRef.current.geometry.setRadius(radius);
        }
      }
    },
    [silently, writePoint, reverseGeocode, setValue],
  );

  // Инициализация карты один раз при готовности API.
  useEffect(() => {
    if (status !== 'ready' || !mapElRef.current || mapRef.current) return;
    const api = window.ymaps;
    if (!api) return;

    const lat = Number(getValues('latitude'));
    const lng = Number(getValues('longitude'));
    const startHasPoint = Number.isFinite(lat) && Number.isFinite(lng);
    const center: LatLng = startHasPoint ? [lat, lng] : DEFAULT_CENTER;

    const map = new api.Map(mapElRef.current, {
      center,
      zoom: startHasPoint ? 16 : 10,
      controls: ['zoomControl', 'geolocationControl', 'fullscreenControl'],
    });
    mapRef.current = map;

    map.events.add('click', (e: any) => {
      const coords = e.get('coords') as LatLng;
      silently(() => placeObjects(coords, radiusOrDefault()));
      writePoint(coords);
      reverseGeocode(coords);
    });

    if (startHasPoint) {
      silently(() => placeObjects([lat, lng], radiusOrDefault()));
    }

    return () => {
      map.destroy();
      mapRef.current = null;
      placemarkRef.current = null;
      circleRef.current = null;
    };
    // Инициализация привязана только к готовности API; значения берём через getValues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Синхронизация «форма → карта»: ручная правка lat/lng/radius двигает метку/круг.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !hasPoint) return;
    // Радиус рисуем ровно как в поле (любое положительное число), иначе — дефолт.
    // Кламп 10–10000 применяется только при записи в форму (drag круга) и валидацией поля,
    // чтобы круг и числовое поле не расходились при невалидном вводе.
    const r = Number(radiusWatch);
    const radiusForMap = Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS;
    silently(() => placeObjects([latitude, longitude], radiusForMap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasPoint, latitude, longitude, radiusWatch]);

  const runSearch = useCallback(() => {
    const api = window.ymaps;
    const q = query.trim();
    if (!api || !q) return;
    setSearching(true);
    api.geocode(q, { results: 5 }).then(
      (res: any) => {
        const out: Suggestion[] = [];
        for (let i = 0; i < 5; i += 1) {
          const g = res.geoObjects.get(i);
          if (!g) break;
          out.push({ address: g.getAddressLine(), coords: g.geometry.getCoordinates() as LatLng });
        }
        setResults(out);
        setSearching(false);
      },
      () => {
        setResults([]);
        setSearching(false);
      },
    );
  }, [query]);

  const pickSuggestion = useCallback(
    (s: Suggestion) => {
      silently(() => placeObjects(s.coords, radiusOrDefault()));
      mapRef.current?.setCenter(s.coords, 16);
      writePoint(s.coords);
      setValue('address', s.address, SET_OPTS);
      setResults([]);
      setQuery(s.address);
    },
    [silently, placeObjects, radiusOrDefault, writePoint, setValue],
  );

  if (status === 'idle') {
    return (
      <Alert severity="info" sx={{ width: '100%' }}>
        Карта Яндекса не подключена (не задан <code>VITE_YANDEX_MAPS_API_KEY</code>). Укажите
        координаты и радиус вручную в полях ниже.
      </Alert>
    );
  }

  if (status === 'error') {
    return (
      <Alert severity="warning" sx={{ width: '100%' }}>
        Не удалось загрузить Яндекс.Карты — проверьте ключ API и список разрешённых доменов.
        Координаты и радиус можно ввести вручную в полях ниже.
      </Alert>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Точка на карте
      </Typography>

      {status === 'loading' && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Загрузка карты…
          </Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          fullWidth
          label="Поиск по адресу"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch();
            }
          }}
          disabled={status !== 'ready'}
        />
        <Button
          variant="outlined"
          onClick={runSearch}
          disabled={status !== 'ready' || searching || query.trim() === ''}
        >
          {searching ? <CircularProgress size={18} /> : 'Найти'}
        </Button>
      </Stack>

      {results.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 1, maxHeight: 200, overflow: 'auto' }}>
          <List dense disablePadding>
            {results.map((s, i) => (
              <ListItemButton key={`${s.address}-${i}`} onClick={() => pickSuggestion(s)}>
                <ListItemText primary={s.address} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      <Box
        ref={mapElRef}
        sx={{
          width: '100%',
          height: 360,
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'action.hover',
        }}
      />

      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Кликните по карте или перетащите метку, чтобы задать координаты. Радиус — перетаскиванием
        границы круга или полем «Радиус, м» (10–10000).
      </Typography>
    </Box>
  );
};
