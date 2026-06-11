import polyglotI18nProvider from 'ra-i18n-polyglot';
import russianMessages from 'ra-language-russian';

// Базовый русский словарь react-admin + наши имена ресурсов (ед. |||| мн.).
const messages = {
  ...russianMessages,
  resources: {
    users: { name: 'Пользователь |||| Пользователи' },
    organizations: { name: 'Организация |||| Организации' },
    members: { name: 'Сотрудник |||| Сотрудники' },
    roles: { name: 'Роль |||| Роли' },
    'work-locations': { name: 'Точка |||| Точки' },
    'checklist-templates': { name: 'Чек-лист |||| Чек-листы' },
    'org-shifts': { name: 'Смена |||| Смены' },
    'audit-logs': { name: 'Аудит |||| Аудит' },
  },
};

export const i18nProvider = polyglotI18nProvider(() => messages, 'ru', [
  { locale: 'ru', name: 'Русский' },
]);
