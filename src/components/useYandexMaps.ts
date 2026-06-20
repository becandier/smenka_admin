import { useEffect, useState } from 'react';
import { YANDEX_MAPS_SCRIPT_URL } from '../config';

// Статусы загрузки JS API Яндекс.Карт:
//  - idle    — ключ не задан, карту не подключаем (ручной режим формы);
//  - loading — скрипт грузится / ждём ymaps.ready;
//  - ready   — ymaps готов, можно создавать карту/геокодер;
//  - error   — сеть/невалидный ключ/домен — показываем фолбэк.
export type YandexMapsStatus = 'idle' | 'loading' | 'ready' | 'error';

// Один промис на всё приложение: скрипт грузится единожды, даже при нескольких
// формах подряд и двойном маунте React StrictMode в dev.
let loadPromise: Promise<void> | null = null;

const loadYmaps = (url: string): Promise<void> => {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    // Скрипт уже на странице (HMR / повторный вход в форму) — ждём только готовности API.
    if (window.ymaps?.ready) {
      window.ymaps.ready(() => resolve());
      return;
    }
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.dataset.ymaps = 'true';
    el.onload = () => {
      if (window.ymaps?.ready) window.ymaps.ready(() => resolve());
      else reject(new Error('ymaps namespace missing after load'));
    };
    el.onerror = () => {
      // Сбрасываем промис, чтобы при следующем входе в форму была повторная попытка.
      loadPromise = null;
      reject(new Error('ymaps script load error'));
    };
    document.body.appendChild(el);
  });
  return loadPromise;
};

// Ленивая загрузка Яндекс.Карт. Без ключа возвращает status='idle' и не трогает сеть.
export const useYandexMaps = (): { status: YandexMapsStatus; ymaps: unknown } => {
  const url = YANDEX_MAPS_SCRIPT_URL;
  const [status, setStatus] = useState<YandexMapsStatus>(url ? 'loading' : 'idle');

  useEffect(() => {
    if (!url) {
      setStatus('idle');
      return;
    }
    let alive = true;
    loadYmaps(url).then(
      () => alive && setStatus('ready'),
      () => alive && setStatus('error'),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  return { status, ymaps: status === 'ready' ? window.ymaps : null };
};
