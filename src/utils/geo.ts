// Геометрия рабочих точек на клиенте — используется формой точки (workLocations.tsx) для
// предупреждения о пересечении зон (admin.md, shift_start_location_choice). Отдельного
// эндпоинта нет: расчёт делается по уже загруженному списку точек организации.

// Радиус Земли — совпадает с бэком (smenka_back/src/app/utils/geo.py, EARTH_RADIUS_METERS),
// чтобы «пересечение» на клиенте и «попадание в радиус» на сервере опирались на одну и ту
// же геометрию.
const EARTH_RADIUS_METERS = 6_371_000;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Haversine-расстояние между двумя точками в метрах. Формула идентична бэку
// (haversine_distance в smenka_back), намеренно не переиспользуется библиотека — формула
// короткая и должна быть видна в обоих репозиториях без внешней зависимости.
export const haversineDistanceMeters = (a: GeoPoint, b: GeoPoint): number => {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinHalfA =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(sinHalfA), Math.sqrt(1 - sinHalfA));

  return EARTH_RADIUS_METERS * c;
};

// Зоны пересекаются, когда расстояние между центрами МЕНЬШЕ суммы радиусов (admin.md:
// «расстояние между центрами меньше суммы радиусов»). Касание — расстояние ровно равно
// сумме радиусов — пересечением не считается: площадь перекрытия в этот момент нулевая.
export const zonesIntersect = (
  distanceMeters: number,
  radiusMetersA: number,
  radiusMetersB: number,
): boolean => distanceMeters < radiusMetersA + radiusMetersB;

export interface WorkLocationGeo {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface IntersectingLocation {
  id: string;
  name: string;
}

// Точки организации, чья зона пересекается с кандидатом (значения формы создания/редактирования
// точки). excludeId — id самой редактируемой точки: без исключения она всегда «пересекалась» бы
// сама с собой (расстояние 0 < сумма её же радиусов). При создании excludeId нет — у новой точки
// ещё нет id, и попасть в список загруженных точек организации она не может.
export const findIntersectingLocations = (
  candidate: GeoPoint & { radius_meters: number },
  locations: WorkLocationGeo[],
  excludeId?: string | null,
): IntersectingLocation[] =>
  locations
    .filter((location) => location.id !== excludeId)
    .filter((location) =>
      zonesIntersect(
        haversineDistanceMeters(candidate, location),
        candidate.radius_meters,
        location.radius_meters,
      ),
    )
    .map((location) => ({ id: location.id, name: location.name }));
