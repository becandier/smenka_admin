import { useEffect, useState } from 'react';

// Одноразовая загрузка данных при монтировании/смене deps.
// Возвращает {data, error}; data=null пока грузится. Гонки гасит флагом active.
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): {
  data: T | null;
  error: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    fn()
      .then((res) => active && setData(res))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
    // fn пересоздаётся каждый рендер — перезапуск контролируем явными deps.
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error };
}
