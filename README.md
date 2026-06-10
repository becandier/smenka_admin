# smenka_admin

Веб-админка Smenka на **react-admin (MUI)**. Потребляет REST API `smenka_back` (`/api/v1`, JWT Bearer, конверт `{data, error}`).

Полное ТЗ: `smenka/docs/tasks/admin_panel/admin.md`. Контракт ошибок: `smenka/docs/ERROR_FORMAT.md`.

## Статус

**Фаза 1 (каркас)** — платформенная консоль super_admin:

- Авторизация (JWT) через `authProvider`
- Кастомный `dataProvider` под конверт `{data,error}` + серверная пагинация `limit/offset/total`
- Dashboard (`GET /admin/stats`)
- Ресурсы: **users** (список/смена роли), **organizations** (список/создание)

**Фаза 2 (TODO)** — org-кабинет owner/admin: members, roles, work-locations, checklist-templates, settings, org-shifts, org-stats.

## Стек

React 18 · Vite 5 · TypeScript · react-admin 5 · MUI 5.

## Разработка

```bash
cp .env.example .env        # VITE_API_BASE_URL → ваш бэк
npm install
npm run dev                 # http://localhost:5173
npm run build               # typecheck + сборка в dist/
```

Бэк должен разрешать CORS для origin админки (Блок A фичи admin_panel в `smenka_back`).

## Структура

```
src/
├── App.tsx                 # <Admin> + ресурсы
├── config.ts               # baseUrl + хранение токенов
├── providers/
│   ├── dataProvider.ts     # {data,error} + limit/offset/total + пути per-resource
│   └── authProvider.ts     # JWT login/refresh/logout, getIdentity/getPermissions
├── resources/              # users, organizations
├── dashboard/Dashboard.tsx # глобальная статистика
└── theme.ts                # MUI, primary #4A90D9
```

## Деплой

CI собирает образ `ghcr.io/becandier/smenka_admin` (`release.yml`, build-arg `VITE_API_BASE_URL`). Прод-стек (сервис `admin`, маршрут `admin.<domain>`) — в `smenka_back/docker-compose.prod.yml`. Автодеплой выключен до появления VPS.
