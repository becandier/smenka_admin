# Архитектура времени

API timestamps — UTC-моменты. Их отображение выполняется только через `src/utils/time.ts` с явным `TimeContext`.

- `organizationTime(IANA)` — события организации: смены, паузы, графики, чек-листы/фото, штрафы, начисления, ставки, payroll и тесты сотрудников. DTO-поле `organization_timezone` имеет приоритет; экран текущей организации — rolling fallback.
- `deviceTime()` — персональные и платформенные даты: аудит, пользователи, платежи, подписки и организации платформы.
- `utcBoundsForCalendarDay()` строит включительные UTC-границы календарного дня в переданном контексте. Он не предполагает 24 часа и корректен на DST-переходах.

Feature-код не создаёт `Intl.DateTimeFormat` и не вызывает date-local `toLocale*`. ESLint запрещает это вне `src/utils/time.ts`; `src/utils/dates.ts` остаётся низкоуровневым адаптером wall-time форм, а `format.ts`/`files.ts` содержат только числовую локализацию.

# Пересечение рабочих зон (WorkLocation)

Предупреждение о пересечении зон в форме точки (`shift_start_location_choice/admin.md`) считается на клиенте, без отдельного эндпоинта — `work-locations` уже ORG_CLIENT-ресурс (`providers/dataProvider.ts`), весь список точек организации грузится целиком.

- `src/utils/geo.ts` — чистая геометрия: `haversineDistanceMeters` (формула идентична бэку, `smenka_back/src/app/utils/geo.py`) и `zonesIntersect(distance, r1, r2) = distance < r1 + r2`. Касание (`distance === r1 + r2`) пересечением не считается.
- `findIntersectingLocations(candidate, locations, excludeId?)` — точки организации, чья зона пересекается с кандидатом. `excludeId` — id редактируемой точки, чтобы она не попадала в список пересечений сама с собой; при создании точки id ещё нет, исключать нечего.
- `LocationIntersectionWarning` (`src/resources/workLocations.tsx`) реактивно (react-hook-form `useWatch` на `latitude`/`longitude`/`radius_meters`) пересчитывает список и рендерит `Alert severity="warning"` с перечислением всех пересекающихся точек. Предупреждение не блокирует сохранение — валидацию полей не затрагивает.
