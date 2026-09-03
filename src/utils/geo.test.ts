import { describe, expect, it } from 'vitest';
import { findIntersectingLocations, haversineDistanceMeters, zonesIntersect } from './geo';

describe('haversineDistanceMeters', () => {
  it('is zero for identical coordinates', () => {
    const point = { latitude: 55.7558, longitude: 37.6173 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('matches the known straight-line distance between Moscow and Saint Petersburg (~630-635 km)', () => {
    const moscow = { latitude: 55.7558, longitude: 37.6173 };
    const spb = { latitude: 59.9311, longitude: 30.3609 };
    const distance = haversineDistanceMeters(moscow, spb);
    expect(distance).toBeGreaterThan(625_000);
    expect(distance).toBeLessThan(640_000);
  });
});

// zonesIntersect проверяется на «сырых» расстояниях (не через haversine) — граница «касаются»
// требует точного сравнения с суммой радиусов, а transcendental-функции (sin/cos/atan2) не
// гарантируют бит-в-бит попадание в конкретное значение при обратном пересчёте координат.
describe('zonesIntersect', () => {
  it('overlapping zones (distance < sum of radii)', () => {
    expect(zonesIntersect(140, 100, 50)).toBe(true);
  });

  it('touching zones (distance === sum of radii) do not count as intersecting', () => {
    expect(zonesIntersect(150, 100, 50)).toBe(false);
  });

  it('separate zones (distance > sum of radii)', () => {
    expect(zonesIntersect(200, 100, 50)).toBe(false);
  });
});

describe('findIntersectingLocations', () => {
  const office = {
    id: 'office',
    name: 'Офис',
    latitude: 55.7558,
    longitude: 37.6173,
    radius_meters: 100,
  };
  // ~70 м восточнее office на широте 55.7558° (111_320 м в градусе долготы * cos(55.7558°) ≈ 62.6 м/0.001°).
  const warehouseNearby = {
    id: 'warehouse',
    name: 'Склад',
    latitude: 55.7558,
    longitude: 37.6184,
    radius_meters: 50,
  };
  // Далеко — Санкт-Петербург, никакого пересечения ни при каком разумном радиусе.
  const farAway = {
    id: 'far',
    name: 'Филиал СПб',
    latitude: 59.9311,
    longitude: 30.3609,
    radius_meters: 100,
  };

  it('finds a zone that overlaps with the candidate', () => {
    const result = findIntersectingLocations(
      { latitude: office.latitude, longitude: office.longitude, radius_meters: 100 },
      [warehouseNearby, farAway],
    );
    expect(result).toEqual([{ id: 'warehouse', name: 'Склад' }]);
  });

  it('lists every intersecting zone, not just the first one', () => {
    const secondNearby = { ...warehouseNearby, id: 'kiosk', name: 'Киоск' };
    const result = findIntersectingLocations(
      { latitude: office.latitude, longitude: office.longitude, radius_meters: 100 },
      [warehouseNearby, secondNearby, farAway],
    );
    expect(result.map((r) => r.id).sort()).toEqual(['kiosk', 'warehouse']);
  });

  it('returns nothing when zones do not overlap', () => {
    const result = findIntersectingLocations(
      { latitude: office.latitude, longitude: office.longitude, radius_meters: 100 },
      [farAway],
    );
    expect(result).toEqual([]);
  });

  it('does not treat a location as intersecting with itself when editing (excludeId)', () => {
    // Редактируется сама точка office: она присутствует в загруженном списке организации
    // с теми же координатами (расстояние 0 — заведомо «пересекается» без исключения).
    const result = findIntersectingLocations(
      { latitude: office.latitude, longitude: office.longitude, radius_meters: 100 },
      [office, warehouseNearby],
      office.id,
    );
    expect(result).toEqual([{ id: 'warehouse', name: 'Склад' }]);
  });

  it('without excludeId (create), a coincidentally identical point is a real intersection', () => {
    const result = findIntersectingLocations(
      { latitude: office.latitude, longitude: office.longitude, radius_meters: 100 },
      [office],
    );
    expect(result).toEqual([{ id: 'office', name: 'Офис' }]);
  });
});
