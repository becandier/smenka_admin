// Справочник кодов аудита (security_hardening/backend.md). Источник правды по
// перечню — бэк; здесь только отображаемые лейблы для ленты и фильтра действий.

// action → человекочитаемый текст.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'org.update': 'Изменена организация',
  'org.delete': 'Удаление организации',
  'org.invite_rotate': 'Ротация инвайт-кода',
  'member.join': 'Вступление в организацию',
  'member.remove': 'Удаление участника',
  'member.role_update': 'Смена роли участника',
  'settings.update': 'Изменены настройки',
  'location.create': 'Создана точка',
  'location.update': 'Изменена точка',
  'location.delete': 'Удалена точка',
  'shift.finish': 'Завершение смены',
  'shift.auto_finish': 'Авто-завершение смены',
  'pause.auto_finish': 'Авто-закрытие паузы',
};

// resource_type → человекочитаемый тип объекта.
export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  organization: 'Организация',
  member: 'Участник',
  settings: 'Настройки',
  location: 'Точка',
  shift: 'Смена',
  pause: 'Пауза',
};

// Choices фильтра «Действие» — единый источник с AUDIT_ACTION_LABELS.
export const AUDIT_ACTION_CHOICES = Object.entries(AUDIT_ACTION_LABELS).map(([id, name]) => ({
  id,
  name,
}));

// Лейбл по коду; неизвестный код (новый на бэке) показываем как есть. Паттерн как у format.ts.
export const auditActionLabel = (action: string | null | undefined): string =>
  (action && AUDIT_ACTION_LABELS[action]) || action || '—';

export const auditResourceLabel = (type: string | null | undefined): string =>
  (type && AUDIT_RESOURCE_LABELS[type]) || type || '—';
