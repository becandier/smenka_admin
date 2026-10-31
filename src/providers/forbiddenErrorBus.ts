// Шина «получили 403 FORBIDDEN» (access_profiles/admin.md, «403 от API»). dataProvider.request()
// — единственное место с конвертом {data,error} — репортит сюда текст бэка («Недостаточно прав:
// требуется «…» — …»), а ForbiddenNotifier в Layout показывает его уведомлением. Так текст
// виден и там, где компонент сам глотает ошибку (useDataProvider + catch), без локальных
// обработчиков в каждом экране. Тот же приём, что tariffErrorBus для 402.
export interface ForbiddenErrorEvent {
  message: string;
  at: number;
}

type Listener = (event: ForbiddenErrorEvent) => void;

const listeners = new Set<Listener>();

export const reportForbiddenError = (
  status: number,
  code: string | undefined,
  message: string,
): void => {
  if (status !== 403 || code !== 'FORBIDDEN') return;
  const event: ForbiddenErrorEvent = { message, at: Date.now() };
  listeners.forEach((listener) => listener(event));
};

export const subscribeForbiddenError = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
