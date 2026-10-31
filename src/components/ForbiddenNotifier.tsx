import { useEffect, useRef } from 'react';
import { useNotificationContext, useNotify, type NotificationPayload } from 'react-admin';
import { subscribeForbiddenError } from '../providers/forbiddenErrorBus';

// Повторы одного и того же 403 (ретраи запросов react-query, несколько запросов экрана)
// схлопываем в одно уведомление в пределах окна.
const DEDUPE_WINDOW_MS = 15000;
// Метка «наше» уведомление — в messageArgs: прочие ключи NotificationOptions react-admin
// пробрасывает в Snackbar как DOM-атрибуты.
const MARKER = '_forbidden';

const isOurs = (n: NotificationPayload): boolean =>
  Boolean(n.notificationOptions?.messageArgs?.[MARKER]);

// Показывает текст бэка на 403 FORBIDDEN из dataProvider.request() (forbiddenErrorBus).
// react-admin сам уведомляет об ошибках List/мутаций тем же текстом (error.message) — такие
// дубли убираем из очереди уведомлений, чтобы человек не видел одно сообщение дважды подряд.
export const ForbiddenNotifier = () => {
  const notify = useNotify();
  const { notifications, setNotifications } = useNotificationContext();
  const recent = useRef(new Map<string, number>());

  useEffect(
    () =>
      subscribeForbiddenError(({ message, at }) => {
        const last = recent.current.get(message);
        recent.current.set(message, at);
        if (last !== undefined && at - last < DEDUPE_WINDOW_MS) return;
        notify(message, { type: 'error', messageArgs: { [MARKER]: true } });
      }),
    [notify],
  );

  useEffect(() => {
    const now = Date.now();
    const filtered = notifications.filter((n) => {
      if (isOurs(n) || typeof n.message !== 'string') return true;
      const seen = recent.current.get(n.message);
      return seen === undefined || now - seen >= DEDUPE_WINDOW_MS;
    });
    if (filtered.length !== notifications.length) setNotifications(filtered);
  }, [notifications, setNotifications]);

  return null;
};
