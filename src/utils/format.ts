// Форматирование рабочего времени из секунд в «Чч Ммин».
export const formatDuration = (seconds: number | null | undefined): string => {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0 && minutes === 0) return '0 мин';
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  return parts.join(' ');
};

export const SHIFT_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  paused: 'На паузе',
  finished: 'Завершена',
};

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  pending: 'Не заполнен',
  completed: 'Заполнен',
  incomplete: 'Не завершён',
};

export const shiftStatusLabel = (status: string | null | undefined): string =>
  (status && SHIFT_STATUS_LABELS[status]) || status || '—';

export const checklistStatusLabel = (status: string | null | undefined): string =>
  (status && CHECKLIST_STATUS_LABELS[status]) || status || '—';
