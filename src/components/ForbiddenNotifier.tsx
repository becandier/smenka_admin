import { useEffect, useRef } from 'react';
import { useNotificationContext, useNotify, type NotificationPayload } from 'react-admin';
import { subscribeForbiddenError } from '../providers/forbiddenErrorBus';

// Повторы одного и того же 403 (ретраи запросов react-query, несколько запросов экрана)
// схлопываем в одно уведомление в пределах окна. Окно фиксированное: отсчитывается от
// фактического показа, а не от последнего события — иначе серия 403 (двойной «Сохранить»)
// продлевала бы окно бесконечно и уведомление не появлялось бы вовсе.
const DEDUPE_WINDOW_MS = 15000;
// Метка «наше» уведомление — в messageArgs: прочие ключи NotificationOptions react-admin
// пробрасывает в Snackbar как DOM-атрибуты.
const MARKER = '_forbidden';

const isOurs = (n: NotificationPayload): boolean =>
  Boolean(n.notificationOptions?.messageArgs?.[MARKER]);

// Показывает текст бэка на 403 FORBIDDEN из dataProvider.request() (forbiddenErrorBus).
// react-admin сам уведомляет об ошибках List/мутаций тем же текстом (error.message) — такой
// дубль убираем из очереди, только пока наше уведомление с тем же текстом тоже в очереди.
export const ForbiddenNotifier = () => {
  const notify = useNotify();
  const { notifications, setNotifications } = useNotificationContext();
  const shownAt = useRef(new Map<string, number>());

  useEffect(
    () =>
      subscribeForbiddenError(({ message, at }) => {
        const last = shownAt.current.get(message);
        if (last !== undefined && at - last < DEDUPE_WINDOW_MS) return;
        shownAt.current.set(message, at);
        notify(message, { type: 'error', messageArgs: { [MARKER]: true } });
      }),
    [notify],
  );

  useEffect(() => {
    const ours = new Set(
      notifications
        .filter((n) => isOurs(n) && typeof n.message === 'string')
        .map((n) => n.message as string),
    );
    if (ours.size === 0) return;
    const filtered = notifications.filter(
      (n) => isOurs(n) || typeof n.message !== 'string' || !ours.has(n.message),
    );
    if (filtered.length !== notifications.length) setNotifications(filtered);
  }, [notifications, setNotifications]);

  return null;
};
