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
    // Переименовано в «Шаблоны чек-листов» (checklist_reports/admin.md) — маршрут
    // /checklist-templates не меняем, меняются только заголовки/крошки.
    'checklist-templates': { name: 'Шаблон чек-листа |||| Шаблоны чек-листов' },
    // Новый реестр заполненных/незаполненных экземпляров чек-листов (checklist_reports).
    'checklist-instances': { name: 'Чек-лист |||| Чек-листы' },
    'org-shifts': { name: 'Смена |||| Смены' },
    'penalty-templates': { name: 'Шаблон штрафа |||| Шаблоны штрафов' },
    'audit-logs': { name: 'Аудит |||| Аудит' },
  },
};

export const i18nProvider = polyglotI18nProvider(() => messages, 'ru', [
  { locale: 'ru', name: 'Русский' },
]);
